"""Build readable card-face reference sheets for the technology prerequisite audit."""
from pathlib import Path
import argparse
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/tech-prerequisite-audit-20261027'


def build(cycle):
    data = json.loads((ROOT / 'technology/tech_card_dictionary.min.json').read_text(encoding='utf-8'))
    cards = [card for card in data['cards'] if any(node['page'] == cycle for node in card['nodes'])]
    font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 18)
    OUT.mkdir(parents=True, exist_ok=True)
    for start in range(0, len(cards), 12):
        group = cards[start:start + 12]
        sheet = Image.new('RGB', (1600, ((len(group) + 3) // 4) * 355), '#ffffff')
        draw = ImageDraw.Draw(sheet)
        for offset, card in enumerate(group):
            x, y = offset % 4 * 400, offset // 4 * 355
            image = Image.open(ROOT / 'technology' / card['image']['face']).convert('RGB')
            # Keep the full lower panel, including multiple AND/OR lines.
            if image.width < image.height:
                image = image.crop((0, int(image.height * .53), image.width, image.height))
            image.thumbnail((396, 300))
            sheet.paste(image, (x + (400 - image.width) // 2, y + 47))
            draw.text((x + 5, y + 2), f"{card['index']} {card['names']['en']}", font=font, fill='black')
        target = OUT / f'{cycle}-{start // 12 + 1:02}.jpg'
        sheet.save(target, quality=95)
        print(target)
    (OUT / f'{cycle}-current.json').write_text(json.dumps([
        {'index': c['index'], 'key': c['key'], 'name_zh': c['names']['zh'], 'image': c['image']['face'],
         'nodes': [{k: v for k, v in n.items() if k in ('id', 'page', 'req', 'req_any', 'req_conditions', 'core', 'unlocks')}
                   for n in c['nodes'] if n['page'] == cycle]}
        for c in cards], ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('cycles', nargs='+', choices=[f'cycle{i}' for i in range(1, 6)])
    args = parser.parse_args()
    for cycle in args.cycles:
        build(cycle)
