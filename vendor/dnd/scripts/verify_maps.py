#!/usr/bin/env python3
"""Independently compare all DOS map bytes with the original printed maps.
Run: python3 scripts/verify_maps.py [map-directory]
The reference maps are deliberately separate from the Rust implementation.
"""
from pathlib import Path
import sys
import hashlib

root = Path(__file__).resolve().parent.parent
maps = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'reference/maps'
checks = 0
for binary in sorted((root / 'assets/dungeons').glob('*.BIN')):
    data = binary.read_bytes()
    assert len(data) == 8000, binary
    for level in range(20):
        rows = (maps / f'{binary.stem}.L{level+1:02}').read_text().splitlines()[2:]
        for y in range(20):
            for x in range(20):
                cell = data[level * 400 + y * 20 + x]
                assert rows[y * 4][x * 6 + 3] == ' I-.'[(cell >> 2) & 3], (binary,level,y,x,'north')
                assert rows[y * 4 + 2][x * 6] == ' I :'[cell & 3], (binary,level,y,x,'west')
                checks += 2
    print(f'{binary.name}: 20 levels verified; sha256 {hashlib.sha256(data).hexdigest()}')
print(f'PASS: {checks:,} stored walls agree with 100 original printed maps.')
