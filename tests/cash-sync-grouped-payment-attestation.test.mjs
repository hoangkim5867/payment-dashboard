import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {attestMonth}=require('../server/cash-sync-project-source-attestation.cjs');
const {sha}=require('../server/cash-sync-multi-project-core.cjs');
const encode=v=>v===null?{nullValue:null}:
 typeof v==='string'?{stringValue:v}:
 typeof v==='number'?{integerValue:String(v)}:
 typeof v==='boolean'?{booleanValue:v}:
 Array.isArray(v)?{arrayValue:{values:v.map(encode)}}:
 {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};
const doc=obj=>({fields:Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,encode(v)]))});
const seedBody=JSON.stringify({LEGACY_SALARY:[],LEGACY_FINANCE:[],LEGACY_CASH_SPECIAL:[],LEGACY_VNB:[]});
const seedHash=createHash('sha256').update(seedBody).digest('hex');
const seed=doc({schemaVersion:1,sha256:seedHash,payload:seedBody});
const cloud=doc({revision:347,manualRecords:[],deletedLegacy:[],legacyOverrides:{}});
const payment=(id,amount)=>({id,project:'ELYSIAN',processPaymentDate:'2026-11-17',
 company:'Vendor',contractNo:'C-1',ipcNo:'IPC01',costType:'材料款',
 processActualAmount:amount});
const values=['2026-11-17','Vendor','C-1','材料款','IPC01','材料款',
 0,0,300,0,0,0,0];
const member1='expense:pay_a',member2='expense:pay_b';
const record={id:'ELYSIAN:'+member1+'+'+member2,project:'ELYSIAN',
 month:'2026-11',sourceClass:'PAYMENT',members:[member1,member2],
 values,hash:sha(values)};
const inspect=(records,payments=[payment('a',100),payment('b',200)])=>
 attestMonth({project:'ELYSIAN',month:'2026-11',revision:347,
 records,payments,cashDocument:cloud,seedDocument:seed,
 expectedSeedHash:seedHash,appendOnly:true});
test('a grouped paid Payment row attests two exact IDs and aggregate amount',()=>{
 const out=inspect([record]);
 assert.equal(out.verified,true);
 assert.equal(out.sourceIdsMatched,true);
 assert.deepEqual(out.blockers,[]);
 assert.equal(out.canWrite,false);
 assert.equal(out.googleWrites,0);
});
test('grouped IDs never authorize a changed monetary amount',()=>{
 const out=inspect([record],[payment('a',100),payment('b',201)]);
 assert.equal(out.verified,false);
 assert.ok(out.blockers.includes('GROUPED_PAYMENT_DATE_AMOUNT_OR_CATEGORY_CHANGED'));
});
test('grouped row cannot cite missing, repeated or out-of-order members',()=>{
 const missing=inspect([record],[payment('a',100)]);
 assert.ok(missing.blockers.includes('GROUPED_PAYMENT_DOC_NOT_FOUND'));
 const duplicate=inspect([{...record,members:[member1,member1]}]);
 assert.ok(duplicate.blockers.includes('GROUPED_PAYMENT_ID_INVALID'));
 const reversed=inspect([{...record,members:[member2,member1]}]);
 assert.ok(reversed.blockers.includes('GROUPED_PAYMENT_ID_INVALID'));
});
test('grouped money cannot silently combine different categories or dates',()=>{
 const category=inspect([record],[payment('a',100),{...payment('b',200),costType:'分包款'}]);
 assert.ok(category.blockers.includes('GROUPED_PAYMENT_CATEGORY_MISMATCH'));
 const date=inspect([record],[payment('a',100),{...payment('b',200),processPaymentDate:'2026-11-18'}]);
 assert.ok(date.blockers.length>0);
});
test('grouped payroll remains blocked, not treated as verified Payment',()=>{
 const out=inspect([{...record,sourceClass:'PAYROLL'}]);
 assert.equal(out.verified,false);
 assert.ok(out.blockers.includes('GROUPED_TAX_TRANSFER_OR_SOURCE_ID_UNSUPPORTED'));
});

test('a single paid manual Cash Control expense is checked against its original record',()=>{
 const member='expense:manual_123';
 const v=['2026-11-17','Vendor','C-1','Materials','','材料款',
  0,0,120,0,0,0,0];
 const manual={id:'manual_123',kind:'normal',source:'manual',status:'paid',
  project:'ELYSIAN',actualDate:'2026-11-17',direction:'out',
  category:'Vật tư',contractName:'Materials',company:'Vendor',
  contractNo:'C-1',actualAmount:120,amount:120};
 const row={id:'ELYSIAN:'+member,project:'ELYSIAN',month:'2026-11',
  sourceClass:'CASH',members:[member],values:v,hash:sha(v)};
 const verify=(cash,record=row)=>attestMonth({project:'ELYSIAN',
  month:'2026-11',revision:347,records:[record],payments:[],
  cashDocument:doc({revision:347,manualRecords:[cash],deletedLegacy:[],legacyOverrides:{}}),
  seedDocument:seed,expectedSeedHash:seedHash,appendOnly:true});
 const valid=verify(manual);
 assert.equal(valid.verified,true,JSON.stringify(valid.blockers));
 assert.equal(valid.sourceIdsMatched,true);
 assert.equal(valid.googleWrites,0);
 const changed=verify({...manual,actualAmount:121,amount:121});
 assert.equal(changed.verified,false);
 assert.ok(changed.blockers.includes('MANUAL_CASH_SOURCE_OR_AMOUNT_MISMATCH'));
 const payroll=verify({...manual,source:'payroll'});
 assert.equal(payroll.verified,false);
 const missing=verify({...manual,id:'manual_different'});
 assert.equal(missing.verified,false);
});

test('linked payroll is checked against salary record and Chinese export labels',()=>{
 const member='expense:manual_salary_payroll_123';
 const salary={id:'salary_123',project:'ELYSIAN',type:'salary',staffGroup:'vn',
  payrollMonth:'2026-11',actualDate:'2026-11-17',actualAmount:500};
 const cash={id:'manual_salary_payroll_123',kind:'normal',source:'payroll',
  linkedModule:'payroll',linkedRecordId:'salary_123',status:'paid',project:'ELYSIAN',
  direction:'out',actualDate:'2026-11-17',amount:500,actualAmount:500};
 const v=['2026-11-17','越籍员工工资','','2026年11月越籍员工工资','','职工薪酬',
  0,0,0,0,500,0,0];
 const record={id:'ELYSIAN:'+member,project:'ELYSIAN',month:'2026-11',
  sourceClass:'PAYROLL',members:[member],values:v,hash:sha(v)};
 const verify=(s,c=cash)=>attestMonth({project:'ELYSIAN',month:'2026-11',
  revision:347,records:[record],payments:[],
  cashDocument:doc({revision:347,manualRecords:[c],salaryRecords:[s],
   deletedLegacy:[],legacyOverrides:{}}),
  seedDocument:seed,expectedSeedHash:seedHash,appendOnly:true});
 const ok=verify(salary);
 assert.equal(ok.verified,true,JSON.stringify(ok.blockers));
 assert.equal(ok.sourceIdsMatched,true);
 assert.equal(ok.googleWrites,0);
 const changed=verify({...salary,actualAmount:501});
 assert.equal(changed.verified,false);
 assert.ok(changed.blockers.includes('PAYROLL_LINKED_SOURCE_OR_AMOUNT_MISMATCH'));
 const missing=verify({...salary,id:'other_salary'});
 assert.equal(missing.verified,false);
 const tax=verify({...salary,type:'tax'});
 assert.equal(tax.verified,false);
});

test('quarterly PIT group certifies exact linked tax IDs and summed indirect cost',()=>{
 const ids=['manual_salary_tax_1','manual_salary_tax_2'];
 const members=ids.map(id=>'expense:'+id);
 const taxRows=ids.map((id,i)=>({id,kind:'normal',source:'payroll',
  linkedModule:'payroll',linkedRecordId:'tax_'+i,project:'ELYSIAN',
  status:'paid',direction:'out',actualDate:'2026-11-17',
  contractNo:'',actualAmount:i===0?70:30,amount:i===0?70:30}));
 const salaryRecords=ids.map((id,i)=>({id:'tax_'+i,project:'ELYSIAN',
  type:'tax',taxPeriod:'2026-Q4',actualDate:'2026-11-17',
  actualAmount:i===0?70:30}));
 const v=['2026-11-17','个人所得税','','2026年第4季度个人所得税','','职工薪酬',
  0,0,0,0,100,0,0];
 const row={id:'tax:ELYSIAN:2026-11-17:2026-Q4:out',
  project:'ELYSIAN',month:'2026-11',sourceClass:'PAYROLL',members,
  values:v,hash:sha(v)};
 const verify=(taxes,salary=salaryRecords)=>attestMonth({
  project:'ELYSIAN',month:'2026-11',revision:347,records:[row],
  payments:[],cashDocument:doc({revision:347,manualRecords:taxes,
   salaryRecords:salary,deletedLegacy:[],legacyOverrides:{}}),
  seedDocument:seed,expectedSeedHash:seedHash,appendOnly:true});
 const valid=verify(taxRows);
 assert.equal(valid.verified,true,JSON.stringify(valid.blockers));
 assert.equal(valid.sourceIdsMatched,true);
 assert.equal(valid.googleWrites,0);
 const bad=verify([{...taxRows[0],actualAmount:80,amount:80},taxRows[1]]);
 assert.equal(bad.verified,false);
 assert.ok(bad.blockers.includes('GROUPED_TAX_SOURCE_OR_AMOUNT_MISMATCH'));
 const q=verify(taxRows,[{...salaryRecords[0],taxPeriod:'2026-Q3'},salaryRecords[1]]);
 assert.equal(q.verified,false);
});
