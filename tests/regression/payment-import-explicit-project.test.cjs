'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../site/payment.html'),'utf8');
test('clipboard Project in structural column before Amount takes priority over Master name match',()=>{
 const fn=html.split('function smartDetectRow(row){')[1].split('function smartDetectMatrix(')[0];
 assert.match(fn,/if\(tailProjects.length===1\)\{[\s\S]*?pastedProject = tailProjects\[0\]/);
 assert.match(fn,/project = canonicalProjectDisplay\(pastedProject\)/);
 assert.match(fn,/projectDetectionSource = "safe-tail"/);
});
test('mismatched Master project must not silently replace Excel project or import duplicate',()=>{
 const fn=html.split('function stabilizeSmartDetectedContractRow(row, detected){')[1].split('function smartDetectMatrix(')[0];
 assert.match(fn,/normalizeSmartProject\(exactMatches\[0\]\.project\)===normalizeSmartProject\(fixed\.project\)/);
 assert.match(fn,/fixed\.projectConflict=/);
 const lookup=html.split('function findImportedContractMaster(')[1].split('function normalizeSmartContractNo(')[0];
 assert.match(lookup,/if\(!sameProject.length\)\{[\s\S]*?return null/);
 assert.match(html,/if\(isNewContract && normalize\(pastedProject\) && contractMatches.length\)/);
});
