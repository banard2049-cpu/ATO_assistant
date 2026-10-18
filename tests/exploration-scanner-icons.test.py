import importlib.util
import json
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('exploration_scan',ROOT/'tools/scan_exploration_resource_cards.py')
scan=importlib.util.module_from_spec(spec)
spec.loader.exec_module(scan)

class IconScannerTests(unittest.TestCase):
    def test_resource_word_inside_icon_is_not_a_resource_sentence(self):
        self.assertIsNone(scan.parse_grant_sentence('Gain +1 ICON(small dark resource glyph).'))
        self.assertEqual(scan.parse_grant_sentence('Gain 1 ICON(dark glyph, with an inner mark) resource.'),[(1,'ICON(dark glyph, with an inner mark)')])
        self.assertEqual(scan.parse_grant_sentence('Gain 1 ICON(dark glyph and a pale mark) resource.'),[(1,'ICON(dark glyph and a pale mark)')])
    def test_all_named_tables_keep_all_badges_and_are_menus(self):
        raw=json.loads((ROOT/'tools/exploration-card-effects.json').read_text(encoding='utf-8'))['cards']
        catalog=scan.read_record_catalog(); cycles=scan.build_cycles(catalog,scan.shared_resource_keys(catalog))
        for key in scan.NAMED_DIPLOMACY_FACTIONS:
            row=scan.scan_card(raw[key],cycles)
            self.assertTrue(row['diplomacyMenu'],key)
            expected={line['badge'] for line in raw[key]['lines'] if scan.condition_from_badge(line.get('badge',''))}
            actual={entry.get('badge') or (entry.get('condition') or {}).get('badge') for entry in row['manual']+row['grants']}
            self.assertTrue(expected<=actual,(key,expected-actual))
        waster=scan.scan_card(raw['c4:9341'],cycles)
        self.assertEqual(waster['unresolved'],[])
        self.assertEqual(len(waster['manual']),8)
    def test_resource_choice_preserves_its_attached_stranger_and_existing_manual_ids(self):
        raw=json.loads((ROOT/'tools/exploration-card-effects.json').read_text(encoding='utf-8'))['cards']
        catalog=scan.read_record_catalog(); cycles=scan.build_cycles(catalog,scan.shared_resource_keys(catalog))
        card=scan.serialize_card(scan.scan_card(raw['c1:6403'],cycles))
        self.assertEqual([item['key'] for item in card['grants'][0]['alternatives']],['calcifiedKnuckle','fleshyMantle'])
        self.assertEqual(card['manual'][2]['badge'],'Neutral')
        self.assertEqual(card['manual'][6]['badge'],'ICON(black lozenge with white vessel glyph) 7+')
        self.assertEqual(card['manual'][7],{'text':'Gain +1 ICON(cloaked-figure glyph).','badge':'Friendly',
            'condition':scan.condition_from_badge('Friendly'),'requiresResource':True})

    def test_parenthesized_story_page_reference_is_not_cut_at_its_abbreviation(self):
        text='At the end of this Exploration Step, resolve an Ambush Battle (Cycle I Storybook, p. 112).'
        self.assertEqual(scan.split_sentences(text),[text])
        self.assertEqual(scan.split_sentences(text+' At the start of this battle, Escalate 1.'),
                         [text,'At the start of this battle, Escalate 1.'])

    def test_all_source_cards_rebuild_the_checked_in_runtime_without_losing_face_corrections(self):
        source=json.loads((ROOT/'tools/exploration-card-effects.json').read_text(encoding='utf8'))['cards']
        text=(ROOT/'assets/exploration-card-resources.js').read_text(encoding='utf8')
        marker='window.ATO_EXPLORATION_CARD_RESOURCES = '
        runtime=json.loads(text.split(marker,1)[1].strip().removesuffix(';'))
        catalog=scan.read_record_catalog(); cycles=scan.build_cycles(catalog,scan.shared_resource_keys(catalog))
        self.assertEqual(cycles,runtime['cycles'])
        self.assertEqual(set(source),set(runtime['cards']))
        for key,card in source.items():
            with self.subTest(card=key):
                self.assertEqual(scan.serialize_card(scan.scan_card(card,cycles)),runtime['cards'][key])

    def test_named_cyclopean_allied_badges_keep_their_faction_without_becoming_diplomacy_menus(self):
        source=json.loads((ROOT/'tools/exploration-card-effects.json').read_text(encoding='utf8'))['cards']
        catalog=scan.read_record_catalog(); cycles=scan.build_cycles(catalog,scan.shared_resource_keys(catalog))
        for key in ['c2:13615','c2:13623']:
            card=scan.serialize_card(scan.scan_card(source[key],cycles))
            self.assertEqual(card['diplomacyFaction'],'cyclopes')
            self.assertFalse(card['diplomacyMenu'])
            self.assertEqual(card['manual'][0]['badge'],'Allied')
            self.assertEqual(card['manual'][0]['condition']['bonus'],2)
            self.assertIn('独眼巨人',card['manual'][0]['condition']['label'])

if __name__=='__main__':unittest.main()
