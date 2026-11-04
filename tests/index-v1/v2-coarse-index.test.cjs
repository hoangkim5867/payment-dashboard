'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {ipcDigitsV2,computeIndexV2,hasValidIndexV2}=require('../../backend/payment-index-v2-core.cjs');
const {normalize,duplicateKeyV1}=require('../../backend/payment-index-core.cjs');
const root=path.resolve(__dirname,'../..');
test('Rules-verifiable key selects every pair of genuinely equal normalized IPCs',()=>{
 const variants=['IPC001','ipc001',' IPC001 ','I P C 0 0 1','ÍPC001','IPC001\u0301','IPC-002','MEP-007','\u4e2d\u6587IPC003','ABC','áBC','','０１'];
 for(const a of variants)for(const b of variants){
   if(normalize(a)===normalize(b))assert.equal(ipcDigitsV2(a),ipcDigitsV2(b),JSON.stringify({a,b}));
 }
});
test('coarse index NEVER substitutes exact business duplicate check',()=>{
 const a={project:'ELYSIAN',contractNo:'LAB-002',ipcNo:'IPC017'};
 const b={project:'EATON',contractNo:'SUPL-001',ipcNo:'MEP017'};
 assert.equal(ipcDigitsV2(a.ipcNo),ipcDigitsV2(b.ipcNo));
 assert.notEqual(duplicateKeyV1(a),duplicateKeyV1(b));
 assert.deepEqual(computeIndexV2(a),{ipcDigitsV2:'017'});
 assert.equal(hasValidIndexV2({...a,ipcDigitsV2:'017'}),true);
 assert.equal(hasValidIndexV2({...a,ipcDigitsV2:'999'}),false);
});
test('browser and backend use exactly the same regex and null handling',()=>{
 const client=fs.readFileSync(path.join(root,'site/assets/js/payment-index-v2-core.mjs'),'utf8');
 assert.match(client,/replace\(\/\[\^0-9\]\/g,''\)/);
 const backend=fs.readFileSync(path.join(root,'backend/payment-index-v2-core.cjs'),'utf8');
 assert.match(backend,/replace\(\/\[\^0-9\]\/g,''\)/);
});
test('new V2 index must NOT be trusted without Rules+backfill activation',()=>{
 const rules=fs.readFileSync(path.join(root,'security/firestore.rules.V2_STAGING_ONLY'),'utf8');
 assert.match(rules,/function validIpcDigitsV2/);
 assert.match(rules,/\.replace\('\[\^0-9\]',''\)/);
 assert.match(rules,/validIpcDigitsV2\(request.resource.data\)/);
 assert.match(rules,/safeStaffLookupCreate/);
 const source=fs.readFileSync(path.join(root,'site/assets/js/firestore-payment.mjs'),'utf8');
 assert.match(source,/V1 indexed reads are under security hold/);
});
