'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const core=require('../../backend/payment-index-core.cjs');
const site=path.resolve(__dirname,'../../site');
function sourceFunction(src,name){
  const marker='function '+name+'(';
  const start=src.indexOf(marker);
  assert.ok(start>=0,'missing '+name);
  let at=src.indexOf('{',start),depth=0,quote='',escape=false;
  for(let i=at;i<src.length;i++){
    const c=src[i];
    if(quote){if(escape){escape=false;continue;}if(c==='\\'){escape=true;continue;}if(c===quote)quote='';continue;}
    if('"\'`'.includes(c)){quote=c;continue;}
    if(c==='{')depth++;
    if(c==='}' && --depth===0)return src.slice(start,i+1);
    if(c!=='}')depth+=0; // --depth is only applied in `}` condition above
  }
  throw Error('unclosed function '+name);
}
const payment=fs.readFileSync(path.join(site,'payment.html'),'utf8');
const contract=fs.readFileSync(path.join(site,'contract-master.html'),'utf8');
const paymentContext=vm.createContext({});
for(const f of ['normalize','normalizeSmartText','normalizeSmartProject','normalizeSmartContractNo','paymentContractKey']){
  vm.runInContext(sourceFunction(payment,f),paymentContext);
}
const contractContext=vm.createContext({});
for(const f of ['normalizeMEPSearch','isMissingMEPCode','getMEPRawCode','isMEPHistoryPayment']){
  vm.runInContext(sourceFunction(contract,f),contractContext);
}
const projects=['EATON PARK P1','EATONPARKP1','PHU HUNG','PH','FOXCONN','FSCPCB','中建厂房','ELYSIAN','CR5-1B','红鹤别墅1.1区'];
const contracts=['CSCECVN-SEA-MEP-SUPL-001','EATON PARK P MEP008','PHUHUNG-MEP-090','CR5-1B-IPC-001',''];
const ipc=['IPC 001','IPC001','001','MEP008','IPC-002',''];
const types=['other','mep','labour','material','MEP','unknown'];
test('backend duplicate key parity matches the production-normalization functions',()=>{
  let checked=0;
  for(const project of projects)for(const contractNo of contracts)for(const ipcNo of ipc){
    const original=vm.runInContext('paymentContractKey('+JSON.stringify(project)+','+JSON.stringify(contractNo)+')+"||"+normalize('+JSON.stringify(ipcNo)+')',paymentContext);
    assert.equal(core.duplicateKeyV1({project,contractNo,ipcNo}),original);
    checked++;
  }
  assert.equal(checked,projects.length*contracts.length*ipc.length);
});
test('backend MEP membership matches UI for legacy payment variants',()=>{
  let count=0;
  for(const paymentType of types)for(const contractNo of ['MEP008','-','N/A','ABC',''])for(const code of ['MEP008','MEP-007','-','']){
    const row={paymentType,contractNo,budgetNo:code,ipcNo:'IPC001',contractId:'',internalExpenseCode:'',deleted:false};
    for(const mutation of [null,{deleted:true},{noMEPException:true},{internalExpenseCode:'NMEP-12'},{contractId:'contract-id'}]){
      const p={...row,...mutation};
      const ui=vm.runInContext('isMEPHistoryPayment('+JSON.stringify(p)+')',contractContext);
      assert.equal(core.isMEPHistoryPayment(p),ui,JSON.stringify(p));count++;
    }
  }
  assert.equal(count,types.length*5*4*5);
});
test('normalization aliases and same-vs-cross-month preservation',()=>{
  const old={id:'a',project:'EATONPARK',contractNo:'CSCECVN-001',ipcNo:'IPC001',paymentMonth:'2026-09',amount:10};
  const incoming={project:'EATON PARK',contractNo:'CSCECVN 001',ipcNo:'IPC001',paymentMonth:'2026-10',amount:10};
  assert.equal(core.duplicateKeyV1(old),core.duplicateKeyV1(incoming));
  const indexed=[old,{id:'b',project:'PH',contractNo:'CSCECVN-001',ipcNo:'IPC001',paymentMonth:'2026-10'}];
  assert.deepEqual(indexed.filter(p=>core.duplicateKeyV1(p)===core.duplicateKeyV1(incoming)).map(x=>x.id),['a']);
  assert.equal(core.computeIndexV1(old).mepLookupV1,false);
});
test('lookup remains gated until backfill and continuous maintenance are verified',()=>{
  for(const f of ['payment.html','payment-mobile-renderer.html','contract-master.html']){
    const source=fs.readFileSync(path.join(site,f),'utf8');
    assert.match(source,/paymentLookupV1/);
    assert.match(source,/continuousMaintenance\s*===\s*true/);
    assert.match(source,/verified\s*===\s*true/);
  }
  for(const f of ['payment.html','payment-mobile-renderer.html']){
    const source=fs.readFileSync(path.join(site,f),'utf8');
    assert.match(source,/ensureImportDuplicateHistoryForRows\(localRows\)/);
    assert.match(source,/where\("duplicateKeyV1","in",keys\.slice/);
    assert.match(source,/return ensureImportDuplicateHistory\(\)/);
  }
  const source=fs.readFileSync(path.join(site,'contract-master.html'),'utf8');
  assert.match(source,/where\("mepLookupV1","==",true\)/);
  assert.match(source,/\:\s*paymentsRef\)/);
});
test('index idempotence and source business fields unchanged',()=>{
  const p={project:'FOXCONN',contractNo:'MEP002',ipcNo:'IPC001',paymentType:'mep',amount:1_000_000,processActualAmount:50,deleted:false};
  assert.equal(core.needsIndexRepair(p),true);
  const i=core.computeIndexV1(p);
  assert.equal(core.needsIndexRepair({...p,...i}),false);
  assert.equal(p.amount,1_000_000);
  assert.equal(p.processActualAmount,50);
  assert.equal(i.mepLookupV1,true);
});
