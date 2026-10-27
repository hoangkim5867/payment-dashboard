"""Reverse Stage6 cumulative changes, verifying exact bytes before legacy tests.
No production access, no Firebase requests.
"""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
DIFF=json.loads((ROOT/'stage6_expected.json').read_text(encoding='utf-8'))['files']
def sha(data):return hashlib.sha256(data).hexdigest()
def strip_stage6(data:bytes,filename:str)->bytes:
    item=DIFF.get(filename)
    if not item:return data
    if sha(data)!=item['sha256_after']:
        raise AssertionError(f'Stage6 unexpected edit: {filename}')
    for patch in reversed(item['replacements']):
        after=patch['after'].encode('utf8')
        before=patch['before'].encode('utf8')
        if data.count(after)!=1:
            raise AssertionError(f'Stage6 replacement not unique in {filename}')
        data=data.replace(after,before,1)
    if sha(data)!=item['sha256_before']:
        raise AssertionError(f'Stage6 rollback checksum failed: {filename}')
    return data
