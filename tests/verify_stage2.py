#!/usr/bin/env python3
"""Offline release snapshot checks for cumulative Payment MASTER Stage2 + Stage3 (no Firebase connection).

Checks source equivalence when original user ZIP is available, and static invariants
without it. Does NOT certify production, security Rules, UI rendering or Firestore usage.
"""
from __future__ import annotations
from pathlib import Path
import hashlib, json, re, zipfile, argparse
from stage5_delta import strip_stage5
from stage6_delta import strip_stage6

root=Path(__file__).resolve().parent.parent
stage3=json.loads((root/'tests/stage3_expected.json').read_text(encoding='utf-8'))
stage4=json.loads((root/'tests/stage4_expected.json').read_text(encoding='utf-8'))

def previous_bytes(raw: bytes, name: str) -> bytes:
    """Undo approved Stage5, Stage4 and Stage3 edits for exact source equivalence."""
    raw=strip_stage6(raw,name)
    raw=strip_stage5(raw,name)
    if name in stage4['changes']:
        upgrade=stage4['changes'][name]
        check(sha(raw)==upgrade['sha256_stage4'], f'unapproved Stage4 change: {name}')
        helper=upgrade['preflight_fragment'].encode('utf-8')
        assert raw.count(helper)==1, name
        raw=raw.replace(helper,b'',1)
        newcondition=upgrade['new_condition'].encode('utf-8')
        oldcondition=upgrade['old_condition'].encode('utf-8')
        assert raw.count(newcondition)==1, name
        raw=raw.replace(newcondition,oldcondition,1)
        check(sha(raw)==upgrade['sha256_stage3'],f'cannot restore Stage3: {name}')
    if name not in stage3['changes']:
        return raw
    info=stage3['changes'][name]
    newb=info['new_fragment'].encode('utf-8')
    oldb=info['old_fragment'].encode('utf-8')
    check(raw.count(newb)==1, f'Stage3 diagnostic missing/duplicated: {name}')
    check(sha(raw)==info['sha256_stage3'], f'unapproved Stage3 modification: {name}')
    before=raw.replace(newb,oldb,1)
    check(sha(before)==info['sha256_stage2'], f'cannot restore Stage2: {name}')
    return before

meta=json.loads((root/'tests/stage2_expected.json').read_text(encoding='utf-8'))
stage1=json.loads((root/'tests/manifest_stage1_reference.json').read_text(encoding='utf-8'))
sha=lambda blob:hashlib.sha256(blob).hexdigest()
count=0

def check(condition, label):
 global count
 if not condition: raise AssertionError(label)
 count+=1

# Verify CSS is linked, its exact approved snapshot, and all seven HTML pages exist.
for name,info in stage1['files'].items():
 file=(root/'site'/name)
 check(file.exists(), f'missing page {name}')
 current_raw=file.read_bytes()
 raw=previous_bytes(current_raw, name)
 css=(root/'site'/info['primary_css_path'])
 check(css.exists() and sha(css.read_bytes())==info['primary_css_sha256'],f'css changed: {name}')
 check(raw.count(info['link_marker'].encode())==1,f'css link broken: {name}')
 if name in meta['files']:
  check(sha(raw)==meta['files'][name]['sha256_stage2'],f'HTML snapshot unexpectedly changed: {name}')
 else:
  check(sha(raw)==info['updated_sha256'],f'HTML snapshot unexpectedly changed: {name}')

# Key historical datasets must remain intact and exactly match the approved ZIP.
for name,entry in meta['files'].items():
 raw=(root/'site'/name).read_bytes()
 check(raw.count(b'window.HISTORY_2026_EDITED_PREVIEW = [')==0,f'old preview reintroduced: {name}')
 check(raw.count(b'window.HISTORY_2026_EDITED_PREVIEW = null;')==1,f'unexpected preview references: {name}')
 for var,spec in entry['kept_arrays'].items():
  m=re.search(rb'(?m)^window\.'+var.encode()+rb' = (\[.*?\]);?\r?$',raw)
  check(m is not None,f'missing 812-row dataset: {name}/{var}')
  array=json.loads(m.group(1))
  check(len(array)==812,f'history count changed: {name}/{var}')
  check(sha(m.group(1))==spec['sha256'],f'history payload changed: {name}/{var}')

# JS must not gain a new entire-collection payments scan by accident.
# These are KNOWN existing high-read queries, explicitly NOT counted as resolved.
html=(root/'site'/'payment.html').read_text(encoding='utf-8')
master=(root/'site'/'contract-master.html').read_text(encoding='utf-8')
check(html.count('getDocs(paymentsRef)')==1,'Payment full-scan query count changed; review duplicates')
check(master.count('getDocs(paymentsRef)')==1,'MEP full-scan query count changed; review completeness')

# Optional byte-level two-change proof using source ZIP (do NOT add source ZIP to GitHub).
args=argparse.ArgumentParser()
args.add_argument('--original-zip',type=Path)
a=args.parse_args()
if a.original_zip:
 archive=a.original_zip
 check(sha(archive.read_bytes())==meta['source_zip_sha256'],'original ZIP does not match expected source')
 with zipfile.ZipFile(archive) as z:
  for name,info in stage1['files'].items():
   original=z.read('payment-dashboard-main/'+name)
   check(sha(original)==info['baseline_sha256'],f'baseline mismatch {name}')
   css=(root/'site'/info['primary_css_path']).read_bytes()
   old=(info['original_style_open'].encode()+css+info['original_style_close'].encode())
   check(original.count(old)==1,f'primary style block not found in original {name}')
   expected=original.replace(old,info['link_marker'].encode(),1)
   if name in meta['files']:
    pattern=rb'(?m)^window\.HISTORY_2026_EDITED_PREVIEW = \[.*?\];\r?\n'
    expected,n=re.subn(pattern,b'',expected,count=1)
    check(n==1,f'exact preview block is missing in original {name}')
   check(expected==previous_bytes((root/'site'/name).read_bytes(),name),f'other bytes were modified in {name}')
 print('SOURCE DIFFERENTIAL CHECK PASS — only CSS extraction + unused preview removal')

print(f'PASS: {count} static integrity checks, history preserved. NO production access.')
print('BLOCKED for production: UI interactions, Firestore Rules, cross-month import, UNC, Excel not live-tested.')
