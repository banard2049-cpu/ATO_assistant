import importlib.util
from pathlib import Path
import unittest

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


if __name__ == '__main__':
    unittest.main()
