'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {EXPORT_SOURCE,HELPERS,compileKernel}=
  require('../functions/cash-sync/export-kernel.cjs');
const source=fs.readFileSync(path.join(__dirname,'../site/cash-control.html'),'utf8');
const start=source.indexOf('function legacyCashExportRows(month,project){');
const end=source.indexOf('\n// Dedicated read-only, on-device source transfer',start);
const groupStart=source.indexOf('function excelGroupQuarterlyTaxRows(rows,moneyColumns,lang){');
function helpers(){
  const quarterSource=source.slice(groupStart,start).trim();
  const quarterFn=vm.runInNewContext(quarterSource+'\n;excelGroupQuarterlyTaxRows',
    {excelTaxQuarterContent:(quarter)=>'QUARTER '+quarter});
  return {
    monthOf:x=>String(x||'').slice(0,7),
    excelProjectCostBucket:x=>x.bucket,
    excelCashCompany:x=>x.company||'',
    excelCashContent:x=>x.content||x.description||'',
    excelCashIpc:x=>x.ipcNo||'',
    excelCashType:x=>x.type||'支出',
    excelTaxQuarterCode:x=>x._taxQuarter||'',
    excelInternalCounterpartyLabel:()=> '内部调剂',
    excelTransferContent:x=>(x.fromProject||'')+' → '+(x.toProject||''),
    excelTransferTypeLabel:()=> '内部转出',
    excelGroupQuarterlyTaxRows:quarterFn
  };
}
const expense=(id,amount,bucket,more={})=>({
  id,project:'PHU HUNG',status:'paid',source:'manual',
  actualDate:'2026-11-06',actualAmount:amount,direction:'out',bucket,
  company:'TEST',contractNo:'CONTRACT',ipcNo:'IPC017',...more
});
test('server export function source is byte-for-byte current Cash Control exporter',()=>{
  assert.ok(start>0&&end>start&&groupStart>0);
  assert.equal(EXPORT_SOURCE,source.slice(start,end).trim());
  assert.equal(HELPERS.length,10);
  assert.match(EXPORT_SOURCE,/excelProjectCostBucket\(x\)/);
  assert.match(EXPORT_SOURCE,/excelGroupQuarterlyTaxRows\(rows,/);
});
test('original financial exporter places salary bonuses in indirect, not other payable',()=>{
  const calc=compileKernel(helpers());
  const result=calc({
    project:'PHU HUNG',month:'2026-11',
    expenses:[expense('bonus1',432100,'indirect',{source:'payroll',content:'奖金 · 备注'})],
    transfers:[]
  });
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].values[10],432100);
  assert.equal(result.rows[0].values[12],0);
  assert.equal(result.rows[0].values[3],'奖金 · 备注');
  assert.equal(result.sourceComplete,false);
  assert.equal(result.authoritative,false,'isolated kernel must never unlock auto-writes');
});
test('original exporter keeps outgoing internal transfers as negative income',()=>{
  const calc=compileKernel(helpers());
  const transfer={id:'t1',project:'PHU HUNG',fromProject:'PHU HUNG',
    toProject:'EATON',status:'paid',actualDate:'2026-11-06',
    actualAmount:321000};
  const result=calc({
    project:'PHU HUNG',month:'2026-11',expenses:[],transfers:[transfer]
  });
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].values[6],-321000);
  assert.equal(result.rows[0].id,'PHU HUNG:transfer:t1:out');
});
test('existing Cash Control quarter grouping retains both source IDs and sums into indirect',()=>{
  const calc=compileKernel(helpers());
  const records=[
    expense('t1',100,'indirect',{_taxQuarter:'2026-Q4'}),
    expense('t2',200,'indirect',{_taxQuarter:'2026-Q4'})
  ];
  const result=calc({project:'PHU HUNG',month:'2026-11',
    expenses:records,transfers:[]});
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].values[10],300);
  assert.equal(result.rows[0].id,'tax:PHU HUNG:2026-11-06:2026-Q4:out');
});
test('unpaid / other project records do not appear, no hidden Payment reads',()=>{
  const calc=compileKernel(helpers());
  const result=calc({project:'PHU HUNG',month:'2026-11',
    expenses:[expense('a',1,'other',{status:'unpaid'}),
      expense('b',2,'other',{project:'EATON'})],transfers:[]});
  assert.equal(result.rows.length,0);
});
test('unsupported helpers and missing source IDs fail closed',()=>{
  assert.throws(()=>compileKernel({}),/helper/);
  const calc=compileKernel(helpers());
  assert.throws(()=>calc({project:'EATON',month:'2026-11',
    expenses:[],transfers:[]}),/Invalid bounded/);
  assert.throws(()=>calc({project:'PHU HUNG',month:'2026-11',
    expenses:[expense('',100,'indirect')],transfers:[]}),/stable source IDs/);
});
