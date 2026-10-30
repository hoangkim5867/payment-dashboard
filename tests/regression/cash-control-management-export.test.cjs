'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'../../site/cash-control.html'),'utf8');
function extract(start,end){
  const i=html.indexOf(start),j=html.indexOf(end,i+start.length);
  assert.ok(i>0 && j>i,'Export source functions exist: '+start);
  return html.slice(i,j);
}
const payroll=extract('function excelPayrollLabel(','function excelInternalCounterpartyLabel(');
const tax=extract('function excelTaxQuarterCode(','function legacyCashExportRows(');

function runtime(){
  const salaryRecords=[
    {id:'bonus1',project:'ADVANCE',type:'bonus',bonusYear:'2024',note:'2024年度安全生产达标奖'},
    {id:'tax1',project:'CR5-1B',type:'tax',payrollMonth:'2026-07',taxPeriod:'2026-Q3'}
  ];
  const context={
    cashLang:'zh',window:{cashExportLang:'zh'},
    cashCloudState:{
      salaryRecords,
      inflowRecords:[{id:'receipt1',number:'IPC008',project:'ADVANCE'}]
    },
    excelLinkedPayrollRecord:x=>salaryRecords.find(r=>r.id===x.linkedRecordId)||null,
    excelPayrollTypeFromCash:(x,r)=>r?.type||x.type||'other',
    inferPayrollStaffGroup:()=> 'cn',
    excelExportMonthText:m=>m,
    excelIsPersonalIncomeTaxRow:x=>x?.type==='tax'||/个人所得税|thuế\s*tncn/i.test(x?.description||''),
    payrollTaxPeriodCode:r=>r.taxPeriod,
    excelCashIpc:x=>x?.ipcNo||'',
    excelCashType:()=> '职工薪酬'
  };
  return vm.runInNewContext(payroll+'\n'+tax+'\n({excelCashContent,excelPayrollLabel,excelTaxQuarterCode,excelTaxQuarterContent,excelGroupQuarterlyTaxRows})',context);
}

test('Chinese IPC receipt uses compact identifier, preserves original receipt rows',()=>{
  const f=runtime();
  const original={linkedModule:'inflow',linkedRecordId:'receipt1',direction:'in',subCode:'IPC008',description:'Thu CĐT · IPC008 · Lần 1'};
  assert.equal(f.excelCashContent(original),'内部结算IPC008');
  assert.equal(original.description,'Thu CĐT · IPC008 · Lần 1');
});
test('Bonus note appears in export content, other payroll types retain existing captions',()=>{
  const f=runtime();
  const bonus={source:'payroll',linkedModule:'payroll',linkedRecordId:'bonus1',type:'bonus'};
  assert.equal(f.excelCashContent(bonus),'奖金 · 2024年度安全生产达标奖');
  assert.equal(f.excelCashContent({source:'payroll',type:'meal',period:'2026-09'}),'2026-09伙食费');
});
test('Tax quarter derives from linked tax period or tax source month, NOT payment month',()=>{
  const f=runtime();
  assert.equal(f.excelTaxQuarterCode({linkedRecordId:'tax1',type:'tax',description:'2026年07月个人所得税',actualDate:'2026-10-20'}),'2026-Q3');
  assert.equal(f.excelTaxQuarterCode({description:'2026年08月预交个人所得税',period:'2026-08',actualDate:'2026-10-20'}),'2026-Q3');
  assert.equal(f.excelTaxQuarterCode({description:'2026年04月个人所得税',period:'2026-04',actualDate:'2026-10-20'}),'2026-Q2');
  assert.equal(f.excelTaxQuarterContent('2026-Q3','zh'),'2026年第3季度个人所得税');
});
test('Quarter grouping preserves amounts, payment date and non-tax rows',()=>{
  const f=runtime();
  const r=[
    {date:'2026-10-20',content:'2026年07月个人所得税',indirect:20829676,income:0,_taxQuarter:'2026-Q3',_taxDirection:'out'},
    {date:'2026-10-20',content:'2026年08月个人所得税',indirect:34971933,income:0,_taxQuarter:'2026-Q3',_taxDirection:'out'},
    {date:'2026-10-20',content:'材料款',material:990000,income:0,_taxQuarter:'',_taxDirection:'out'},
    {date:'2026-10-20',content:'2026年04月个人所得税',indirect:100000,income:0,_taxQuarter:'2026-Q2',_taxDirection:'out'},
    {date:'2026-10-21',content:'2026年08月个人所得税',indirect:900000,income:0,_taxQuarter:'2026-Q3',_taxDirection:'out'}
  ];
  const out=f.excelGroupQuarterlyTaxRows(r,['income','indirect','material'],'zh');
  assert.equal(out.length,4);
  assert.equal(out[0].content,'2026年第3季度个人所得税');
  assert.equal(out[0].indirect,55801609);
  assert.equal(out[0].date,'2026-10-20');
  assert.equal(out[1].content,'材料款');
  assert.equal(out[2].content,'2026年第2季度个人所得税');
  assert.equal(out[3].date,'2026-10-21');
  const sum=arr=>arr.reduce((a,x)=>a+Number(x.indirect||0)+Number(x.material||0),0);
  assert.equal(sum(out),sum(r));
  assert.equal(r[0].indirect,20829676);
});
test('Only export code modified; Payment and underlying tax obligations are not touched',()=>{
  assert.match(html,/excelGroupQuarterlyTaxRows\(rows,\s*\['income','subcontract'/);
  assert.match(html,/excelGroupQuarterlyTaxRows\(rows,\['income','expense'\]/);
  assert.match(html,/function buildLegacyCombinedReportSheet\(/);
  assert.match(html,/function exportCashManagementExcel\(/);
  const code=extract('function excelTaxQuarterCode(','function legacyCashExportRows(');
  assert.doesNotMatch(code,/setDoc\(|updateDoc\(|deleteDoc\(|persistCashCloud\(|getDocs\(/);
});

test('Management report 02A groups same-day quarterly tax without changing closing balance',()=>{
 const core=extract('function excelGroupQuarterlyTaxRows(','function legacyCashExportRows(');
 const ledger=extract('function excelBuildLedger(','function excelBuildCategorySummary(');
 const transactions=[
  {id:'t1',type:'tax',description:'2026年07月个人所得税',amount:120,period:'2026-07'},
  {id:'t2',type:'tax',description:'2026年08月个人所得税',amount:180,period:'2026-08'},
  {id:'p1',category:'材料款',amount:75}
 ];
 const context={
  projectListForExport:()=>['CR5-1B'],
  allExpenses:()=>transactions,
  opening:()=>1000,
  movements:()=>[
   {recordId:'t1',date:'2026-10-20',in:0,out:120,desc:'2026年07月个人所得税',source:'legacy_salary',category:'税费'},
   {recordId:'p1',date:'2026-10-20',in:0,out:75,desc:'材料款',source:'payment',category:'材料款'},
   {recordId:'t2',date:'2026-10-20',in:0,out:180,desc:'2026年08月个人所得税',source:'legacy_salary',category:'税费'}
  ],
  excelTaxQuarterCode:x=>x.type==='tax'?(x.period==='2026-07'||x.period==='2026-08'?'2026-Q3':''):'',
  excelTaxQuarterContent:()=> '2026年第3季度个人所得税',
  window:{cashExportLang:'zh'},cashLang:'zh'
 };
 const fn=vm.runInNewContext(core+'\n'+ledger+'\nexcelBuildLedger',context);
 const out=fn('2026-10',['CR5-1B']);
 assert.equal(out.length,2);
 assert.equal(out[0]._taxQuarter,'2026-Q3');
 assert.equal(out[0].cashOut,300);
 assert.equal(out[1].cashOut,75);
 assert.equal(out[1].balance,625);
 assert.equal(out.reduce((a,x)=>a+x.movement,0),-375);
});
