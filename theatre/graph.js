(function (root) {
  'use strict';

  const exitLength = 1;
  const entryLength = 6;
  // The head's tip stops half a pixel inside the card's top edge: the cards paint
  // over the connector layer, so any further tuck clips the point into a flat
  // trapezoid, while stopping short leaves a hairline gap. Half a pixel is
  // invisible on both counts — the point still reads as touching the border.
  const arrowInset = 0.5;

  const columnCount = 5;

  function rankEdition(nodes) {
    const byId = new Map(nodes.map(node => [node.id, node]));
    const parents = new Map(nodes.map(node => [node.id, node.prerequisites.filter(id => byId.has(id))]));
    const children = new Map(nodes.map(node => [node.id, []]));
    for (const [id, required] of parents) for (const from of required) children.get(from).push(id);
    const ranks = new Map();
    const rows = [];
    function place(id) {
      if (ranks.has(id)) return ranks.get(id);
      let row = 1 + Math.max(-1, ...parents.get(id).map(place));
      while (rows[row]?.size >= columnCount) row++;
      rows[row] ??= new Set();
      rows[row].add(id);
      ranks.set(id, row);
      return row;
    }
    for (const node of nodes) place(node.id);

    // Move branches with slack down towards their first dependent.
    for (const [id, row] of [...ranks].sort((a, b) => b[1] - a[1])) {
      const next = children.get(id);
      if (!next.length) continue;
      let last = Math.min(...next.map(child => ranks.get(child))) - 1;
      while (last > row && rows[last]?.size >= columnCount) last--;
      if (last <= row) continue;
      rows[row].delete(id);
      rows[last] ??= new Set();
      rows[last].add(id);
      ranks.set(id, last);
    }
    return rows.filter(row => row?.size).map(row => nodes.filter(node => row.has(node.id))
      .sort((a, b) => a.position.x - b.position.x).map(node => node.id));
  }

  function arrangeColumns(rows, links) {
    const points = new Map();
    const slots = rows.map((ids, y) => {
      const line = Array(columnCount).fill(null);
      const start = Math.floor((columnCount - ids.length) / 2);
      for (const [index, id] of ids.entries()) {
        const x = start + index;
        const point = { x, y, edges: [] };
        points.set(id, point);
        line[x] = point;
      }
      return line;
    });
    const edges = links.map(([source, target]) => {
      const from = points.get(source), to = points.get(target);
      const edge = { from, to, conflicts: [], span: to.y - from.y };
      from.edges.push(edge);
      to.edges.push(edge);
      return edge;
    });
    for (const edge of edges) {
      for (const other of edges) {
        const length = Math.min(edge.to.y, other.to.y) - Math.max(edge.from.y, other.from.y);
        if (length > 0 && edge.from !== other.from && edge.to !== other.to) {
          edge.conflicts.push({ other, length });
        }
      }
    }
    // Favour short sideways runs, especially between adjacent rows. Reserve a
    // straight column for unrelated links when their vertical spans coincide.
    function cost(changed) {
      let total = 0;
      for (const { from, to, conflicts, span } of changed) {
        const offset = Math.abs(to.x - from.x);
        if (offset) {
          total += offset * (1 + 1 / span) + .25;
          continue;
        }
        for (const { other, length } of conflicts) {
          if (other.from.x === from.x && other.to.x === from.x) {
            total += length * (changed.includes(other) ? .25 : .5);
          }
        }
      }
      return total;
    }
    const rowOrder = [...slots.keys()];
    for (let pass = 0; pass < 8; pass++, rowOrder.reverse()) {
      let moved = false;
      for (const y of rowOrder) {
        const line = slots[y];
        for (let a = 0; a < columnCount - 1; a++) {
          for (let b = a + 1; b < columnCount; b++) {
            const left = line[a], right = line[b];
            if (!left && !right) continue;
            const changed = [...(left?.edges ?? []), ...(right?.edges ?? [])];
            const before = cost(changed);
            if (left) left.x = b;
            if (right) right.x = a;
            if (cost(changed) < before - 1e-5) {
              [line[a], line[b]] = [right, left];
              moved = true;
            } else {
              if (left) left.x = a;
              if (right) right.x = b;
            }
          }
        }
      }
      if (!moved) break;
    }
    return points;
  }

  function createTreeLayout(nodes, width, height) {
    const rows = ['core', 'expansion'].flatMap(edition => rankEdition(nodes.filter(node => node.edition === edition)));
    return visible => {
      const visibleRows = rows.map(row => row.filter(id => visible.has(id))).filter(row => row.length);
      if (!visibleRows.length) return { width: 460, height: 48, positions: new Map(), links: [] };
      const links = nodes.filter(node => visible.has(node.id)).flatMap(node =>
        node.prerequisites.filter(id => visible.has(id)).map(id => [id, node.id]));
      const points = arrangeColumns(visibleRows, links);
      const columns = [...new Set([...points.values()].map(point => point.x))].sort((a, b) => a - b);
      const gutter = 18;
      const columnStep = width + 14;
      const rowStep = height + 13;
      const positions = new Map([...points].map(([id, point]) => [id, {
        x: gutter + columns.indexOf(point.x) * columnStep,
        y: gutter + point.y * rowStep,
      }]));
      return {
        width: 2 * gutter + width + (columns.length - 1) * columnStep,
        height: 2 * gutter + height + (visibleRows.length - 1) * rowStep,
        positions,
        links,
      };
    };
  }

  function createRouter(positions, width, height, { allowUp = false } = {}) {
    const sideMargin = 2;
    const rects = [...positions.values()].map(point => ({
      left: point.x - sideMargin, right: point.x + width + sideMargin,
      top: point.y - 5, bottom: point.y + height + exitLength,
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
    const traffic = [new Map(), new Map()];
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
    const nearbyTracks = [ys, xs].map(tracks => tracks.map((position, index) =>
      tracks.flatMap((other, candidate) => candidate !== index && Math.abs(other - position) <= 10 ? [candidate] : [])));

    function mark(path, link, occupied) {
      function update(map, key) {
        if (occupied) {
          if (!map.has(key)) map.set(key, new Set());
          map.get(key).add(link);
        } else {
          const links = map.get(key);
          links?.delete(link);
          if (links?.size === 0) map.delete(key);
        }
      }
      for (let i = 1; i < path.length; i++) {
        const from = path[i - 1], to = path[i];
        const axis = Math.abs(from - to) === cols ? 1 : 0;
        update(used, segmentKey(from, to));
        update(traffic[axis], from);
        update(traffic[axis], to);
      }
    }

    function findRoute([source, target]) {
      const a = positions.get(source), b = positions.get(target);
      const sourceX = a.x + width / 2, targetX = b.x + width / 2;
      const start = ys.indexOf(a.y + height + exitLength) * cols + xs.indexOf(sourceX);
      const end = ys.indexOf(b.y - entryLength) * cols + xs.indexOf(targetX);
      const [endX, endY] = coordinate(end);
      const distances = new Map([[start * 2 + 1, 0]]);
      const parents = new Map();
      const queue = [{ state: start * 2 + 1, score: 0, cost: 0 }];
      const unrelated = ([from, to]) => from !== source && to !== target;
      while (queue.length) {
        let index = 0;
        for (let i = 1; i < queue.length; i++) if (queue[i].score < queue[index].score) index = i;
        const { state, cost } = queue.splice(index, 1)[0];
        if (distances.get(state) !== cost) continue;
        const id = Math.floor(state / 2), dir = state % 2;
        if (id === end) {
          const path = [];
          for (let s = state; s !== undefined; s = parents.get(s)) path.push(Math.floor(s / 2));
          return path.reverse();
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
          const [nx, ny] = coordinate(neighbor);
          const distance = Math.abs(x - nx) + Math.abs(y - ny);
          const shared = [...(used.get(segmentKey(id, neighbor)) ?? [])];
          const track = axis === 0 ? Math.floor(id / cols) : id % cols;
          const parallel = nearbyTracks[axis][track].some(other => {
            const offset = (other - track) * (axis === 0 ? cols : 1);
            return used.has(segmentKey(id + offset, neighbor + offset));
          });
          // Forks and joins can share their approach. Steer unrelated links
          // away from shared segments and nearby parallel tracks.
          const overlap = shared.some(unrelated);
          const crossing = [...(traffic[1 - axis].get(neighbor) ?? [])].some(unrelated);
          const fanOut = shared.length && shared.every(([from]) => from === source);
          const changesTrack = axis === 1 && dir === 0 && distance <= 6 && neighbor !== end;
          const newCost = cost + distance * (fanOut ? .65 : 1) + (axis === dir ? 0 : 20)
            + (overlap ? 300 + distance : 0) + (crossing ? 85 : 0) + (parallel ? 2 * distance : 0)
            + (changesTrack ? 175 : 0);
          const nextState = neighbor * 2 + axis;
          if (distances.has(nextState) && distances.get(nextState) <= newCost) continue;
          distances.set(nextState, newCost);
          parents.set(nextState, state);
          queue.push({ state: nextState, cost: newCost, score: newCost + .65 * (Math.abs(endX - nx) + Math.abs(endY - ny)) });
        }
      }
      return null;
    }

    function reserve(link, previous) {
      if (previous) mark(previous, link, false);
      const path = findRoute(link) ?? previous;
      if (path) mark(path, link, true);
      return path;
    }

    function routeAll(links) {
      const paths = links.map(link => link.every(id => positions.has(id)) ? reserve(link) : null);
      // Revisit early choices once the entire graph is occupied.
      for (let pass = 0; pass < 2; pass++) {
        for (let i = paths.length - 1; i >= 0; i--) {
          if (paths[i]) paths[i] = reserve(links[i], paths[i]);
        }
      }
      return paths.map(path => path?.map(coordinate) ?? null);
    }
    return { routeAll };
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
    const routed = createRouter(positions, width, height, options).routeAll(links);
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
      const points = a && b ? routed[index] : a
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

  const api = { createTreeLayout, createRouter, edgePaths, buildConnections, metrics: { exitLength, entryLength, arrowInset } };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ATO_THEATRE_GRAPH = api;
})(typeof window === 'object' ? window : globalThis);
