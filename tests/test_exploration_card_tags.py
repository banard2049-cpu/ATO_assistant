"""Tag API normalization must preserve the complete printed-card catalogue."""
import json
from pathlib import Path
import shutil
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ExplorationTagApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.php = shutil.which('php')
        if not cls.php:
            raise unittest.SkipTest('PHP is not installed')
        cls.payload = json.loads((ROOT/'assets/exploration-card-tags.js').read_text(encoding='utf8')
                                 .split('window.ATO_EXPLORATION_CARD_TAGS = ', 1)[1].strip().removesuffix(';'))

    def normalize(self, data):
        # Evaluate the actual API's pure normalizer without opening a session,
        # serving a port or writing the user's tag file.
        program = '''
$source = file_get_contents($argv[1]);
$start = strpos($source, 'function normalize_tags(');
$end = strpos($source, 'function write_tags(', $start);
eval(substr($source, $start, $end - $start));
$input = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
echo json_encode(normalize_tags($input), JSON_THROW_ON_ERROR);
'''
        result = subprocess.run([self.php, '-r', program, str(ROOT/'api/exploration-card-tags.php')],
                                input=json.dumps(data), text=True, encoding='utf8', capture_output=True, check=True)
        return json.loads(result.stdout)

    def test_normalization_retains_all_223_cards_and_their_independent_draw_and_removal_tags(self):
        normalized = self.normalize(self.payload)
        self.assertEqual(len(normalized['cards']), 223)
        self.assertEqual(set(normalized['cards']), set(self.payload['cards']))
        for key, expected in self.payload['cards'].items():
            with self.subTest(card=key):
                self.assertEqual(normalized['cards'][key]['removal'], expected['removal'])
                self.assertEqual(normalized['cards'][key]['draw'], expected['draw'])

    def test_explicit_single_survives_while_legacy_missing_draw_keeps_its_default(self):
        data = {'cards': {
            'c1:8201': {'removal': 'remove', 'draw': 'single'},
            'c4:9300': {'removal': 'remove'},
            'c5:10305': {'removal': 'keep', 'draw': 'chain'},
            'c6:1': {'removal': 'keep', 'draw': 'single'},
        }}
        cards = self.normalize(data)['cards']
        self.assertEqual(cards['c1:8201']['draw'], 'single')
        self.assertEqual(cards['c4:9300']['draw'], 'chain')
        self.assertEqual(cards['c5:10305']['draw'], 'chain')
        self.assertNotIn('c6:1', cards)


if __name__ == '__main__':
    unittest.main()
