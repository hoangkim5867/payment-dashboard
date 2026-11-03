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


for(const page of htmls){
  test('Excel repeat preview saves reads but refreshes before import commit: '+page,()=>{
    const src=fs.readFileSync(path.resolve(__dirname,'../../site',page),'utf8');
    const begin=src.indexOf('const EXCEL_PREVIEW_HISTORY_REUSE_MS');
    const end=src.indexOf('function cancelPendingImportPersonPreview()',begin);
    assert.ok(begin>0&&end>begin,'reuse helper must exist');
    const sandbox={
      JSON,Date,importPaymentLookupKey:data=>
        [data.project,data.contractNo,data.ipcNo].join('||')
    };
    vm.createContext(sandbox);
    vm.runInContext(src.slice(begin,end),sandbox);
    const calc=vm.runInContext('excelPreviewDuplicateKey',sandbox);
    const row=data=>[{data}];
    const orig={project:'EATON',contractNo:'C-001',ipcNo:'IPC001',
      paymentMonth:'2026-10',personInCharge:'A'};
    assert.equal(calc(row(orig)),calc(row({...orig,personInCharge:'B'})),
      'Changing only the default person must reuse this IPC snapshot');
    assert.notEqual(calc(row(orig)),calc(row({...orig,ipcNo:'IPC002'})),
      'A different IPC may not reuse this snapshot');
    assert.notEqual(calc(row(orig)),calc(row({...orig,paymentMonth:'2026-11'})),
      'A different payment month may not reuse this snapshot');
    assert.match(src,/const canReuse=!forceFreshHistory && importDuplicateHistoryLoaded===true/);
    assert.match(src,/Date\.now\(\)<excelPreviewHistoryCacheExpiresAt/);
    assert.match(src,/await ensureImportDuplicateHistoryForRows\(localRows\)/);
    const confirm=src.indexOf('confirmExcelImportBtn.addEventListener(');
    const freshness=src.indexOf('if(excelPreviewReusedDuplicateHistory){',confirm);
    const recheck=src.indexOf('await renderExcelImportPreview({forceFreshHistory:true})',freshness);
    const valid=src.indexOf('const validRows =',confirm);
    const write=src.indexOf('await batch.commit();',confirm);
    assert.ok(confirm>0&&freshness>confirm&&recheck>freshness&&
      valid>recheck&&write>valid,
      'A reused preview must recheck and compare warnings before a batch can write');
    assert.match(src,/beforeWarnings!==afterWarnings/);
    assert.match(src,/if\(confirmExcelImportBtn.disabled\|\|beforeWarnings!==afterWarnings\)/);
    assert.match(src,/clearExcelPreviewHistoryCache\(\)/);
    assert.match(src,/importDuplicateHistoryLoaded===true/);
    assert.match(src,/if\(importDuplicateHistoryLoaded===true\)/);
    assert.match(src,/excelPreviewReusedDuplicateHistory=false/);
  });
}
