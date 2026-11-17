'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {attestMonth}=require('../server/cash-sync-project-source-attestation.cjs');
const {sha,parseValues}=require('../server/cash-sync-multi-project-core.cjs');
const {validate,inspect}=require('../server/cash-sync-batch-source-reader.cjs');
function encode(v){
 if(v===null)return {nullValue:'NULL_VALUE'};
 if(Array.isArray(v))return {arrayValue:{values:v.map(encode)}};
 if(typeof v==='object')return {mapValue:{fields:Object.fromEntries(
  Object.entries(v).map(([key,value])=>[key,encode(value)]))}};
 if(typeof v==='number')return Number.isSafeInteger(v)?
  {integerValue:String(v)}:{doubleValue:v};
 if(typeof v==='boolean')return {booleanValue:v};
 if(typeof v==='string')return {stringValue:v};
 throw Error('UNSUPPORTED_FIXTURE');
}
const doc=v=>({fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))});
const legacy=()=>({schemaVersion:1,LEGACY_SALARY:[],LEGACY_FINANCE:[],
 LEGACY_CASH_SPECIAL:[],LEGACY_VNB:[]});
const cloud=()=>({revision:341,manualRecords:[],deletedLegacy:[],
 legacyOverrides:{},inflowRecords:[],salaryRecords:[],paymentRequests:[]});
const archives=()=>{
 const payload=JSON.stringify(legacy());
 return {seedDocument:doc({schemaVersion:1,payload,
  sha256:createHash('sha256').update(payload).digest('hex')}),
  cashDocument:doc(cloud()),
  expectedSeedHash:createHash('sha256').update(payload).digest('hex')};
};
const p=()=>({id:'test1',project:'CN8-2',processPaymentDate:'2026-10-15',
 processActualAmount:100,amount:200,costType:'分包款',
 company:'Vendor',contractNo:'C1',ipcNo:'IPC001'});
const rec=()=>{
 const values=['2026-10-15','Vendor','C1','Invoice','IPC001','分包款',
  0,100,0,0,0,0,0];
 return {id:'CN8-2:expense:pay_test1',project:'CN8-2',month:'2026-10',
  sourceClass:'PAYMENT',members:['expense:pay_test1'],values,
  hash:sha(parseValues(values))};
};
function check(opts={}){
 return attestMonth({project:'CN8-2',month:'2026-10',revision:341,
  records:[rec()],payments:[p()],...archives(),...opts});
}
test('verified narrowly-scoped canonical Payment docs, cash revision and independent 7 money columns',()=>{
 const x=check();
 assert.equal(x.kind,'INDEPENDENT_PROJECT_MONTH_SOURCE_CHECK_V1');
 assert.equal(x.paymentRowsRead,1);
 assert.equal(x.canonicalPaidRows,1);
 assert.equal(x.verified,true);
 assert.equal(x.blockers.length,0);
 assert.equal(x.sourceIdsMatched,true);
 assert.equal(x.sourceComplete,false);
 assert.equal(x.fullPaymentAliasHistoryCertified,false);
 assert.equal(x.canWrite,false);
 assert.equal(x.googleWrites,0);
 assert.equal(JSON.stringify(x).includes('Vendor'),false);
 assert.equal(JSON.stringify(x).includes('C1'),false);
});
test('missing or extra Payment, changed amounts/companies/IPC/categories and bad hash all fail closed',()=>{
 for(const mutation of [
  x=>{x.payments=[]},
  x=>{x.payments.push({...p(),id:'another'})},
  x=>{x.payments[0].processActualAmount=101},
  x=>{x.payments[0].costType='unknown'},
  x=>{x.records[0].values[1]='Fake vendor'},
  x=>{x.records[0].values[4]='WRONG IPC'},
  x=>{x.records[0].hash='a'.repeat(64)},
  x=>{x.records[0].members[0]='expense:pay_fake'},
  x=>{x.records[0].sourceClass='UNKNOWN'},
  x=>{x.records[0].values[7]=0;x.records[0].values[10]=100}
 ]){
  const args={records:[rec()],payments:[p()]};
  mutation(args);
  const result=check(args);
  assert.equal(result.verified,false);
  assert.ok(result.blockers.length>0);
  assert.equal(result.canWrite,false);
 }
});
test('legacy salary, transfer and staff source blocks generic Payment-only certification',()=>{
 const pair=archives();
 const changed=cloud();changed.manualRecords.push({
  id:'manual_salary_1',project:'CN8-2',status:'paid',actualDate:'2026-10-15',
  actualAmount:50,direction:'out'});
 const result=check({...pair,cashDocument:doc(changed)});
 assert.equal(result.verified,false);
 assert.ok(result.blockers.includes('CASH_OR_LEGACY_SOURCE_REQUIRES_RULES'));
 const transfer=cloud();transfer.manualRecords=[{
  id:'loan1',kind:'transfer',status:'paid',actualDate:'2026-10-16',
  fromProject:'CN8-2',toProject:'FOXCONN',amount:10}];
 assert.ok(check({cashDocument:doc(transfer)}).blockers.includes('CASH_OR_LEGACY_SOURCE_REQUIRES_RULES'));
});
test('cash revision, legacy signature and project month are bound; FOXCONN needs special column proof',()=>{
 assert.throws(()=>check({revision:342}),/SOURCE_REVISION_OR_ARCHIVE_CHANGED/);
 assert.throws(()=>check({expectedSeedHash:'a'.repeat(64)}),/LEGACY_ARCHIVE_FINGERPRINT_CHANGED/);
 const foxRec={...rec(),project:'FOXCONN',id:'FOXCONN:expense:pay_test1'};
 const fx=attestMonth({project:'FOXCONN',month:'2026-10',revision:341,
  records:[foxRec],payments:[{...p(),project:'FOXCONN'}],...archives()});
 assert.equal(fx.verified,false);
 assert.ok(fx.blockers.includes('FOXCONN_IMPORT_TAX_LAYOUT_REQUIRES_RULES'));
});
test('Admin API rejects ambiguous, broad, duplicate or malformed source scopes BEFORE network',()=>{
 const request={action:'verify_monthly_projects',month:'2026-10',revision:341,
  projects:[{project:'CN8-2',records:[rec()]}]};
 assert.equal(validate(request),request);
 for(const bad of [
  {...request,projects:[]},
  {...request,projects:[request.projects[0],request.projects[0]]},
  {...request,month:'2026-13'},
  {...request,revision:-1},
  {...request,projects:[{project:'CN8-2',records:[]}]},
  {...request,projects:[{project:'CN8-2',records:[{...rec(),hash:'x'}]}]},
  {...request,forceWrites:true}
 ])assert.throws(()=>validate(bad),/MONTHLY_SOURCE/);
});
test('Admin batch endpoint uses two immutable documents and ONE indexed paid month query, NO Google writes',async()=>{
 const seen=[];const request={action:'verify_monthly_projects',
  month:'2026-10',revision:341,projects:[{project:'CN8-2',records:[rec()]}]};
 const pair=archives();
 const env={VERCEL_ENV:'production',
  CASH_SYNC_FIREBASE_PROJECT_ID:'cscecmep-payment',CASH_SYNC_ADMIN_UID:'trustedAdmin'};
 const result=await inspect({env,input:request,jwt:'mockjwt',
  verifyAdmin:async()=>{},
  fetcher:async(url,init)=>{
   seen.push({url,init});
   if(url.includes('legacy_seed_'))return {ok:true,json:async()=>pair.seedDocument};
   if(url.includes('/lehoangoanh'))return {ok:true,json:async()=>pair.cashDocument};
   if(url.endsWith(':runQuery'))return {ok:true,json:async()=>[{
    document:{name:'projects/cscecmep-payment/databases/(default)/documents/payments/test1',
     ...doc(p())}}]};
   throw Error('Unexpected request');
  }});
 assert.equal(seen.length,3);
 assert.equal(seen.filter(x=>x.init.method==='POST').length,1);
 const payload=JSON.parse(seen.find(x=>x.url.endsWith(':runQuery')).init.body);
 assert.deepEqual(payload.structuredQuery.from,[{collectionId:'payments'}]);
 assert.equal(payload.structuredQuery.where.compositeFilter.filters[0]
  .fieldFilter.field.fieldPath,'processPaymentDate');
 assert.equal(result.paymentDocumentsReturned,1);
 assert.equal(result.projects[0].verified,false); // Fake legacy fixture differs from pinned Production seed hash.
 assert.equal(result.canWrite,false);assert.equal(result.googleWrites,0);
 assert.ok(!seen.some(x=>x.url.includes('sheets.googleapis.com')));
});
test('wrong environment and unauthorized Admin cause ZERO Firebase calls',async()=>{
 let requests=0;
 const args={input:{action:'verify_monthly_projects',month:'2026-10',
  revision:341,projects:[{project:'CN8-2',records:[rec()]}]},
  jwt:'notadmin',fetcher:async()=>{requests++;throw Error('unexpected fetch')}};
 await assert.rejects(inspect({...args,env:{VERCEL_ENV:'preview',
  CASH_SYNC_FIREBASE_PROJECT_ID:'cscecmep-payment',CASH_SYNC_ADMIN_UID:'x1234'},
  verifyAdmin:async()=>{throw Error('should not reach auth')}}),/PRODUCTION_FIREBASE_AUTH_REQUIRED/);
 await assert.rejects(inspect({...args,env:{VERCEL_ENV:'production',
  CASH_SYNC_FIREBASE_PROJECT_ID:'cscecmep-payment',CASH_SYNC_ADMIN_UID:'x1234'},
  verifyAdmin:async()=>{throw Error('DENIED')}}),/DENIED/);
 assert.equal(requests,0);
});

test('FOXCONN tax column does not invalidate another project in a candidate batch',()=>{
 const record=rec(),fox={...record,id:'FOXCONN:expense:pay_test1',project:'FOXCONN',
  values:[...record.values,0]};
 fox.hash=sha(parseValues(fox.values,{foxconn:true}));
 const input={action:'verify_monthly_projects',candidateOnly:true,
  month:record.month,revision:341,projects:[
   {project:record.project,records:[record]},{project:fox.project,records:[fox]}
  ]};
 assert.equal(validate(input),input);
 const result=attestMonth({project:'FOXCONN',month:fox.month,revision:341,
  records:[fox],payments:[{...p(),project:'FOXCONN'}],...archives(),appendOnly:true});
 assert.equal(result.verified,false);
 assert.ok(result.blockers.includes('FOXCONN_IMPORT_TAX_LAYOUT_REQUIRES_RULES'));
 assert.equal(result.canWrite,false);
});

test('a linked client receipt is certified only from its protected inflow and cash records',()=>{
 const date='2026-11-10',project='H14-3',cashId='manual_inflow_i1_r1';
 const cash={id:cashId,project,kind:'normal',source:'manual',direction:'in',
  status:'paid',actualDate:date,amount:1300,actualAmount:1300,
  category:'Tiền thu chủ đầu tư',counterparty:'Client',subCode:'IPC008',
  linkedModule:'inflow',linkedRecordId:'i1',linkedReceiptId:'r1'};
 const inflow={id:'i1',project,number:'IPC008',cashTxnIds:[cashId],
  receipts:[{id:'r1',date,amount:1300}]};
 const values=[date,'Client','','内部结算IPC008','IPC008','业主收款',1300,0,0,0,0,0,0];
 const record={id:project+':expense:'+cashId,project,month:'2026-11',
  sourceClass:'CASH',members:['expense:'+cashId],values,hash:sha(parseValues(values))};
 const run=(r,entries,receipts)=>attestMonth({project,month:record.month,revision:341,
  records:[r],payments:[],...archives(),appendOnly:true,
  cashDocument:doc({...cloud(),manualRecords:entries,inflowRecords:receipts})});
 assert.equal(run(record,[cash],[inflow]).verified,true);
 assert.equal(run(record,[cash],[inflow]).canWrite,false);
 assert.equal(run(record,[cash,cash],[inflow]).verified,false);
 assert.equal(run(record,[cash],[{...inflow,receipts:[{...inflow.receipts[0],amount:1}]}]).verified,false);
 const changed=[...values];changed[6]=2;
 assert.equal(run({...record,values:changed,hash:sha(parseValues(changed))},[cash],[inflow]).verified,false);
});

test('a canonical manual transfer binds the dated and signed amount to each exact project',()=>{
 const date='2026-11-16',cashId='manual_transfer_123';
 const cash={id:cashId,kind:'transfer',source:'manual',direction:'transfer',
  status:'paid',actualDate:date,amount:1300,actualAmount:1300,
  transferType:'loan',fromProject:'CN8-2',toProject:'H14-3',lender:'CN8-2',borrower:'H14-3'};
 const run=(project,leg,label,amount,entry=cash)=>{
  const member='transfer:'+cashId+':'+leg;
  const values=[date,'内部调剂','','H14-3向CN8-2借款','',label,amount,0,0,0,0,0,0];
  const record={id:project+':'+member,project,month:'2026-11',sourceClass:'TRANSFER',
   members:[member],values,hash:sha(parseValues(values))};
  return attestMonth({project,month:record.month,revision:341,
   records:[record],payments:[],...archives(),appendOnly:true,
   cashDocument:doc({...cloud(),manualRecords:[entry]})});
 };
 assert.equal(run('H14-3','in','借入',1300).verified,true);
 assert.equal(run('CN8-2','out','借出',-1300).verified,true);
 assert.equal(run('H14-3','out','借出',-1300).verified,false);
 assert.equal(run('CN8-2','out','借出',1300).verified,false);
 assert.equal(run('H14-3','in','借入',1300,{...cash,borrower:'OTHER'}).verified,false);
});
