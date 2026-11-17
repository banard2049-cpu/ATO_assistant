(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ATO_GEAR_INVENTORY = api;
})(typeof window === 'object' ? window : this, function () {
  'use strict';

  const CYCLES = ['c1', 'c2', 'c3', 'c4', 'c5'];

  function gearKey(value) {
    const id = String(value || '').trim().replace(/^1x/i, '');
    const gear = /^([A-Z]J\d+)(?:@(c[2-5]))?$/i.exec(id);
    if (gear) return gear[1].toUpperCase() + (gear[2] ? '@' + gear[2].toLowerCase() : '');
    if (/^T:tt_[a-z0-9_]+$/i.test(id)) return 'T:' + id.slice(2).toLowerCase();
    return '';
  }

  function baseGearId(id) {
    return String(id || '').split('@', 1)[0];
  }

  function ascendedCycle(id) {
    return gearKey(id).split('@')[1] || '';
  }

  function nextCycle(cycle) {
    const index = CYCLES.indexOf(cycle);
    return index < 0 ? '' : CYCLES[index + 1] || '';
  }

  function isAvailable(item, cycle) {
    const current = CYCLES.indexOf(cycle);
    const gearCycle = CYCLES.indexOf(item.ascendedCycle || item.originCycle);
    return current >= 0 && gearCycle >= 0 && (gearCycle >= current
      || (gearCycle === current - 1 && !item.ascendedCycle && item.printedAscended === true));
  }

  function count(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(number))) : 0;
  }

  function normalize(value) {
    const inventory = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return inventory;
    for (const [rawId, record] of Object.entries(value)) {
      const id = gearKey(rawId);
      if (!id || !record || typeof record !== 'object' || Array.isArray(record)) continue;
      const previous = inventory[id] || { quantity: 0, manufactured: 0 };
      inventory[id] = {
        quantity: count(previous.quantity + count(record.quantity)),
        manufactured: count(previous.manufactured + count(record.manufactured)),
      };
    }
    return inventory;
  }

  // Keep zero-quantity entries to retain manufacturing history after stock runs out.
  // Manual corrections only change stock; manufacturing also updates its total.
  function adjust(value, gearId, delta, manufactured = false) {
    const id = gearKey(gearId);
    if (!id || !Number.isSafeInteger(delta) || delta === 0 || (manufactured && delta < 0)) {
      throw new Error('装备或数量无效');
    }
    const inventory = normalize(value);
    const record = inventory[id] || { quantity: 0, manufactured: 0 };
    const quantity = record.quantity + delta;
    const total = record.manufactured + (manufactured ? delta : 0);
    if (!Number.isSafeInteger(quantity) || !Number.isSafeInteger(total)) throw new Error('装备数量过大');
    inventory[id] = { quantity: Math.max(0, quantity), manufactured: total };
    return inventory;
  }

  function ascend(value, gearId, originCycle, reserved = 0) {
    const id = gearKey(gearId);
    const target = nextCycle(ascendedCycle(id) || originCycle);
    const inventory = normalize(value);
    if (!id || id.startsWith('T:') || !target) throw new Error('这件装备无法再登升。');
    const source = inventory[id];
    if (!source?.quantity) throw new Error('这件装备没有库存。');
    if (source.quantity <= reserved) throw new Error('库存已分配给主要配装，请先卸下一件。');
    const destination = baseGearId(id) + '@' + target;
    const next = adjust(inventory, destination, 1);
    next[id].quantity -= 1;
    return next;
  }

  return { gearKey, baseGearId, ascendedCycle, nextCycle, isAvailable, normalize, adjust, ascend };
});
