(function (root) {
  'use strict';

  const exitLength = 4;
  const entryLength = 7;
  // The head's tip stops half a pixel inside the card's top edge: the cards paint
  // over the connector layer, so any further tuck clips the point into a flat
  // trapezoid, while stopping short leaves a hairline gap. Half a pixel is
  // invisible on both counts — the point still reads as touching the border.
  const arrowInset = 0.5;

  function createRouter(positions, width, height, { allowUp = false, verticalFirst = null } = {}) {
    const margin = 5;
    const rects = [...positions.values()].map(point => ({
      left: point.x - margin, right: point.x + width + margin,
      top: point.y - margin, bottom: point.y + height + exitLength,
    }));
    const xs = [...new Set(rects.flatMap(rect => [rect.left, rect.right]).concat(
      [...positions.values()].map(point => point.x + width / 2),
    ))].sort((a, b) => a - b);
    const ys = [...new Set([...positions.values()].flatMap(point => [point.y - entryLength, point.y + height + exitLength]))].sort((a, b) => a - b);
    const cols = xs.length;
    const valid = [];
    const horizontal = [];
    const vertical = [];
    const used = new Map();
    for (let row = 0; row < ys.length; row++) {
      for (let col = 0; col < cols; col++) {
        const id = row * cols + col;
        const x = xs[col], y = ys[row];
        valid[id] = !rects.some(r => r.left < x && x < r.right && r.top < y && y < r.bottom);
        horizontal[id] = col + 1 < cols && !rects.some(r => r.top < y && y < r.bottom && x < r.right && xs[col + 1] > r.left);
        vertical[id] = row + 1 < ys.length && !rects.some(r => r.left < x && x < r.right && y < r.bottom && ys[row + 1] > r.top);
      }
    }
    const coordinate = id => [xs[id % cols], ys[Math.floor(id / cols)]];
    const segmentKey = (a, b) => `${Math.min(a, b)}:${Math.max(a, b)}`;
    function route(source, target, linkIndex) {
      const a = positions.get(source), b = positions.get(target);
      const sourceX = a.x + width / 2, targetX = b.x + width / 2;
      const start = ys.indexOf(a.y + height + exitLength) * cols + xs.indexOf(sourceX);
      const end = ys.indexOf(b.y - entryLength) * cols + xs.indexOf(targetX);
      const [endX, endY] = coordinate(end);
      const distances = new Map([[start * 2 + 1, 0]]);
      const parents = new Map();
      const queue = [{ state: start * 2 + 1, score: 0, cost: 0 }];
      while (queue.length) {
        let index = 0;
        for (let i = 1; i < queue.length; i++) if (queue[i].score < queue[index].score) index = i;
        const { state, cost } = queue.splice(index, 1)[0];
        if (distances.get(state) !== cost) continue;
        const id = Math.floor(state / 2), dir = state % 2;
        if (id === end) {
          const path = [];
          for (let s = state; s !== undefined; s = parents.get(s)) path.push(Math.floor(s / 2));
          path.reverse();
          for (let i = 1; i < path.length; i++) {
            const key = segmentKey(path[i - 1], path[i]);
            if (!used.has(key)) used.set(key, []);
            used.get(key).push([source, target]);
          }
          return path.map(coordinate);
        }
        const [x, y] = coordinate(id);
        const next = [
          [id - 1, 0, id % cols !== 0 && horizontal[id - 1]],
          [id + 1, 0, horizontal[id]],
          [id + cols, 1, vertical[id]],
          [id - cols, 1, allowUp && vertical[id - cols]],
        ];
        for (const [neighbor, axis, clear] of next) {
          if (!clear || !valid[neighbor]) continue;
          // A cross-edition run must descend its own column first and only cut
          // across at the target's row. Forbid sideways steps that close in on
          // the target's x while the run is still far above it, so a source whose
          // straight-down channel is blocked (HYPERTIME_ORACLE:9 sits above the
          // MEDUKETOS wall) detours sideways by the smallest margin instead of
          // darting across the whole sheet to the nearest left corridor.
          const vf = verticalFirst && verticalFirst.has(linkIndex);
          const neighborX = coordinate(neighbor)[0];
          if (vf && axis === 0 && Math.abs(endY - y) > 300 && Math.abs(endX - neighborX) < Math.abs(endX - x)) continue;
          const [nx, ny] = coordinate(neighbor);
          const distance = Math.abs(x - nx) + Math.abs(y - ny);
          const shared = used.get(segmentKey(id, neighbor));
          // Only a fan-out (several edges leaving one node) shares its start for
          // free. Fan-ins (several edges entering one node) must each find their
          // own way down, so a right-most source is not dragged across the whole
          // sheet just to merge with a co-target's channel before the target row.
          const related = shared?.every(([from]) => from === source);
          const newCost = cost + distance * (related ? .65 : 1) + (axis === dir ? 0 : 20)
            + (shared && !related ? 40 + distance : 0);
          const nextState = neighbor * 2 + axis;
          if (distances.has(nextState) && distances.get(nextState) <= newCost) continue;
          distances.set(nextState, newCost);
          parents.set(nextState, state);
          queue.push({ state: nextState, cost: newCost, score: newCost + .65 * (Math.abs(endX - nx) + Math.abs(endY - ny)) });
        }
      }
      return null;
    }
    return { route };
  }

  function lineSegments(points) {
    const segments = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const axis = a[0] === b[0] ? 1 : 0;
      if (a[axis] === b[axis]) continue;
      const previous = segments.at(-1);
      if (previous?.axis === axis && Math.sign(previous.end - previous.start) === Math.sign(b[axis] - a[axis])) {
        previous.end = b[axis];
      } else {
        segments.push({ axis, fixed: a[1 - axis], start: a[axis], end: b[axis] });
      }
    }
    return segments;
  }

  // Draw each common stretch once. Break paths at junctions so a rounded bend
  // cannot pull a shared line away from the branch that joins it.
  function mergeRoutes(routes) {
    const lines = new Map();
    routes.forEach(({ points }, index) => {
      if (!points) return;
      for (const { axis, fixed, start, end } of lineSegments(points)) {
        const key = `${axis}:${fixed}`;
        if (!lines.has(key)) lines.set(key, { axis, fixed, intervals: [] });
        lines.get(key).intervals.push({ start: Math.min(start, end), end: Math.max(start, end), index });
      }
    });
    const sections = [];
    const adjacent = new Map();
    for (const { axis, fixed, intervals } of lines.values()) {
      const stops = [...new Set(intervals.flatMap(({ start, end }) => [start, end]))].sort((a, b) => a - b);
      const point = value => axis ? [fixed, value] : [value, fixed];
      for (let i = 1; i < stops.length; i++) {
        const start = stops[i - 1], end = stops[i];
        const links = intervals.filter(interval => interval.start <= start && interval.end >= end).map(interval => interval.index).sort((a, b) => a - b);
        if (!links.length) continue;
        const section = { points: [point(start), point(end)], links, key: links.join(',') };
        sections.push(section);
        for (const endpoint of section.points) {
          const key = endpoint.join(',');
          if (!adjacent.has(key)) adjacent.set(key, []);
          adjacent.get(key).push(section);
        }
      }
    }
    const visited = new Set();
    const paths = [];
    for (const section of sections) {
      if (visited.has(section)) continue;
      visited.add(section);
      const points = [...section.points];
      for (const side of [0, -1]) {
        while (true) {
          const key = points.at(side).join(',');
          const neighbors = adjacent.get(key);
          if (neighbors.length !== 2) break;
          const next = neighbors.find(other => other.key === section.key && !visited.has(other));
          if (!next) break;
          visited.add(next);
          const point = next.points.find(endpoint => endpoint.join(',') !== key);
          if (side === 0) points.unshift(point);
          else points.push(point);
        }
      }
      paths.push({ points, links: section.links });
    }
    return paths;
  }

  function buildConnections(positions, width, height, links, options = {}) {
    const router = createRouter(positions, width, height, options);
    const entries = new Map(), exits = new Map();
    const routes = links.map(([source, target], index) => {
      const a = positions.get(source), b = positions.get(target);
      const sourceX = a && a.x + width / 2, targetX = b && b.x + width / 2;
      const startY = a && a.y + height + exitLength, endY = b && b.y - entryLength;
      if (a) {
        if (!exits.has(source)) exits.set(source, { d: `M ${sourceX} ${a.y + height} V ${startY}`, links: [] });
        exits.get(source).links.push(index);
      }
      if (b) {
        if (!entries.has(target)) entries.set(target, { d: `M ${targetX} ${endY} V ${b.y + arrowInset}`, links: [], arrow: true });
        entries.get(target).links.push(index);
      }
      const points = a && b ? router.route(source, target, index) : a
        ? [[sourceX, startY], [sourceX + 16, startY]]
        : [[targetX - 16, endY], [targetX, endY]];
      return { points };
    });
    const sections = mergeRoutes(routes);
    const paths = edgePaths(sections.map(section => section.points));
    return [...sections.map((section, i) => ({ d: paths[i], links: section.links })), ...exits.values(), ...entries.values()];
  }

  // Round bends and leave a small gap under perpendicular crossings.
  function edgePaths(routes) {
    const edges = routes.map(lineSegments);
    const contains = (segment, point, clearance = 0) => Math.min(segment.start, segment.end) + clearance < point
      && point < Math.max(segment.start, segment.end) - clearance;
    const pair = (segment, value) => segment.axis ? `${segment.fixed} ${value}` : `${value} ${segment.fixed}`;
    const length = segment => Math.abs(segment.end - segment.start);
    const direction = segment => Math.sign(segment.end - segment.start);
    const rounded = edges.map(segments => {
      const radii = segments.slice(1).map((next, i) => Math.max(0, Math.min(5, length(segments[i]) / 2, length(next) / 2,
        i === segments.length - 2 ? length(next) - 6 : Infinity)));
      return segments.map((segment, i) => ({
        ...segment,
        start: segment.start + direction(segment) * (radii[i - 1] || 0),
        end: segment.end - direction(segment) * (radii[i] || 0),
        corner: pair(segment, segment.end),
      }));
    });
    return rounded.map((segments, index) => segments.map((segment, i) => {
      const dir = direction(edges[index][i]);
      const crossings = rounded.slice(index + 1).flatMap(other => other.filter(cross => cross.axis !== segment.axis
        && contains(cross, segment.fixed) && contains(segment, cross.fixed, 4)
        && (i !== segments.length - 1 || Math.abs(segment.end - cross.fixed) > 9)).map(cross => cross.fixed));
      const breaks = [...new Set(crossings)].sort((a, b) => (a - b) * dir);
      const gaps = [];
      for (const crossing of breaks) {
        const near = crossing - dir * 3, far = crossing + dir * 3;
        const previous = gaps.at(-1);
        if (previous && (near - previous[1]) * dir <= 0) previous[1] = far;
        else gaps.push([near, far]);
      }
      let path = i === 0 ? `M ${pair(segment, segment.start)}` : '';
      for (const [near, far] of gaps) path += ` L ${pair(segment, near)} M ${pair(segment, far)}`;
      path += ` L ${pair(segment, segment.end)}`;
      const next = segments[i + 1];
      if (next && segment.corner !== pair(next, next.start)) {
        path += ` Q ${segment.corner} ${pair(next, next.start)}`;
      }
      return path;
    }).join(''));
  }

  const api = { createRouter, edgePaths, buildConnections, metrics: { exitLength, entryLength, arrowInset } };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ATO_THEATRE_GRAPH = api;
})(typeof window === 'object' ? window : globalThis);
