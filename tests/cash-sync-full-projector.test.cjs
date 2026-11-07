'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {CONSTANTS,FUNCTIONS,buildExactCashRuntime}=
  require('../functions/cash-sync/exact-source-runtime.cjs');
const {projectExactCashMonth}=require('../functions/cash-sync/full-projector.cjs');
const html=fs.readFileSync(path.resolve(__dirname,'../site/cash-control.html'),'utf8');
const originalFunction=name=>{
  const rx=new RegExp('(?<=^|\\n)function\\s+'+name+'\\s*\\(');
  const m=rx.exec(html);
  assert.ok(m,'original helper missing from Cash Control: '+name);
  const end=html.indexOf('\nfunction ',m.index+10);
  assert.ok(end>m.index,'unbounded browser helper: '+name);
  return html.slice(m.index,end).trim();
};
const originalConstant=(key)=>{
  const starts={ACC_GROUPS:'const ACC_GROUPS=',SUB_ZH:'const SUB_ZH=',
    CASH_I18N:'const CASH_I18N=',DEFAULT_PROJECTS:'const DEFAULT_PROJECTS='};
  const ends={ACC_GROUPS:'const SUB_ZH=',SUB_ZH:'\nfunction groupLabel(',
    CASH_I18N:'\nfunction cashT(',DEFAULT_PROJECTS:'\n/* Project IDs'};
  const start=html.indexOf(starts[key]),end=html.indexOf(ends[key],start+3);
  assert.ok(start>0&&end>start,'original constant missing: '+key);
  return html.slice(start,end).trim();
};
const seed=()=>({LEGACY_SALARY:[],LEGACY_FINANCE:[],
  LEGACY_VNB:[],LEGACY_CASH_SPECIAL:[]});
const cash=()=>({manualRecords:[],salaryRecords:[],inflowRecords:[],
  legacyOverrides:{},deletedLegacy:[],openingStart:{}});
const base=overrides=>({month:'2026-11',project:'PHU HUNG',payments:[],
  cashPrivate:cash(),legacySeed:seed(),...overrides});
test('all 45 accounting helper functions match the latest Cash Control byte-for-byte',()=>{
  assert.ok(Object.keys(FUNCTIONS).length>=45);
  for(const [name,text] of Object.entries(FUNCTIONS)){
    assert.equal(text,originalFunction(name),
      'Cash Control updated helper '+name+' — require explicit fresh export.');
  }
  for(const [key,text] of Object.entries(CONSTANTS))
    assert.equal(text,originalConstant(key),'Cash Control updated financial label '+key);
});
test('raw paid Payment becomes same Chinese expense type & indirect column as Cash Control',()=>{
  const raw={id:'P1',project:'PHU HUNG',processPaymentDate:'2026-11-06',
    amount:321000,processActualAmount:321000,costType:'间接费',
    company:'VENDOR',contractNo:'CON-1',ipcNo:'IPC017'};
  const result=projectExactCashMonth(base({payments:[raw]}));
  assert.equal(result.rows.length,1);
  const row=result.rows[0];
  assert.equal(row.values[0],'2026-11-06');
  assert.equal(row.values[5],'间接费');
  assert.equal(row.values[10],321000);
  assert.equal(row.values[12],0);
  assert.equal(row.id,'PHU HUNG:expense:pay_P1');
  assert.equal(result.authoritative,false);
});
test('source payroll-linked bonus preserves 备注 and original indirect accounting',()=>{
  const state=cash();
  state.salaryRecords.push({id:'bon1',type:'bonus',project:'PHU HUNG',
    payrollMonth:'2026-10',note:'Thưởng hoàn thành tiến độ',bonusYear:'2026'});
  state.manualRecords.push({id:'payroll1',source:'payroll',linkedModule:'payroll',
    linkedRecordId:'bon1',project:'PHU HUNG',direction:'out',
    category:'Thưởng',status:'paid',actualDate:'2026-11-06',
    actualAmount:525000,amount:525000});
  const result=projectExactCashMonth(base({cashPrivate:state}));
  assert.equal(result.rows.length,1);
  const row=result.rows[0];
  assert.equal(row.values[10],525000,'indirect must be K among 7 money columns');
  assert.equal(row.values[12],0,'not other payable');
  assert.match(row.values[3],/奖金/);
  assert.match(row.values[3],/Thưởng hoàn thành tiến độ/);
});
test('internal transfer uses original signed income in Google ledger',()=>{
  const state=cash();
  state.manualRecords.push({id:'transfer1',kind:'transfer',source:'manual',
    status:'paid',actualDate:'2026-11-06',actualAmount:100000,
    amount:100000,fromProject:'PHU HUNG',toProject:'EATON',
    transferType:'transfer'});
  const result=projectExactCashMonth(base({cashPrivate:state}));
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].values[6],-100000);
  assert.equal(result.rows[0].id,'PHU HUNG:transfer:transfer1:out');
});
test('linked IPC receipt shows Chinese 内部结算IPC instead of misleading installment',()=>{
  const state=cash();
  state.inflowRecords.push({id:'in1',number:'IPC008',project:'PHU HUNG'});
  state.manualRecords.push({id:'cashIn1',linkedModule:'inflow',linkedRecordId:'in1',
    status:'paid',direction:'in',project:'PHU HUNG',
    actualDate:'2026-11-06',amount:320000,actualAmount:320000,
    description:'Thu CĐT · IPC008 · Lần 1'});
  const result=projectExactCashMonth(base({cashPrivate:state}));
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].values[3],'内部结算IPC008');
  assert.equal(result.rows[0].values[6],320000);
});
test('quarter tax from payroll records is grouped without independently calculating buckets',()=>{
  const state=cash();
  state.salaryRecords.push({id:'tax1',type:'tax',taxPeriod:'2026-Q4',
    project:'PHU HUNG',payrollMonth:'2026-10'},
    {id:'tax2',type:'tax',taxPeriod:'2026-Q4',
      project:'PHU HUNG',payrollMonth:'2026-10'});
  for(const [id,linkedId,amount] of [['m1','tax1',100],['m2','tax2',200]]){
    state.manualRecords.push({id,source:'payroll',linkedModule:'payroll',
      linkedRecordId:linkedId,project:'PHU HUNG',category:'Thuế TNCN',
      status:'paid',direction:'out',actualDate:'2026-11-06',
      actualAmount:amount,amount});
  }
  const result=projectExactCashMonth(base({cashPrivate:state}));
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].values[10],300);
  assert.equal(result.rows[0].id,'tax:PHU HUNG:2026-11-06:2026-Q4:out');
});
test('paid legacy salary is projected once; current nonpaid Payment never enters ledger',()=>{
  const history=seed();history.LEGACY_SALARY.push({id:'legacy_salary_t1',
    source:'legacy_salary',project:'PHU HUNG',status:'paid',
    actualDate:'2026-11-06',actualAmount:200000,direction:'out',
    category:'Lương Trung Quốc'});
  const result=projectExactCashMonth(base({legacySeed:history,
    payments:[{id:'plan1',project:'PHU HUNG',amount:80000,
      paymentMonth:'2026-11',costType:'间接费'}]}));
  assert.equal(result.rows.length,1);
  assert.equal(result.rows[0].values[10],200000);
});
test('incomplete sources cannot declare valid automatically verified ledger',()=>{
  const insufficient=base({payments:[{project:'PHU HUNG',amount:100}]});
  assert.throws(()=>projectExactCashMonth(insufficient),/document ID/);
  assert.throws(()=>projectExactCashMonth(base({legacySeed:{}})),/source records/);
  const result=projectExactCashMonth(base());
  assert.equal(result.sourceComplete,false);
  assert.equal(result.authoritative,false);
});
