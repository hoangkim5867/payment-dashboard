'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {contractDigitsV2,computeIndexV2,hasValidIndexV2}=require('../../backend/payment-index-v2-core.cjs');
const {normalizeSmartContractNo,duplicateKeyV1}=require('../../backend/payment-index-core.cjs');
const root=path.resolve(__dirname,'../..');

test('same normalized contract ALWAYS has same Rules-verifiable candidate key',()=>{
 const contracts=[
  'CSCECVN-SEA-MEP-LAB-002', 'cscecvn sea mep lab 002',
  'LAB-001','LAB 001','LAB001','LAB-002','LAB-003','LAB-011','LAB-111',
  'EATONPARKPMEP008','EATONPARKP1MEP008',
  'EATON PARK P MEP008','EATON PARK P1 MEP008',
  'EATONPARKPMEP','EATONPARKP1MEP',
  'PHUHUNGMEP-090','PHMEP-090','PHU HUNG MEP090','PH MEP090',
  'C0-0-1','C001','M E P-0 0 9','MEP009','MEP9','MEP-009',
  'RED-001','红鹤别墅1.1区-MEP003','MÉP003','mep003','',
  'A11B','A1B1','X-Y-Z','ABC','AB-C','C111','C1'
 ];
 let checked=0,matched=0;
 for(const a of contracts)for(const b of contracts) {
   checked++;
   if(normalizeSmartContractNo(a)===normalizeSmartContractNo(b)){
     assert.equal(contractDigitsV2(a),contractDigitsV2(b),JSON.stringify({a,b}));
     matched++;
   }
 }
 assert.ok(checked>500&&matched>contracts.length);
});
test('contract candidate is intentionally broad, final business duplicate check unchanged',()=>{
 const a={project:'ELYSIAN',contractNo:'CSCECVN-SEA-MEP-LAB-002',ipcNo:'IPC017'};
 const b={project:'EATON',contractNo:'CSCECVN-SEA-MEP-SUPL-002',ipcNo:'MEP017'};
 assert.equal(contractDigitsV2(a.contractNo),contractDigitsV2(b.contractNo));
 assert.notEqual(duplicateKeyV1(a),duplicateKeyV1(b));
 assert.deepEqual(computeIndexV2(a),{contractDigitsV2:'002'});
 assert.equal(hasValidIndexV2({...a,contractDigitsV2:'002'}),true);
 assert.equal(hasValidIndexV2({...a,contractDigitsV2:'999'}),false);
 assert.notEqual(contractDigitsV2('LAB-002'),contractDigitsV2('LAB-003'));
});
test('browser and backend calculate identical ASCII contract digits excluding 1',()=>{
 const browser=fs.readFileSync(path.join(root,'site/assets/js/payment-index-v2-core.mjs'),'utf8');
 const backend=fs.readFileSync(path.join(root,'backend/payment-index-v2-core.cjs'),'utf8');
 for(const source of [browser,backend]){
   assert.match(source,/replace\(\/\[\^0-9\]\/g,''\)\.replace\(\/1\/g,''\)/);
 }
});
test('Rules validate contract candidate; V2 still gated off in production',()=>{
 const rules=fs.readFileSync(path.join(root,'security/firestore.rules.V2_STAGING_ONLY'),'utf8');
 assert.match(rules,/function validContractDigitsV2/);
 assert.ok(rules.includes("value.replace('[^0-9]','').replace('1','')"));
 assert.match(rules,/validContractDigitsV2\(request.resource.data\)/);
 assert.match(rules,/safeStaffLookupCreate/);
 const source=fs.readFileSync(path.join(root,'site/assets/js/firestore-payment.mjs'),'utf8');
 assert.match(source,/PAYMENT_V2_WRITERS_ENABLED=true/);
 assert.match(source,/contractDigitsV2/);
 for(const page of ['payment.html','payment-mobile-renderer.html']){
   const html=fs.readFileSync(path.join(root,'site',page),'utf8');
   assert.match(html,/PAYMENT_INDEX_V2_QUERY_CODE_ENABLED = false/);
   assert.match(html,/where\("contractDigitsV2","in",keys\.slice/);
   assert.match(html,/contractDigitsV2ForPreview\(row\.data\.contractNo\)/);
 }
});
