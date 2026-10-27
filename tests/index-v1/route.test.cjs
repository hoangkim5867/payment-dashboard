'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const htmls=['payment.html','payment-mobile-renderer.html'];
for(const html of htmls){
  test('targeted indexed lookup selects only keys in import preview: '+html,async()=>{
    const src=fs.readFileSync(path.resolve(__dirname,'../../site',html),'utf8');
    const start=src.indexOf('async function ensureImportDuplicateHistoryForRows(');
    const end=src.indexOf('async function ensureImportDuplicateHistory()',start);
    assert.ok(start>=0&&end>start);
    const fn=src.slice(start,end);
    const rows=[{data:{project:'EATON PARK',contractNo:'A',ipcNo:'IPC001'}},
      {data:{project:'PH',contractNo:'B',ipcNo:'IPC002'}},
      {data:{project:'PH',contractNo:'B',ipcNo:'IPC002'}}];
    let reads=0,queries=[];
    const sandbox={
      Set,Map,console,TextEncoder,
      paymentIndexV1Ready:async()=>true,
      PAYMENT_INDEX_QUERY_CODE_ENABLED:true,
      importDuplicateHistoryPayments:[],importDuplicateHistoryLoaded:false,
      ensureImportDuplicateHistory:()=>{throw Error('must not do legacy scan')},
      paymentContractKey:(pr,co)=>pr+'||'+co,normalize:x=>String(x).toLowerCase(),
      importPaymentLookupKey:data=>data.project+'||'+data.contractNo+'||'+data.ipcNo,
      db:{},paymentsRef:{},
      where:(field,op,arr)=>({field,op,arr}),
      query:(_,w)=>w,
      getDocs:async(q)=>{reads++;queries.push(q);return {forEach(cb){
        cb({id:'doc1',data:()=>({project:'EATON PARK',contractNo:'A',ipcNo:'IPC001'})});
      }};},
      normalizeLoadedPaymentData:x=>x
    };
    vm.createContext(sandbox);vm.runInContext(fn,sandbox);
    const out=await sandbox.ensureImportDuplicateHistoryForRows(rows);
    assert.equal(reads,1);
    assert.equal(queries[0].field,'duplicateKeyV1');
    assert.equal(queries[0].op,'in');
    assert.equal(queries[0].arr.length,2);
    assert.equal(out.length,1);
    assert.equal(sandbox.importDuplicateHistoryLoaded,false);
  });
  test('index not ready preserves full-history duplicate checking: '+html,async()=>{
    const src=fs.readFileSync(path.resolve(__dirname,'../../site',html),'utf8');
    const start=src.indexOf('async function ensureImportDuplicateHistoryForRows(');
    const end=src.indexOf('async function ensureImportDuplicateHistory()',start);
    let fallback=0;
    const sandbox={Set,Map,console,TextEncoder,PAYMENT_INDEX_QUERY_CODE_ENABLED:true,
      paymentIndexV1Ready:async()=>false,
      ensureImportDuplicateHistory:async()=>{fallback++;return ['fallback']}};
    vm.createContext(sandbox);vm.runInContext(src.slice(start,end),sandbox);
    const out=await sandbox.ensureImportDuplicateHistoryForRows([{data:{}}]);
    assert.equal(fallback,1);
    assert.equal(out[0],'fallback');
  });
}
