#!/usr/bin/env python3
"""Verify the vendored engine against its recorded source snapshot, offline."""
import hashlib
import json
from pathlib import Path
root = Path(__file__).resolve().parents[1]
record = json.loads((root / 'vendor/dnd-provenance.json').read_text())
failures = []
for name, expected in record['sha256'].items():
    path = root / 'vendor/dnd' / name
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        failures.append(name)
actual = {str(p.relative_to(root / 'vendor/dnd')) for p in (root / 'vendor/dnd').rglob('*') if p.is_file()}
failures.extend(sorted(actual - set(record['sha256'])))
if failures:
    raise SystemExit('Changed engine snapshot: ' + ', '.join(failures))
print(f"Verified {len(actual)} unchanged files from {record['repository']} @ {record['commit']}")
