import importlib.util
import hashlib
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('ato_keyword_scan', Path(__file__).resolve().parents[1] / 'tools/scan_ato_keywords.py')
scan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scan)


class KeywordMatchingTests(unittest.TestCase):
    def test_boundless_is_not_a_shorter_chinese_substring(self):
        result = scan.matches('版 边 获得 无 边 限 特性', scan.load_terms())
        self.assertIn('无边限', result)
        self.assertNotIn('边限', result)

    def test_longer_terms_do_not_create_shorter_keyword_hits(self):
        terms = [(word, scan.norm(word)) for word in ['反射', '高级反射', 'Reflex', 'Advanced Reflex']]
        self.assertEqual(scan.matches('高级反射；Advanced Reflex', terms), ['高级反射', 'Advanced Reflex'])
        self.assertEqual(scan.matches('高级反射；反射；Advanced Reflex and Reflex', terms), ['反射', '高级反射', 'Reflex', 'Advanced Reflex'])

    def test_latin_terms_still_require_word_boundaries(self):
        self.assertEqual(scan.matches('Unboundless', [('Boundless', 'boundless')]), [])
        self.assertEqual(scan.matches('Boundless', [('Boundless', 'boundless')]), ['Boundless'])

    def test_printed_keyword_values_are_not_word_boundaries(self):
        terms = scan.load_terms()
        for text in ['顶推2，击倒。', '顶推 ２，击 倒。']:
            self.assertTrue(set(scan.matches(text, terms)) & {'顶推', '顶推 X'})
            self.assertIn('击倒', scan.matches(text, terms))
        self.assertTrue(set(scan.matches('Pushback2.', terms)) & {'Pushback', 'Pushback X'})
        self.assertIn('减低X', scan.matches('减低3', terms))

    def test_verified_card_spellings_return_dictionary_names(self):
        terms = scan.load_terms()
        self.assertIn('Labyrinth', scan.matches('迷宫1。', terms))
        self.assertIn('Pull', scan.matches('拉进3。', terms))
        self.assertIn('Harden', scan.matches('Hardened', terms))
        self.assertNotIn('Labyrinth', scan.matches('迷宫机牛的回合', terms))

    def test_kickback_is_recognized_without_replacing_its_reduction(self):
        terms = scan.load_terms()
        self.assertTrue(set(scan.matches('踢飞10；Kickback 20', terms)) & {'Kickback', 'Kickback X'})
        result = scan.matches('Kickback Reduction 3', terms)
        self.assertTrue(set(result) & {'Kickback Reduction', 'Kickback Reduction X'})
        self.assertFalse(set(result) & {'Kickback', 'Kickback X'})


class VerifiedCardTests(unittest.TestCase):
    def test_reviewed_export_rejects_missing_and_stale_review_paths(self):
        base = Path('review-test')
        paths = [base / 'card.jpg']
        for verified in [{}, {'old.jpg': {'words': []}}]:
            with self.assertRaisesRegex(RuntimeError, 'Visual review coverage differs'):
                scan.reviewed_cards(paths, {'verifiedCards': verified}, base)

    def test_visual_only_command_exports_current_reviews_without_ocr(self):
        with patch.object(scan, 'ocr', side_effect=AssertionError('OCR must not run')), \
                patch.object(scan, 'load_terms', side_effect=AssertionError('OCR candidates must not load')), \
                patch.object(Path, 'write_text') as writer, patch('builtins.print'):
            scan.main(['--reviewed-only'])
        writer.assert_called_once()
        output = json.loads(writer.call_args.args[0])
        self.assertEqual(output['coverage']['aibpFrontOcrPasses'], 0)
        self.assertEqual(output['coverage']['images'], output['coverage']['visuallyReviewedImages'])
        self.assertIn('no OCR or OCR caches used', output['method'])

    def test_new_exact_review_supersedes_the_legacy_hash_and_additions(self):
        with patch.object(Path, 'read_bytes', return_value=b'updated image'):
            review = {
                'cards': {'card.jpg': {'sha256': hashlib.sha256(b'old image').hexdigest(), 'add': ['Black']}},
                'verifiedCards': {'card.jpg': {'sha256': hashlib.sha256(b'updated image').hexdigest(), 'words': ['Kickback']}},
            }
            cards = {'card.jpg': ['Despair']}
            scan.apply_card_reviews(cards, review, Path('review-test'))
            self.assertEqual(cards['card.jpg'], ['Kickback'])

    def test_exact_review_removes_flavor_words_and_recovers_missing_rules(self):
        with patch.object(Path, 'read_bytes', return_value=b'current card image'):
            base = Path('review-test')
            image = base / 'card.jpg'
            words = ['Knockdown', 'Ur-Pull']
            reviewed = {'card.jpg': {'sha256': hashlib.sha256(image.read_bytes()).hexdigest(), 'words': words}}
            cards = {'card.jpg': ['Black', 'Death'], 'unreviewed.jpg': ['Burn']}
            scan.apply_verified_cards(cards, reviewed, base)
            self.assertEqual(cards, {'card.jpg': words, 'unreviewed.jpg': ['Burn']})
            self.assertIsNot(cards['card.jpg'], words)
            reviewed['card.jpg']['words'] = []
            scan.apply_verified_cards(cards, reviewed, base)
            self.assertEqual(cards['card.jpg'], [], 'reviewed empty rule text must clear false positives')

    def test_changed_art_and_missing_images_cannot_reuse_a_review(self):
        with patch.object(Path, 'read_bytes', return_value=b'replacement art'):
            base = Path('review-test')
            reviewed = {'card.jpg': {'sha256': hashlib.sha256(b'old image').hexdigest(), 'words': ['Burn']}}
            cards = {'card.jpg': ['Despair']}
            with self.assertRaisesRegex(RuntimeError, 'Reviewed card changed'):
                scan.apply_verified_cards(cards, reviewed, base)
            self.assertEqual(cards['card.jpg'], ['Despair'])
            with self.assertRaisesRegex(RuntimeError, 'missing from scan'):
                scan.apply_verified_cards({}, reviewed, base)


if __name__ == '__main__':
    unittest.main()
