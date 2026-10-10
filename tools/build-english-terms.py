"""Recover English names from bilingual source data; never back-translate prose.

python tools/build-english-terms.py --app-lang tmp/english-source/lang.txt \
    --tts "path/to/3458296558.json"
An XAPK can also be passed with --xapk (requires UnityPy).
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CJK = re.compile(r"[\u3400-\u9fff]")


def app_language(xapk: Path) -> str:
    import UnityPy
    with zipfile.ZipFile(xapk) as outer:
        for name in outer.namelist():
            if not name.endswith('.apk') or 'config.' in name:
                continue
            with zipfile.ZipFile(io.BytesIO(outer.read(name))) as apk:
                env = UnityPy.load(apk.read('assets/bin/Data/data.unity3d'))
                for obj in env.objects:
                    if obj.type.name == 'TextAsset':
                        asset = obj.read()
                        if asset.m_Name in {'lang', 'langCN'}:
                            value = asset.m_Script
                            return value if isinstance(value, str) else value.decode('utf-8-sig')
    raise ValueError('No lang TextAsset found in XAPK')


def build(lang: str, tts: dict | None = None, english_lang: str = '') -> tuple[dict, dict]:
    # Full game prose stays in private optional datasets. This catalog contains
    # only short names and labels with an English source already present.
    recovered: dict[str, tuple[str, str]] = {}

    def add(zh: str, en: str, source: str):
        zh, en = zh.strip(), en.strip()
        if zh and en and CJK.search(zh) and not CJK.search(en):
            recovered[zh] = (en, source)

    def bilingual(value: str, source: str):
        if len(value) > 180 or '\n' in value or '<' in value or '{' in value:
            return
        match = CJK.search(value)
        if not match:
            return
        en, zh = value[:match.start()].strip(), value[match.start():].strip()
        if not re.search('[A-Za-z]', en) or len(zh) > 55:
            return
        # A parenthesis separating the two names belongs to the presentation.
        if en.endswith(('(', '（')) and zh.endswith((')', '）')):
            en, zh = en[:-1].strip(), zh[:-1].strip()
        add(zh, en, source)
        add(value, en, source)

    old_rows = list(csv.DictReader(io.StringIO(lang.lstrip('\ufeff'), newline='')))
    english_rows = [row for row in csv.DictReader(io.StringIO(english_lang.lstrip('\ufeff'), newline='')) if row.get('id')]
    english_by_id = {row['id']: row['EN'] for row in english_rows}
    prose = {}
    def source_pair(zh, en, source):
        if not zh or not en or not CJK.search(zh) or CJK.search(en):
            return
        # Rules and longer source passages are private optional assets.
        if len(en) > 100 or len(zh) > 55 or '\n' in en or '<' in en or '{' in en or '_abil' in source or '_desc' in source:
            prose[zh.strip()] = en.strip()
        else:
            add(zh, en, source)
    for row in old_rows:
        label = row.get('EN', '')
        en = english_by_id.get(row.get('id'))
        if en:
            source_pair(label, en, 'app:1.1.22:' + row['id'])
            match = CJK.search(label)
            if match:
                source_pair(label[match.start():], en, 'app:1.1.22:' + row['id'])
        else:
            bilingual(label, 'app:1.1.7:' + row.get('id', ''))

    def walk(value, source):
        if isinstance(value, dict):
            en, zh = value.get('en'), value.get('zh')
            if isinstance(en, str) and isinstance(zh, str):
                add(zh, en, source)
                add(en + ' ' + zh, en, source)
            for child in value.values():
                walk(child, source)
        elif isinstance(value, list):
            for child in value:
                walk(child, source)
        elif isinstance(value, str):
            bilingual(value, source)

    for filename in ['technology/ato_gear_production.json', 'technology/tech_card_dictionary.min.json']:
        walk(json.loads((ROOT / filename).read_text(encoding='utf-8-sig')), filename)
    # These literal zh/en pairs already appear in the record and hero pages.
    for filename in ['record/index.html', 'hero/index.html', 'aibp/index.html', 'index.html']:
        source = (ROOT / filename).read_text(encoding='utf-8')
        # Adventure rows preserve [Chinese title, original English title].
        # Some add a third layout option after the title pair.
        for match in re.finditer(r'\["([^"\n]+)",\s*"([^"\n]+)"(?=\s*[,\]])', source):
            zh, en = match.groups()
            if CJK.search(zh) and re.search('[A-Za-z]', en) and not CJK.search(en):
                add(zh, en, filename + ':bilingual-title-row')
        for match in re.finditer(r'\b(zh|en):\s*"([^"\n]+)"\s*,\s*(zh|en):\s*"([^"\n]+)"', source):
            if match[1] != match[3]:
                pair = {match[1]: match[2], match[3]: match[4]}
                add(pair['zh'], pair['en'], filename)
                add(pair['en'] + ' ' + pair['zh'], pair['en'], filename)
    dashboard = (ROOT / 'index.html').read_text(encoding='utf-8')
    # Fated-event rows already carry the English printed title next to the
    # Chinese title. Recover that explicit original, rather than the slug.
    for match in re.finditer(r'\["[^"\n]+",\s*"([^"\n]+)",\s*"([^"\n]+)"', dashboard):
        en, zh = match.groups()
        if re.search('[A-Za-z]', en) and not CJK.search(en):
            add(zh, en, 'index.html:printed-fated-event-title')
    for match in re.finditer(r'title:\s*"([^"\n]+)",\s*subtitle:\s*"([^"\n]+)"', dashboard):
        zh, en = match.groups()
        add(zh, en, 'index.html:original-subtitle')
    # Original-English heading metadata is also preserved in the local reader
    # index. Only the title pair is exported; no translated story prose.
    headings = (ROOT / 'story/storybook-placeholder.js').read_text(encoding='utf-8')
    quoted = r'("(?:[^"\\]|\\.)*")'
    for match in re.finditer(r'"title":\s*' + quoted + r',\s*"englishTitle":\s*' + quoted, headings):
        zh, en = map(json.loads, match.groups())
        zh = re.sub(r'\s*[（(]' + re.escape(en) + r'[）)]\s*$', '', zh)
        add(zh, en, 'story/storybook-placeholder.js:englishTitle')

    # Prefer the unmodified current English/CN table over old catalog spellings.
    for row in english_rows:
        source_pair(row.get('CN', ''), row['EN'], 'app:1.1.22:' + row['id'])
        # Recover a bare Special Event name as well as its full category label.
        # The current CN table prefixes the category; UI links use just the name.
        if row.get('CN', '').startswith('特殊事件') and row['EN'].endswith(' Special Event'):
            add(row['CN'][4:], row['EN'][:-14], 'app:1.1.22:' + row['id'] + ':event-title')
    # Transcribed directly from the English Cycle V Argo Sheet Back in the
    # user-supplied TTS save (cached image 13636151326665806867 / 31C6C02C...).
    add('时间线步骤开始时若没有空白格可标记，读 3749',
        'At the start of the Timeline Step, if there are no empty boxes to mark on the Timeline, see 3749.',
        'tts:3458296558:Cycle V Argo Sheet Back:13636151326665806867')
    # Old fan Chinese calls the boss Cyclonus 独眼巨人; the current official
    # table uses 独眼巨人 for the Cyclopes faction. Preserve that distinction.
    boss_selector = '#enemyTracks, .boss-search-results, #boss-title'
    scoped = [[boss_selector, [['独眼巨人', english_by_id['core_cyclonus']]]]] if 'core_cyclonus' in english_by_id else []

    names = set()
    def tts_walk(value):
        if isinstance(value, dict):
            if value.get('Nickname'):
                names.add(value['Nickname'].strip())
            for child in value.values():
                tts_walk(child)
        elif isinstance(value, list):
            for child in value:
                tts_walk(child)
    if tts:
        tts_walk(tts)
    # A matching TTS name corroborates a recovered English title. The JSON is
    # never treated as instructions, nor are names invented from internal IDs.
    confirmed = sum(en in names for en, _ in recovered.values())
    return {
        'schema': 1,
        'sources': ['Official APP 1.1.22 EN/CN table', 'Official APP 1.1.7 bilingual labels', 'existing bilingual project catalogs', 'TTS original English Argo Sheet text'],
        'ttsConfirmed': confirmed,
        'scoped': scoped,
        'terms': [[zh, en, source] for zh, (en, source) in sorted(recovered.items())],
    }, {'schema': 1, 'source': 'Official APP 1.1.22 langCN EN column', 'labels': english_by_id,
        'pairs': list(prose.items())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app-lang', type=Path)
    parser.add_argument('--xapk', type=Path)
    parser.add_argument('--english-lang', type=Path)
    parser.add_argument('--original-xapk', type=Path)
    parser.add_argument('--tts', type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'assets/english-terms.js')
    args = parser.parse_args()
    lang = args.app_lang.read_text(encoding='utf-8-sig') if args.app_lang else app_language(args.xapk) if args.xapk else ''
    tts = json.loads(args.tts.read_text(encoding='utf-8-sig')) if args.tts else None
    english_lang = args.english_lang.read_text(encoding='utf-8-sig') if args.english_lang else app_language(args.original_xapk) if args.original_xapk else ''
    data, source_data = build(lang, tts, english_lang)
    args.output.write_text('// Source-backed names only. Generated by tools/build-english-terms.py.\n'
                           + 'window.ATO_ENGLISH_TERMS = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    print(f"Recovered {len(data['terms'])} labels; {data['ttsConfirmed']} corroborated by TTS nicknames.")
    if english_lang:
        private_output = ROOT / 'story/data/english-source-data.js'
        private_output.parent.mkdir(parents=True, exist_ok=True)
        private_output.write_text('// Private original source text; distribute through resource packs only.\n'
            + 'window.ATO_ENGLISH_SOURCE = ' + json.dumps(source_data, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
        print(f"Saved {len(source_data['labels'])} original labels and {len(source_data['pairs'])} source passages locally.")


if __name__ == '__main__':
    main()
