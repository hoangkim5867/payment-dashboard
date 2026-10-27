"""Undo *only* approved stage5 edits, verifying SHA-256 before and after.
This lets Stage1-4 exact-byte regression checks continue to run unchanged.
No network, production Firebase, credentials or side effects.
"""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
DIFF=json.loads((ROOT/'stage5_expected.json').read_text(encoding='utf-8'))['files']

def sha(data): return hashlib.sha256(data).hexdigest()

def strip_stage5(data: bytes, filename: str) -> bytes:
    item=DIFF.get(filename)
    if not item:return data
    if sha(data)!=item['sha256_after']:
        raise AssertionError(f'Stage5 unapproved edit in {filename}')
    for r in reversed(item['replacements']):
        new=r['after'].encode('utf-8')
        old=r['before'].encode('utf-8')
        if data.count(new)!=1:raise AssertionError(f'Cannot reverse Stage5 in {filename}')
        data=data.replace(new,old,1)
    if sha(data)!=item['sha256_before']:
        raise AssertionError(f'Stage5 baseline mismatch in {filename}')
    return data
