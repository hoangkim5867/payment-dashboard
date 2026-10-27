'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'../../site');
const cases=[
  ['payment.html','paymentIndexV1Ready'],
  ['payment-mobile-renderer.html','paymentIndexV1Ready'],
  ['contract-master.html','mepIndexV1Ready'],
];
function srcFor(file,name){
 const s=fs.readFileSync(path.join(root,file),'utf8');
 const start=s.indexOf('async function '+name+'(){');
 assert.ok(start>=0,'function missing '+name);
 const stop=s.indexOf('\n}',start);
 assert.ok(stop>start,'function body missing '+name);
 return s.slice(start,stop+2);
}
for(const [file,name] of cases){
 test(`${file}: permission marker refreshed every lookup; revoke takes effect without F5`,async()=>{
  let marker={ready:true,schemaVersion:1,continuousMaintenance:true,verified:true,synchronousWritersVerified:true,historySourceSeparated:true},reads=0;
  const sandbox={db:{},console:{warn(){},info(){}},doc:(_,c,d)=>`${c}/${d}`,
    getDocFromServer:async()=>{reads++;return {exists:()=>true,data:()=>marker}}};
  vm.createContext(sandbox);vm.runInContext(srcFor(file,name),sandbox);
  assert.equal(await sandbox[name](),true);
  marker={...marker,ready:false};
  assert.equal(await sandbox[name](),false);
  marker={...marker,ready:true,verified:false};
  assert.equal(await sandbox[name](),false);
  marker={...marker,verified:true};
  assert.equal(await sandbox[name](),true);
  assert.equal(reads,4,'must read marker once every call, not cached forever');
 });
 test(`${file}: missing/unreadable index fails closed`,async()=>{
   let called=0;
   const sandbox={db:{},console:{warn(){}},doc:()=>({}),getDocFromServer:async()=>{
     called++;if(called===1)return {exists:()=>false};throw new Error('permission denied');
   }};
   vm.createContext(sandbox);vm.runInContext(srcFor(file,name),sandbox);
   assert.equal(await sandbox[name](),false);
   assert.equal(await sandbox[name](),false);
 });
}
for(const file of ['payment.html','payment-mobile-renderer.html']){
 test(`${file}: zero IPC keys never creates an invalid indexed query`,async()=>{
  const s=fs.readFileSync(path.join(root,file),'utf8');
  const start=s.indexOf('async function ensureImportDuplicateHistoryForRows(');
  const end=s.indexOf('async function ensureImportDuplicateHistory()',start);
  let reads=0;
  const sandbox={PAYMENT_INDEX_QUERY_CODE_ENABLED:true,paymentIndexV1Ready:async()=>true,
   importDuplicateHistoryPayments:[{id:'old'}],importDuplicateHistoryLoaded:true,
   ensureImportDuplicateHistory:async()=>{throw new Error('Should not scan')},
   getDocs:async()=>{reads++;throw new Error('Should not query')},
   Set,Map,console};
  vm.createContext(sandbox);vm.runInContext(s.slice(start,end),sandbox);
  assert.equal((await sandbox.ensureImportDuplicateHistoryForRows([])).length,0);
  assert.equal(sandbox.importDuplicateHistoryLoaded,false);
  assert.equal(reads,0);
 });
}
