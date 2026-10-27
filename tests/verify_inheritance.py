"""Verify all inherited public site files against the supplied cumulative ZIP.

Only the explicitly reviewed import, freshness, Cash language and mobile SC
parity changes are allowed. This is source-preservation evidence, not a claim
that every business workflow has been tested.
"""
from pathlib import Path
import zipfile, sys, json, hashlib, difflib
root=Path(__file__).resolve().parent.parent
baseline=Path(sys.argv[1])
old_cache='    if(importDuplicateHistoryLoaded){\n        return importDuplicateHistoryPayments;\n    }\n\n'
new_cache='    // Refresh every preview: another session may have changed a prior month.\n'
start='async function extractBulkUncPdfText(file){'
end='function bulkUncAmounts(info){'
normalize=lambda data:data.decode('utf-8-sig').replace('\r\n','\n')
sha=lambda data:hashlib.sha256(data).hexdigest()
checked=[];diff=[]
with zipfile.ZipFile(baseline) as archive:
    desktop=normalize(archive.read('site/payment.html'))
    for name in archive.namelist():
        if name.endswith('/') or not name.startswith('site/'):continue
        original=archive.read(name);current=(root/name).read_bytes()
        if name.endswith('.html'):
            expected=normalize(original).replace('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js','./assets/js/firestore-payment.mjs')
            if name in ['site/payment.html','site/payment-mobile-renderer.html']:
                assert expected.count(old_cache)==1
                expected=expected.replace(old_cache,new_cache)
                guard='                if(data && !isAdmin()){\n                    data.processApproval = "";\n                    data.processBanking = "";'
                expected=expected.replace(guard,guard+'\n                    data.processActualAmount = "";\n                    data.processPaymentDate = "";')
                metadata='                                source:\n                                    "excel-paste",'
                expected=expected.replace(metadata,metadata+'\n                                createdByUid:currentAuthUser.uid,\n                                createdByEmail:currentAuthUser.email || "",')
                for patch in json.loads((root/'tests/RC1_IMPORT_RECOVERY_PATCHES.json').read_text(encoding='utf-8')):
                    if patch['file']!=name:continue
                    if patch['before'].startswith('            // allPayments'):
                        assert expected.count(patch['before'])==1
                        expected=expected.replace(patch['before'],patch['after'])
                    else:
                        a=expected.index('confirmExcelImportBtn.addEventListener(')
                        b=expected.index('/*\n   Protect pasted/import data:',a)
                        handler=expected[a:b]
                        assert handler.count(patch['before'])==1
                        expected=expected[:a]+handler.replace(patch['before'],patch['after'])+expected[b:]
            if name=='site/cash-control.html':
                expected=expected.replace("labelForLang(window.cashLang||cashLang||'vi')","labelForLang(localStorage.getItem('cashCtlLang')||'vi')")
            if name=='site/payment-mobile-renderer.html':
                a,b=expected.index(start),expected.index(end,expected.index(start))
                expected=expected[:a]+desktop[desktop.index(start):desktop.index(end,desktop.index(start))]+expected[b:]
                expected=expected.replace('const text = await extractBulkUncPdfText(file);\n                if(!text){','const pdfExtract = await extractBulkUncPdfText(file);\n                if(!pdfExtract.text && !pdfExtract.layoutText){').replace('row.info = extractBulkUncInfo(text);','row.info = extractBulkUncPdfInfo(pdfExtract);')
            if name in ['site/payment.html','site/payment-mobile-renderer.html']:
                for patch in json.loads((root/'tests/RC1_BANK_PDF_PATCHES.json').read_text(encoding='utf-8')):
                    assert patch['old'] in expected, 'Bank parser patch anchor missing'
                    expected=expected.replace(patch['old'],patch['next'],1)
            assert normalize(current)==expected, f'Unreviewed site change: {name}'
            if normalize(current)!=normalize(original):
                diff.extend(difflib.unified_diff(normalize(original).splitlines(True),normalize(current).splitlines(True),fromfile='original/'+name,tofile='RC1/'+name))
        else:assert original==current,f'Changed inherited asset: {name}'
        checked.append({'file':name,'originalSha256':sha(original),'currentSha256':sha(current),'reviewed':True})
result={'baselineArchiveSha256':sha(baseline.read_bytes()),'inheritedFilesChecked':len(checked),'allInheritedSiteFilesRetained':True,'onlyReviewedSiteChanges':True,'files':checked}
(root/'tests/INHERITANCE_RESULTS.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
(root/'tests/REVIEWED_SITE_DIFF.patch').write_text(''.join(diff),encoding='utf-8')
print(f'PASS: {len(checked)} inherited site files retained; only reviewed changes')
