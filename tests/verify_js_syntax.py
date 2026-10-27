#!/usr/bin/env python3
"""Static JavaScript syntax check with Node.js, no app runtime/Firebase connection."""
from pathlib import Path
import re, subprocess, json
root=Path(__file__).resolve().parent.parent/'site'
checks=0
for file in sorted(root.glob('*.html')):
    for m in re.finditer(r'<script\b([^>]*)>(.*?)</script\s*>',file.read_text(encoding='utf-8'),re.I|re.S):
        attrs,source=m.groups()
        if not source.strip() or re.search(r'\bsrc\s*=',attrs,re.I):continue
        ty=re.search(r'\btype\s*=\s*[\'\"]([^\'\"]+)',attrs,re.I)
        typ=(ty.group(1).lower() if ty else 'text/javascript')
        if typ not in ('text/javascript','application/javascript','module'):continue
        cmd=['node','--check'] + (['--input-type=module'] if typ=='module' else [])
        proc=subprocess.run(cmd,input=source,text=True,capture_output=True,timeout=10)
        if proc.returncode:
            raise SystemExit(f'FAIL {file.name} block #{checks+1}: {proc.stderr[:500]}')
        checks+=1
print(f'PASS: {checks} JavaScript syntax blocks')
