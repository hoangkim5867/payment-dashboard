'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {contractDigitsV2}=require('../../backend/payment-index-v2-core.cjs');
const {duplicateKeyV1}=require('../../backend/payment-index-core.cjs');
const root=path.resolve(__dirname,'../../site');
function helperFor(page){
 const src=fs.readFileSync(path.join(root,page),'utf8');
 const start=src.indexOf('async function ensureImportDuplicateHistoryForRows(');
 const end=src.indexOf('async function ensureImportDuplicateHistory()',start);
 assert.ok(start>0&&end>start);
 return src.slice(start,end);
}
function runPreview(code,{ready,documents}){
 let queries=0,legacyReads=0,serverLookups=0;
 const context={
   Set,Map,console,TextEncoder,
   PAYMENT_INDEX_V2_QUERY_CODE_ENABLED:true,
   paymentIndexV2Ready:async()=>{serverLookups++;if(ready==='error')throw Error('marker unavailable');return ready;},
   importDuplicateHistoryPayments:[],importDuplicateHistoryLoaded:false,importDuplicateHistoryPromise:null,
   contractDigitsV2ForPreview:contractDigitsV2,
   normalizeLoadedPaymentData:x=>x,
   paymentsRef:{},
   where:(field,operator,values)=>({field,operator,values}),
   query:(ref,clause)=>clause,
   getDocs:async({field,operator,values})=>{
     assert.equal(field,'contractDigitsV2');assert.equal(operator,'in');
     queries++;const list=documents.filter(row=>values.includes(row.contractDigitsV2));
     return {forEach(fn){for(const item of list)fn({id:item.id,data:()=>item});}};
   },
   ensureImportDuplicateHistory:async()=>{legacyReads++;return documents;}
 };
 vm.createContext(context);vm.runInContext(code,context);
 return {
   async preview(rows){return await context.ensureImportDuplicateHistoryForRows(rows)},
   summary:()=>({queries,legacyReads,serverLookups,loaded:context.importDuplicateHistoryLoaded})
 };
}
for(const page of ['payment.html','payment-mobile-renderer.html']){
 test(page+': marker off/unavailable keeps safe legacy full-history duplicate checking',async()=>{
   const docs=[{id:'same',project:'ELYSIAN',contractNo:'LAB-002',ipcNo:'IPC017',contractDigitsV2:'002'}];
   const row={data:{project:'ELYSIAN',contractNo:'LAB002',ipcNo:'IPC017'}};
   for(const ready of [false,'error']){
     const sample=runPreview(helperFor(page),{ready,documents:docs});
     const result=await sample.preview([row]);
     assert.equal(result.length,1);
     assert.equal(duplicateKeyV1(result[0]),duplicateKeyV1(row.data));
     assert.equal(sample.summary().legacyReads,1);
     assert.equal(sample.summary().queries,0);
   }
 });
 test(page+': marker ready queries contract candidates only and leaves exact matcher intact',async()=>{
   const other=Array.from({length:77},(_,i)=>({id:'other-'+i,project:'EATON',contractNo:'SUPL-003',ipcNo:'IPC001',contractDigitsV2:'003'}));
   const docs=[
    {id:'same',project:'ELYSIAN',contractNo:'LAB-002',ipcNo:'IPC017',contractDigitsV2:'002'},
    {id:'collision',project:'EATON',contractNo:'SUPL-002',ipcNo:'IPC017',contractDigitsV2:'002'},...other
   ];
   const row={data:{project:'ELYSIAN',contractNo:'LAB002',ipcNo:'IPC017'}};
   const sample=runPreview(helperFor(page),{ready:true,documents:docs});
   const result=await sample.preview([row]);
   assert.deepEqual(Array.from(result,x=>x.id).sort(),['collision','same']);
   assert.deepEqual(Array.from(result.filter(x=>duplicateKeyV1(x)===duplicateKeyV1(row.data)),x=>x.id),['same']);
   assert.equal(sample.summary().queries,1);
   assert.equal(sample.summary().legacyReads,0);
   assert.equal(sample.summary().serverLookups,1);
 });
}
