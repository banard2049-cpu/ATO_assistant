"""Crop numbered gear rewards from the local Tabletop Simulator image cache."""

import json

from PIL import Image

from generate_gear_card_images import (
    ROOT,
    WORKSHOP_JSON,
    cache_name_for_url,
    card_position,
    crop_card_face,
    iter_objects,
)

ARSENAL_SECRET_CARDS = {
    5: {57: 'BJ0962'},
    11: {
        186: 'DJ2355', 187: 'DJ2356', 188: 'DJ2357', 201: 'DJ2380', 202: 'DJ2381',
        206: 'DJ2385', 207: 'DJ2386', 208: 'ZJ2570', 209: 'ZJ2571', 210: 'ZJ2572',
        211: 'ZJ2573', 212: 'ZJ2574',
    },
    18: {
        278: 'EJ2962', 279: 'EJ2963', 280: 'EJ2964', 281: 'EJ2965', 294: 'EJ2992',
        295: 'EJ2993', 296: 'EJ2994', 297: 'EJ2534', 298: 'EJ2995', 299: 'ZJ2996',
        300: 'ZJ2997', 301: 'ZJ2998', 302: 'ZJ2999', 303: 'ZJ3000', 321: 'EJ2391',
    },
}


def reward_targets():
    catalog = json.loads((ROOT / 'theatre/reward-images.json').read_text(encoding='utf-8'))
    for key, paths in catalog.items():
        if key == 'skyseer':
            for path, name in zip(paths, ['Skyreach', "Horizon's Edge"], strict=True):
                yield ROOT / path, key, [name]
        else:
            deck, card = key.split(':')
            for index, path in enumerate(paths, start=1):
                name = f'{card} {index}/{len(paths)}' if len(paths) > 1 else card
                yield ROOT / path, f'SD {deck}', [name]
    for deck, cards in ARSENAL_SECRET_CARDS.items():
        for card, gear_id in cards.items():
            path = ROOT / 'technology/images/gear_cards' / (gear_id.lower() + '.jpg')
            names = ['303 1/2', '303 2/2'] if (deck, card) == (18, 303) else [str(card)]
            yield path, f'SD {deck}', names


def workshop_objects(path):
    return iter_objects(json.loads(path.read_text(encoding='utf-8-sig')))


def main():
    targets = [(path, deck, names) for path, deck, names in reward_targets() if not path.is_file()]
    if not targets:
        print('All gear reward images are present.')
        return

    secret_decks = {
        obj['Nickname']: {card.get('Nickname'): card for card in obj['ContainedObjects']}
        for obj in workshop_objects(WORKSHOP_JSON.with_name('3458296558.json'))
        if str(obj.get('Nickname', '')).startswith('SD ') and obj.get('ContainedObjects')
    }
    skyseer_gear = {
        obj['Nickname']: obj for obj in workshop_objects(WORKSHOP_JSON)
        if obj.get('Nickname') in {'Skyreach', "Horizon's Edge"} and obj.get('CardID')
    }
    for path, deck, names in targets:
        faces = []
        for name in names:
            card = skyseer_gear.get(name) if deck == 'skyseer' else secret_decks.get(deck, {}).get(name)
            if not card:
                raise SystemExit(f"Workshop card missing for {path.name}")
            number = card['CardID']
            deck_id = number // 100
            sheet = card['CustomDeck'][str(deck_id)]
            # The named Skyseer cards have a spoiler cover on FaceURL.
            face_path = cache_name_for_url(sheet['BackURL' if deck == 'skyseer' else 'FaceURL'])
            width, height = sheet['NumWidth'], sheet['NumHeight']
            position = card_position(number, deck_id, width, height)
            if not face_path or not position:
                raise SystemExit(f"Cached card face missing for {path.name}")
            faces.append(crop_card_face(face_path, *position, width, height))
        path.parent.mkdir(parents=True, exist_ok=True)
        if len(faces) == 1:
            faces[0].save(path, optimize=True)
        else:
            # Pantheon is printed on two cards that form one wide equipment card.
            with Image.new('RGB', (sum(face.width for face in faces), max(face.height for face in faces)), 'white') as combined:
                left = 0
                for face in faces:
                    combined.paste(face, (left, 0))
                    left += face.width
                combined.save(path, optimize=True)
        for face in faces:
            face.close()

    print(f'Imported {len(targets)} gear reward images.')


if __name__ == '__main__':
    main()
