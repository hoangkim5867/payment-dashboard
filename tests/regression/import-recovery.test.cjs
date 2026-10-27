'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
for(const page of ['payment.html','payment-mobile-renderer.html'])for(const failChunk of [1,2,0])test(page+' actual import handler recovery, failed chunk '+failChunk,async()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../site',page),'utf8'),start=html.indexOf('confirmExcelImportBtn.addEventListener('),end=html.indexOf('\n);',start)+4;
 assert(start>0&&end>start);let handler,chunk=0,committed=[],logs=[],alerts=[],refresh=0,undo=0;
 const stored=new Map(),button={textContent:'Import',disabled:false,addEventListener:(event,fn)=>handler=fn};
 const ctx={confirmExcelImportBtn:button,ensureOperator:()=>true,excelImportRows:Array.from({length:850},(_,i)=>({errors:[],warnings:[],data:{amount:i,paymentMonth:'2026-10'}})),
 requestCrossMonthImportDecision:async()=>true,markCrossMonthImportsAsSupplemental:()=>{},t:k=>k,currentLanguage:'en',currentAuthUser:{uid:'test-staff',email:'test@example.invalid'},
 db:{},paymentsRef:{},doc:()=>({id:'test-'+Math.random()}),serverTimestamp:()=>({serverTime:true}),lastImportBatchId:'',localStorage:{setItem:(k,v)=>stored.set(k,v)},updateUndoImportButton:()=>undo++,
 writeBatch:()=>{const staged=[];return {set:(ref,data)=>staged.push(data),commit:async()=>{chunk++;if(chunk===failChunk)throw Error('Injected chunk failure');committed.push(...staged)}}},
 logActivity:async(...args)=>logs.push(args),loadPayments:async()=>refresh++,importDefaultMonth:{value:'2026-10'},CURRENT_MONTH:'2026-10',alert:m=>alerts.push(m),console:{error:()=>{},warn:()=>{}},
 upsertVendor:async()=>{},syncImportedPaymentsToContracts:async()=>({added:0,updated:0,unchanged:0,updateDetails:[]}),contractMasterSyncDetailsText:()=>'',excelPasteArea:{value:'test'},closeExcelPasteImportModal:()=>{}};
 vm.runInNewContext(html.slice(start,end),ctx);await handler();assert.equal(button.disabled,false);assert.equal(button.textContent,'Import');
 if(failChunk===1){assert.equal(committed.length,0);assert.equal(stored.size,0);assert(!alerts[0].includes('Saved'));}
 else if(failChunk===2){assert.equal(committed.length,400);assert.equal(stored.get('paymentHistoryLastImportBatchId'),committed[0].importBatchId);assert(alerts[0].includes('Saved 400 rows'));assert(logs.some(x=>x[0]==='IMPORT_PARTIAL'));assert(refresh>0&&undo>0);}
 else{assert.equal(committed.length,850);assert.equal(logs.filter(x=>x[0]==='ADD').length,850);assert.equal(new Set(committed.map(x=>x.importBatchId)).size,1);}
 assert(committed.every(x=>x.createdByUid==='test-staff'));
});
