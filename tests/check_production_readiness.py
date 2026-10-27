#!/usr/bin/env python3
"""Fail-closed production preflight: does not connect to Firebase or modify files."""
from pathlib import Path
import re,sys
root=Path(__file__).resolve().parent.parent
site=root/'site'
problems=[]
for f in ('payment.html','payment-mobile-renderer.html'):
 text=(site/f).read_text(encoding='utf-8')
 for name in ('HISTORY_2026_EMBEDDED','HISTORY_2026_CLEAN_SOURCE'):
  if re.search(r'window\.'+name+r'\s*=\s*\[\s*\{',text):
   problems.append(f'{f}: {name} still embeds financial history in publicly served HTML')
 if 'window.HISTORY_2026_EDITED_PREVIEW = [' in text:
  problems.append(f'{f}: obsolete EDITED_PREVIEW still included')

for file in ('payment.html','contract-master.html'):
 text=(site/file).read_text(encoding='utf-8')
 if 'getDocs(paymentsRef)' in text:
  problems.append(f'{file}: still contains a full payments collection scan; Firestore quota optimisation not certified')
if not (root/'firestore.rules').exists():
 problems.append('Firebase production Rules are not bundled/tested; verify them separately with Emulator')
problems.append('No evidence of passing end-to-end UI/Admin/Staff/UNC/Excel tests on a Firebase staging environment')
for item in problems:print('BLOCK:',item)
if problems:
 print('RELEASE BLOCKED — staging ZIP must NOT replace the current Payment production site.')
 sys.exit(1)
print('CHECK PASS (still requires human production approval)')
