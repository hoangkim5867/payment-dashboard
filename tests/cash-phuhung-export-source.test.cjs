'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../site/cash-control.html'),'utf8');
function grab(from,to){
  const start=html.indexOf(from),end=html.indexOf(to,start);
  assert.ok(start>=0&&end>start,'missing function '+from);
  return html.slice(start,end);
}
const code=grab('function excelGroupQuarterlyTaxRows(','function buildLegacyCashFlowSheet(');
function context(){
  const expenses=[{id:'a-1',status:'paid',actualDate:'2026-10-03',project:'PHU HUNG',direction:'out',actualAmount:125,
    contractNo:'C01',description:'source expense',bucket:'subcontract'}];
  const transfers=[{id:'tr-1',status:'paid',actualDate:'2026-10-04',fromProject:'PHU HUNG',toProject:'OTHER',actualAmount:50}];
  const ctx={
    window:{cashExportLang:'zh'},cashLang:'zh',
    allExpenses:()=>expenses,allTransfers:()=>transfers,
    monthOf:d=>d.slice(0,7),
    excelProjectCostBucket:x=>x.bucket,
    excelCashCompany:()=>'Vendor',excelCashContent:()=>'Invoice',
    excelCashIpc:()=>'IPC001',excelCashType:()=>'支出',
    excelInternalCounterpartyLabel:()=>'Internal',
    excelTransferContent:()=>'Transfer',excelTransferTypeLabel:()=>'Transfer type',
    excelTaxQuarterCode:()=>'',excelTaxQuarterContent:()=>'', $:()=>null,console
  };
  vm.createContext(ctx);vm.runInContext(code,ctx);
  return {ctx,expenses,transfers};
}
test('production source tagging preserves all preexisting public report columns',()=>{
  const f=context();
  const rows=f.ctx.legacyCashExportRows('2026-10','PHU HUNG');
  assert.equal(rows.length,2);
  assert.equal(rows[0]._syncIds[0],'expense:a-1');
  assert.equal(rows[1]._syncIds[0],'transfer:tr-1:out');
  const withoutMetadata=rows.map(x=>{const y={...x};delete y._syncIds;return y});
  assert.equal(withoutMetadata[0].subcontract,125);
  assert.equal(withoutMetadata[1].income,-50);
  assert.deepEqual(Object.keys(withoutMetadata[0]).sort(),[
    'company','content','contractNo','date','financial','income','indirect','ipc',
    'material','otherDirect','otherPayable','sortText','subcontract','type','_taxDirection','_taxQuarter'
  ].sort());
});
test('production source code explicitly avoids Google/Firestore writes',()=>{
  const block=grab('async function cashPhuHungExportSourceSnapshot(){','function cashPhuHungInitSourceExporter(){');
  assert.doesNotMatch(block,/\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction|fetch)\s*\(/);
  assert.match(block,/loadProjectPayments\('PHU HUNG'/);
  assert.match(block,/URL\.createObjectURL\(blob\)/);
});
