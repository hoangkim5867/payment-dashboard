'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const site=path.resolve(__dirname,'../../site');
test('V2 indexed query never bypasses marker v3; V1 stays disabled',()=>{
 const gateway=fs.readFileSync(path.join(site,'assets/js/firestore-payment.mjs'),'utf8');
 assert.match(gateway,/PAYMENT_V2_WRITERS_ENABLED=true/);
 assert.match(gateway,/computeIndexV2/);
 assert.match(gateway,/indexFields:\['contractDigitsV2'\],sourceFields:\['contractNo'\]/);
 for(const page of ['payment.html','payment-mobile-renderer.html']){
  const html=fs.readFileSync(path.join(site,page),'utf8');
  assert.match(html,/PAYMENT_INDEX_V2_QUERY_CODE_ENABLED = true/);
  if(page==='payment.html')assert.match(html,/if\(!ready\)\{[\s\S]*?throw new Error\(/);
  else assert.match(html,/if\(!ready\)return ensureImportDuplicateHistory\(\);/);
  assert.match(html,/activationVersion===3/);
  assert.match(html,/where\("contractDigitsV2","in",keys\.slice/);
 }
});
test('Only Admin confirmation and a final source audit can toggle V2',()=>{
 const html=fs.readFileSync(path.join(site,'admin-index-v2-contract.html'),'utf8');
 assert.match(html,/id="v2RulesConfirmed"/);
 assert.match(html,/await checkV2Build\(\)/);
 assert.match(html,/const count=await verifyAllContractsOnce\(uid\)/);
 assert.match(html,/await setDoc\(V2_MARKER/);
 assert.doesNotMatch(html,/activateIndexedExcel|systemConfig\/paymentLookupV1/);
});

test('strict Rules release candidate equals tested staging Rules except header comment',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const root=path.resolve(__dirname,'../..');
 const stage=fs.readFileSync(path.join(root,'security/firestore.rules.V2_STAGING_ONLY'),'utf8');
 const strict=fs.readFileSync(path.join(root,'security/firestore.rules.V2_STRICT_REVIEW_ONLY'),'utf8');
 const strip=text=>text.slice(text.indexOf("rules_version = '2';"));
 assert.equal(strip(stage),strip(strict),'Strict Rules must match the Emulator-tested rules exactly');
 assert.match(strict,/function validContractDigitsV2/);
 assert.match(strict,/match \/systemConfig\/paymentLookupV2/);
});
