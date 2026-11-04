"""OCR local ATO cards and match dictionary terms and verified card spellings.

Requires Tesseract with eng and chi_sim. Cached OCR allows interrupted runs to
resume. Results are candidates, not human-verified rules.
"""
import concurrent.futures
import hashlib
import html
import json
import os
from pathlib import Path
import re
import subprocess
import unicodedata
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'aibp'
CACHE = ROOT / 'tmp' / 'ato-card-ocr'
TESS = os.environ.get('TESSERACT', r'C:\Program Files\Tesseract-OCR\tesseract.exe')
ENV = dict(os.environ, OMP_THREAD_LIMIT='1')


def eligible(path):
    if path.suffix.lower() not in ('.jpg', '.jpeg', '.png') or '.preview.' in path.name.lower():
        return False
    return (path.parent.parent.name == 'ps' and path.parent.name != 'other'
            or path.parent.name == 'trait' and path.parent.parent.name == 'other'
            or path.parent.name == 'other' and path.name in ('DW.jpg', 'SW.jpg'))


def ocr(path):
    relative = path.relative_to(BASE).as_posix()
    signature = hashlib.sha256(path.read_bytes()).hexdigest()
    cache = CACHE / (signature + '.txt')
    if not cache.exists():
        run = subprocess.run([TESS, str(path), 'stdout', '-l', 'eng+chi_sim', '--psm', '11'], capture_output=True, env=ENV, timeout=120)
        if run.returncode:
            raise RuntimeError(f'{relative}: {run.stderr.decode(errors="replace")}')
        cache.write_bytes(run.stdout)
    text = cache.read_text(encoding='utf-8')
    if re.search(r'_(AI|BP)_', path.name) or path.name in ('DW.jpg', 'SW.jpg'):
        # Full-art sparse OCR often loses short Chinese rules next to symbols.
        # Read the enlarged rules region separately, with Chinese prioritized.
        rules_cache = CACHE / (signature + '.rules-v1.txt')
        if not rules_cache.exists():
            with Image.open(path) as original:
                image = ImageOps.exif_transpose(original).convert('L')
                width, height = image.size
                image = image.crop((int(width * .02), int(height * .36), int(width * .98), int(height * .95)))
                image = ImageOps.autocontrast(image)
                image = image.resize((1500, round(image.height * 1500 / image.width)), Image.Resampling.LANCZOS)
                image_path = CACHE / (signature + '.rules-v1.png')
                image.save(image_path)
            run = subprocess.run([TESS, str(image_path), 'stdout', '-l', 'chi_sim+eng', '--psm', '6'], capture_output=True, env=ENV, timeout=120)
            if run.returncode:
                raise RuntimeError(f'{relative} rules: {run.stderr.decode(errors="replace")}')
            rules_cache.write_bytes(run.stdout)
        text += '\n\n' + rules_cache.read_text(encoding='utf-8')
        if not path.stem.endswith('_BACK'):
            # Symbols and mixed English can make the combined-language engine
            # miss short Chinese effects. Isolate the lower response/attack
            # text and use the Chinese model independently on every front.
            lower_cache = CACHE / (signature + '.lower-zh-v1.txt')
            if not lower_cache.exists():
                with Image.open(path) as original:
                    image = ImageOps.exif_transpose(original).convert('L')
                    width, height = image.size
                    image = image.crop((int(width * .03), int(height * .68), int(width * .97), int(height * .95)))
                    image = ImageOps.autocontrast(image)
                    image = image.resize((1600, round(image.height * 1600 / image.width)), Image.Resampling.LANCZOS)
                    image_path = CACHE / (signature + '.lower-zh-v1.png')
                    image.save(image_path)
                run = subprocess.run([TESS, str(image_path), 'stdout', '-l', 'chi_sim', '--psm', '6'], capture_output=True, env=ENV, timeout=120)
                if run.returncode:
                    raise RuntimeError(f'{relative} lower rules: {run.stderr.decode(errors="replace")}')
                lower_cache.write_bytes(run.stdout)
            text += '\n\n' + lower_cache.read_text(encoding='utf-8')
    return relative, text


def norm(text):
    text = unicodedata.normalize('NFKC', text).casefold()
    # Tesseract separates Chinese characters and sometimes the first letter of
    # an English heading (P / USHBACK).
    text = re.sub(r'(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])', '', text)
    text = re.sub(r'(?<![a-z])([a-z])\s+([a-z]{3,})(?![a-z])', r'\1\2', text)
    return re.sub(r'\s+', ' ', text).strip()


def load_terms():
    entries = json.loads((BASE / 'ato-keywords.json').read_text(encoding='utf-8'))['entries']
    words = [entry['word'] for entry in entries]
    for entry in entries:
        for heading in re.findall(r'<font\b[^>]*size=[\"\x27]\+2[\"\x27][^>]*>(.*?)</font>', entry['definition'], re.S | re.I):
            words.append(html.unescape(re.sub(r'<[^>]*>', '', heading)).strip().rstrip(':：'))
    terms = [(word, norm(word)) for word in dict.fromkeys(words) if len(norm(word)) >= 2]
    review = json.loads((ROOT / 'tools' / 'ato-keyword-review.json').read_text(encoding='utf-8'))
    for entry in review['cardSpellings']:
        terms.extend((entry['word'], norm(alias)) for alias in entry['aliases'])
    return terms


def matches(text, terms):
    normalized = norm(text)
    candidates = []
    for word, key in terms:
        # Printed values belong to the keyword (顶推2 / Pushback2 / 减低3),
        # rather than preventing a match or requiring a literal dictionary X.
        pieces = re.split(r'(?<![a-z])x(?![a-z])', key)
        pattern = r'\s*(?:x|[+-]?\d+)\s*'.join(re.escape(piece).replace(r'\ ', r'\s*') for piece in pieces)
        left = r'(?<![a-z])' if re.match(r'[a-z]', key) else ''
        right = r'(?![a-z])' if re.search(r'[a-z]$', key) else ''
        for match in re.finditer(left + pattern + right, normalized):
            candidates.append((match.start(), match.end(), word))
    accepted = []
    found = set()
    # Longer known terms own their spans: 无边限 must not also match 边限.
    # Separate occurrences of a shorter term still count.
    for start, end, word in sorted(candidates, key=lambda hit: (-(hit[1] - hit[0]), hit[0])):
        if any(left <= start and end <= right for left, right in accepted):
            continue
        accepted.append((start, end))
        found.add(word)
    return list(dict.fromkeys(word for word, _ in terms if word in found))


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    paths = [path for path in (BASE / 'ps').rglob('*') if path.is_file() and eligible(path)]
    terms = load_terms()
    cards = {}
    errors = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(ocr, path): path for path in paths}
        for i, future in enumerate(concurrent.futures.as_completed(futures), 1):
            try:
                relative, text = future.result()
                cards[relative] = matches(text, terms)
            except Exception as error:
                errors.append(str(error))
            if i % 25 == 0:
                print(f'{i}/{len(paths)}; errors {len(errors)}', flush=True)
    if errors:
        raise RuntimeError('\n'.join(errors))
    review = json.loads((ROOT / 'tools' / 'ato-keyword-review.json').read_text(encoding='utf-8'))
    for relative, checked in review['cards'].items():
        image = BASE / relative
        if hashlib.sha256(image.read_bytes()).hexdigest() != checked['sha256']:
            raise RuntimeError(f'Reviewed card changed; recheck {relative} before applying corrections')
        for word in checked['add']:
            if word not in cards[relative]:
                cards[relative].append(word)
    aibp = [path for path in paths if re.search(r'_(AI|BP)_', path.name)]
    fronts = [path for path in aibp if not path.stem.endswith('_BACK')]
    output = {
        'method': 'Tesseract whole card eng+chi_sim psm 11 + enlarged AI/BP rules chi_sim+eng psm 6 + front lower rules chi_sim psm 6; longest parameterized dictionary matches with reviewed spelling/case corrections; not exhaustively human verified',
        'coverage': {'images': len(cards), 'aibpImages': len(aibp), 'aibpFronts': len(fronts),
                     'aibpBacks': len(aibp) - len(fronts), 'aibpFrontOcrPasses': 3, 'errors': 0,
                     'noMatchRuleRegionsVisuallyReviewed': len(review['cards']),
                     'reviewedCardsWithCorrections': sum(bool(card['add']) for card in review['cards'].values())},
        'cards': dict(sorted(cards.items())),
    }
    (BASE / 'card-keywords.json').write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Completed {len(cards)}/{len(paths)}; {len(errors)} errors', flush=True)


if __name__ == '__main__':
    main()
