(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./gear-inventory.js'));
  else root.ATO_ARSENAL_LOADOUT = factory(root.ATO_GEAR_INVENTORY);
})(typeof window === 'object' ? window : this, function (inventory) {
  'use strict';

  const SLOT_COUNT = 4;
  const idText = value => typeof value === 'string' ? value.trim() : '';

  function equipmentId(value) {
    const id = inventory.gearKey(value);
    return id.startsWith('T:') ? '' : id;
  }

  function normalizeEquipment(value) {
    return Array.isArray(value) ? [...new Set(value.map(equipmentId).filter(Boolean))] : [];
  }

  function normalizeSlot(slot) {
    const sides = new Map();
    for (const side of Array.isArray(slot?.sides) ? slot.sides : []) {
      const id = idText(side?.id);
      if (id && !sides.has(id)) sides.set(id, { id, name: idText(side.name).slice(0, 60), equipment: normalizeEquipment(side.equipment) });
    }
    return { titanId: idText(slot?.titanId), equipment: normalizeEquipment(slot?.equipment),
      ...(sides.size ? { sides: [...sides.values()] } : {}) };
  }

  function normalize(value) {
    const slots = Array.from({ length: SLOT_COUNT }, (_, index) => normalizeSlot(value?.slots?.[index]));
    const presets = new Map();
    for (const preset of Array.isArray(value?.presets) ? value.presets : []) {
      const id = idText(preset?.id), name = idText(preset?.name);
      const owner = Number.isInteger(preset?.owner) && preset.owner >= 0 && preset.owner < SLOT_COUNT ? { owner: preset.owner } : {};
      if (id && name && name.length <= 60 && !presets.has(id)) presets.set(id, { id, name, ...owner, ...normalizeSlot(preset) });
    }
    return { slots, presets: [...presets.values()] };
  }


  function equipmentCounts(slots) {
    const counts = new Map();
    for (const { equipment } of slots) {
      for (const id of equipment) counts.set(id, (counts.get(id) || 0) + 1);
    }
    return counts;
  }

  // Match alternate printings by the same English card name, as in the TTS planner.
  function cardKey(id, gearNames) {
    return String(gearNames?.get(id) || id).replace(/[‘’ʼ`′]/g, "'").replace(/[“”″]/g, '"')
      .toLowerCase().split('/').map(part => part.replace(/[()]/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean).sort().join('|');
  }

  function canEquip(slot, gearId, gearNames) {
    const identity = cardKey(gearId, gearNames);
    if (slot.equipment.some(id => id === gearId || cardKey(id, gearNames) === identity)) return '同一泰坦只能配装一件同名装备。';
    return '';
  }

  function editEquipment(slots, { gearId, from, to, fromSide, toSide, beforeGearId }, record, gearNames) {
    const next = normalize({ slots }).slots;
    const group = (index, sideId) => Number.isInteger(index)
      ? (sideId ? next[index]?.sides?.find(side => side.id === sideId) : next[index]) : null;
    const source = group(from, fromSide);
    const target = group(to, toSide);
    const id = equipmentId(gearId);
    if (!id || (from != null && !source) || (to != null && !target) || (!source && !target)) throw new Error('配装操作无效。');
    if (source && !source.equipment.includes(id)) throw new Error('这件装备已不在当前配装栏中。');
    if (source === target && beforeGearId === id) return next;
    if (target !== source && target) {
      const reason = toSide ? (target.equipment.includes(id) ? '这张装备卡已在该针对配装中。' : '') : canEquip(target, id, gearNames);
      if (reason) throw new Error(reason);
    }
    if (target && target !== source && !toSide && (!source || fromSide)) {
      const stock = inventory.normalize(record?.arsenal)[id]?.quantity || 0;
      const assigned = equipmentCounts(next).get(id) || 0;
      if (assigned >= stock) throw new Error('这件装备的可用库存不足。');
    }
    if (source) source.equipment = source.equipment.filter(item => item !== id);
    if (target) {
      const index = target.equipment.indexOf(beforeGearId);
      target.equipment.splice(index < 0 ? target.equipment.length : index, 0, id);
    }
    return next;
  }

  function validate(value, record, gearNames) {
    const { slots } = normalize(value);
    for (const [index, slot] of slots.entries()) {
      const label = `${index + 1} 号配装`;
      if (new Set(slot.equipment.map(id => cardKey(id, gearNames))).size !== slot.equipment.length) {
        return `${label}含有同名装备。`;
      }
    }
    const stock = inventory.normalize(record?.arsenal);
    for (const [id, count] of equipmentCounts(slots)) {
      if (count > (stock[id]?.quantity || 0)) return `装备 ${id} 的配装数量超过军械库库存。`;
    }
    return '';
  }

  function save(record, baseline, draft, gearNames) {
    const next = normalize(draft);
    const current = normalize(record.arsenalLoadouts);
    if (JSON.stringify(current) === JSON.stringify(next)) return null;
    if (JSON.stringify(current) !== JSON.stringify(normalize(baseline))) throw new Error('配装已在其他页面更新，请重新读取后再编辑。');
    const reason = validate(next, record, gearNames);
    if (reason) throw new Error(reason);
    return { ...record, arsenalLoadouts: next };
  }

  function saveAllSlots(record, baseline, draft, gearNames) {
    const current = normalize(record.arsenalLoadouts);
    const original = normalize(baseline);
    const next = normalize(draft);
    const slotText = slot => JSON.stringify(slot);
    next.slots = next.slots.map((slot, index) => {
      const before = slotText(original.slots[index]);
      const stored = slotText(current.slots[index]);
      const edited = slotText(slot);
      if (edited === before) return current.slots[index];
      if (stored !== before && stored !== edited) throw new Error('配装已在其他页面更新，请重新读取后再编辑。');
      return slot;
    });
    next.presets = current.presets;
    return save(record, current, next, gearNames);
  }

  function saveSlot(record, baseline, index, slot, presetChange, gearNames) {
    const current = normalize(record.arsenalLoadouts);
    const original = normalize(baseline);
    const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if (!current.slots[index]) throw new Error('配装操作无效。');
    const next = normalize(current);
    if (slot) {
      next.slots[index] = normalizeSlot(slot);
      if (!equal(current.slots[index], next.slots[index]) && !equal(current.slots[index], original.slots[index])) {
        throw new Error('配装已在其他页面更新，请重新读取后再编辑。');
      }
    }
    if (presetChange) {
      const { id, preset } = presetChange;
      const existing = current.presets.find(item => item.id === id);
      const prior = original.presets.find(item => item.id === id);
      const replacement = preset && normalize({ presets: [{ ...preset, id, owner: index }] }).presets[0];
      if ((existing && existing.owner !== index && (preset || existing.owner !== undefined))
        || (!equal(existing, replacement || undefined) && !equal(existing, prior))) {
        throw new Error('配装已在其他页面更新，请重新读取后再编辑。');
      }
      if (preset && !replacement) throw new Error('配装操作无效。');
      if (replacement && current.presets.some(item => item.id !== id && item.owner === index && item.name === replacement.name)) {
        throw new Error('已有同名配装方案。');
      }
      const position = next.presets.findIndex(item => item.id === id);
      if (position >= 0) next.presets.splice(position, 1, ...(replacement ? [replacement] : []));
      else if (replacement) next.presets.push(replacement);
    }
    if (equal(current, next)) return null;
    if (slot) {
      const reason = validate(next, record, gearNames);
      if (reason) throw new Error(reason);
    }
    return { ...record, arsenalLoadouts: next };
  }

  return { normalize, equipmentCounts, canEquip, editEquipment, validate, save, saveSlot, saveAllSlots };
});
