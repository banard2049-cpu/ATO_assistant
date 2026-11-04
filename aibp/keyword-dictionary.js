(function (root) {
  'use strict';
  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  const aliasKey = value => normalize(value).replace(/[:：]+$/, '').replace(/\s+/g, '');
  const chinese = value => /[\u3400-\u9fff]/.test(value);

  // Eudic has separate Chinese and English records with bilingual headings.
  // Join records through those headings, retaining every lookup alias.
  function build(records, parseDefinition) {
    const rows = records.map(item => ({ ...item, ...parseDefinition(item.definition) }));
    const parents = rows.map((_, i) => i);
    const find = i => parents[i] === i ? i : (parents[i] = find(parents[i]));
    const owners = new Map();
    rows.forEach((row, i) => {
      for (const alias of [row.word, ...row.headings]) {
        const key = aliasKey(alias);
        if (!key) continue;
        if (owners.has(key)) parents[find(i)] = find(owners.get(key));
        else owners.set(key, i);
      }
    });
    const groups = new Map();
    rows.forEach((row, i) => {
      const key = find(i);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    const entries = [...groups.values()].map(group => {
      const clean = value => value.replace(/[:：]+$/, '').trim();
      const aliases = [...new Set(group.flatMap(row => [row.word, ...row.headings, row.officialName || '']).map(clean).filter(Boolean))];
      const headings = group.flatMap(row => row.headings).map(clean);
      const en = headings.find(value => !chinese(value)) || aliases.find(value => !chinese(value)) || '';
      const zh = headings.find(chinese) || aliases.find(chinese) || '';
      const source = group.find(row => !chinese(row.word)) || group[0];
      const title = [zh, en].filter(Boolean).join(' / ');
      const official = group.find(row => row.officialName || row.officialDefinition) || {};
      return { id: aliasKey(en || zh), en, zh, title, aliases, officialName: official.officialName, officialDefinition: official.officialDefinition, text: source.text, parts: source.parts,
        head: normalize(aliases.join(' ')), searchText: normalize(aliases.join(' ') + ' ' + group.map(row => row.text + ' ' + (row.officialDefinition || '')).join(' ')) };
    });
    const byAlias = new Map();
    entries.forEach(entry => entry.aliases.forEach(alias => byAlias.set(aliasKey(alias), entry)));
    const entryFor = value => byAlias.get(aliasKey(value));
    function unique(words) {
      const seen = new Set();
      return words.map(word => entryFor(word) || { id: aliasKey(word), title: String(word), aliases: [String(word)] })
        .filter(entry => { if (seen.has(entry.id)) return false; seen.add(entry.id); return true; });
    }
    return { entries, entryFor, unique, search(query) {
      const key = normalize(query);
      return entries.filter(entry => entry.searchText.includes(key))
        .sort((a, b) => Number(b.aliases.some(alias => aliasKey(alias) === aliasKey(query))) - Number(a.aliases.some(alias => aliasKey(alias) === aliasKey(query)))
          || Number(b.head.includes(key)) - Number(a.head.includes(key)));
    } };
  }
  const api = { build };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AibpKeywordDictionary = api;
})(typeof window === 'object' ? window : globalThis);
