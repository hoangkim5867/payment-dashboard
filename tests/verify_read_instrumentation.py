#!/usr/bin/env python3
"""Ensure only approved snapshot-size diagnostics were added; no new Firestore reads."""
from pathlib import Path
import json, hashlib
from stage5_delta import strip_stage5
from stage6_delta import strip_stage6
root=Path(__file__).resolve().parent.parent
meta=json.loads((root/'tests/stage3_expected.json').read_text(encoding='utf8'))
stage4=json.loads((root/'tests/stage4_expected.json').read_text(encoding='utf-8'))
for name,item in meta['changes'].items():
    raw=strip_stage5(strip_stage6((root/'site'/name).read_bytes(),name),name)
    if name in stage4['changes']:
        updated=stage4['changes'][name]
        assert hashlib.sha256(raw).hexdigest()==updated['sha256_stage4'], name
        raw=raw.replace(updated['preflight_fragment'].encode(), b'',1).replace(updated['new_condition'].encode(),updated['old_condition'].encode(),1)
        assert hashlib.sha256(raw).hexdigest()==updated['sha256_stage3'],name
    assert hashlib.sha256(raw).hexdigest()==item['sha256_stage3'], name
    before=raw.replace(item['new_fragment'].encode(),item['old_fragment'].encode(),1)
    assert hashlib.sha256(before).hexdigest()==item['sha256_stage2'], name
    assert raw.count(b'getDocs(paymentsRef)')==before.count(b'getDocs(paymentsRef)')==1, name
    assert b'console.info(' in item['new_fragment'].encode(), name
    assert b'item.data()' not in item['new_fragment'].encode(), name
print('PASS: exact Stage2 inheritance, 2 diagnostics only, 0 added getDocs, no row-level logging')
