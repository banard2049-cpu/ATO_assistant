"""Convert the supplied C4 ATO eudic file to a JSON lookup table.

Usage: python tools/convert_ato_eudic.py INPUT.eudic [OUTPUT.json]

The file stores concatenated zlib blocks followed by 16-byte records containing
uncompressed definition offset, byte length and cumulative UTF-8 headword end.
The offset and record layout are validated for this dictionary format.
"""
import json
import re
from pathlib import Path
import struct
import sys
import zlib


def convert(path):
    source = Path(path).read_bytes()
    data_start = struct.unpack_from('<I', source, 6)[0]
    if data_start != 0x55e:
        raise ValueError('Unsupported eudic header')
    cursor = data_start
    definitions = bytearray()
    while source[cursor:cursor + 2] == b'\x78\x9c':
        decoder = zlib.decompressobj()
        definitions.extend(decoder.decompress(source[cursor:]))
        if not decoder.eof:
            raise ValueError('Incomplete compressed dictionary block')
        cursor = len(source) - len(decoder.unused_data)
    if source[cursor:cursor + 4] != b'\0' * 4:
        raise ValueError('Missing dictionary index marker')
    index = cursor + 4
    # This edition has 433 records; reject inputs that do not match its layout.
    count = 433
    strings = index + count * 16 + 4
    if source[strings - 4:strings] != b'\0' * 4:
        raise ValueError('Unexpected index length')
    entries = []
    previous = 0
    for i in range(count):
        offset, length, end = struct.unpack_from('<QII', source, index + i * 16)
        if not (previous < end <= len(source) - strings and offset + length <= len(definitions)):
            raise ValueError(f'Invalid record {i}')
        word = source[strings + previous:strings + end].decode('utf-8')
        definition = definitions[offset:offset + length].decode('utf-8')
        # Correct the card terminology in the dictionary itself.
        if word == '边限':
            word = '无边限'
        definition = definition.replace("无<a href='dic://边限'>边限</a>", "<a href='dic://无边限'>无边限</a>")
        definition = re.sub(r'(?<!无)边限:', '无边限:', definition)
        # Remove source layout breaks that split continuous sentences.
        for fragment in (
            '击退效<br>果',
            'the thing <br>that',
            'gain I <br><a href=',
            'the <br>Song of Life',
            'a gust <br>of wind',
            'Knock backs, <br><a href=',
            'about to <br>suffer',
            'combobreaking <br>weapon',
        ):
            definition = definition.replace(fragment, fragment.replace('<br>', ''))
        entries.append({'word': word, 'definition': definition})
        previous = end
    return {'entries': entries}


if __name__ == '__main__':
    if len(sys.argv) not in (2, 3):
        raise SystemExit(__doc__)
    output = Path(sys.argv[2] if len(sys.argv) == 3 else 'aibp/ato-keywords.json')
    result = convert(sys.argv[1])
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Wrote {len(result["entries"])} entries to {output}')
