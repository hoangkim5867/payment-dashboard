'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const core=require('../../backend/payment-index-core.cjs');
const root=path.resolve(__dirname,'../..');
function extractFunction(src,name){
  const re=new RegExp('^function '+name+'\\([^\\n]*\\)\\s*\\{[\\s\\S]*?^\\}', 'm');
  const m=src.match(re);assert.ok(m,`Function ${name} missing`);return m[0];
}
for(const page of ['payment.html','payment-mobile-renderer.html']){
 test(`${page}: browser IPC key and indexed backend key match on real historical identifiers and edge cases`,()=>{
   const src=fs.readFileSync(path.join(root,'site',page),'utf8');
   const names=['normalize','normalizeSmartText','normalizeSmartProject','normalizeSmartContractNo','paymentContractKey','importPaymentLookupKey'];
   const ctx={};vm.createContext(ctx);
   for(const name of names)vm.runInContext(extractFunction(src,name),ctx);
   const normalizeFrontend=vm.runInContext('importPaymentLookupKey',ctx);
   // The baseline historical identifiers are read privately; no amounts, rows or identifiers are logged.
   const legacySrcPath=process.env.PAYMENT_PRIVATE_BASELINE;
   let entries=[];
   if(legacySrcPath){
     const legacy=fs.readFileSync(legacySrcPath,'utf8');
     const match=legacy.match(/^window\.HISTORY_2026_EMBEDDED\s*=\s*(\[.*?\]);/m);
     assert.ok(match,'Private baseline missing source');
     entries=JSON.parse(match[1]);
     assert.equal(entries.length,812);
   }
   const cases=[...entries,
     {project:'PHU HUNG',contractNo:'PHU HUNG-MEP-001',ipcNo:'001'},
     {project:'PH',contractNo:'PH-MEP 001',ipcNo:'IPC 001'},
     {project:'中建厂房',contractNo:'MEP-2026-X1',ipcNo:'01'},
     {project:'FOXCONN',contractNo:'MEP/2026/X1',ipcNo:'01'},
     {project:'EATON PARK',contractNo:'EATONPARKP MEP',ipcNo:'001'},
     {project:'ELYSIAN',contractNo:'',ipcNo:'01'},
     {project:'PHU HUNG',contractNo:'CN8-2-001',ipcNo:'Éxtra'},
   ];
   for(const p of cases){
      const front=normalizeFrontend(p),back=core.duplicateKeyV1(p);
      assert.equal(front,back,`Canonical key mismatch on one ${page} input`);
   }
 });
}
