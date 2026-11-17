'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sha}=require('../server/cash-sync-multi-project-core.cjs');
// Fake Firebase JWT verification and Google Sheets API: NO network, NO production data.
const guard=require.resolve('../server/cash-sync-guard.cjs');
const saved=require.cache[guard];
require.cache[guard]={id:guard,filename:guard,loaded:true,exports:{
 readConfig:()=>({project:'cscecmep-payment',uid:'synthetic-admin'}),
 verifyFirebaseAdminToken:async()=>({project:'cscecmep-payment',uid:'synthetic-admin'})
}};
// Offline source proof fixture: generic API production paths in real
// deployments require 3 protected Firebase reads. Separate source verifier
// tests inspect those reads and archive signature; this fake has NO network.
const sourceRoute=require('../server/cash-sync-batch-source-reader.cjs');
const savedSourceInspect=sourceRoute.inspect;
sourceRoute.inspect=async({input})=>({
 kind:'INDEPENDENT_MONTHLY_SOURCE_BATCH_READONLY_V1',
 month:input.month,revision:input.revision,canWrite:false,googleWrites:0,
 newlyAppendedOnly:true,
 projects:input.projects.map(g=>({project:g.project,verified:true}))
});
const handler=require('../api/cash-sync-multi-project.js');
sourceRoute.inspect=savedSourceInspect;
const testHandler=require('../api/cash-sync-s13-test.js');
if(saved)require.cache[guard]=saved;else delete require.cache[guard];
const ID='12345678901234567890ABCDEFGHIJKLMNOPQRST';
const orig=[['2026-10-01','Vendor','SUBP-1','Invoice','IPC01','分包款',
  0,100,0,0,0,0,0,900]];
const newValues=['2026-11-03','Vendor','SUBP-2','Another invoice','IPC02','分包款',
  0,200,0,0,0,0,0,0];
const source=[{id:'ELYSIAN:expense:pay_new',project:'ELYSIAN',month:'2026-11',
 sourceClass:'PAYMENT',members:['expense:pay_new'],
 values:newValues,hash:sha(newValues)}];
function fixture(project='ELYSIAN',spreadsheetId=ID){
 const state={meta:{spreadsheetId,properties:{title:project==='S13-2'?'S13-2 TEST':'Normal project ledger'},sheets:[
  {properties:{sheetId:42,title:'SỔ GỐC',gridProperties:{rowCount:1000,columnCount:15}}}
 ]},history:structuredClone(orig),mirror:null,view:null,formulas:null,writes:0};
 const ok=data=>({ok:true,status:200,json:async()=>data});
 const fakeFetch=async(url,request={})=>{
  const method=request.method||'GET';
  if(url.startsWith('https://firestore.googleapis.com/v1/projects/'))
   return ok({fields:{role:{stringValue:'admin'}}});
  if(method==='POST'){
   assert.ok(url.endsWith(':batchUpdate'));
   state.writes++;
   const body=JSON.parse(request.body);
   for(const item of body.requests){
    if(item.addSheet)state.meta.sheets.push({properties:item.addSheet.properties});
    if(item.updateCells){
     const sheet=state.meta.sheets.find(x=>x.properties.sheetId===item.updateCells.range.sheetId);
     const matrix=item.updateCells.rows.map(row=>row.values.map(cell=>{
      const v=cell.userEnteredValue||{};
      return Object.hasOwn(v,'formulaValue')?v.formulaValue:
       Object.hasOwn(v,'numberValue')?v.numberValue:
       Object.hasOwn(v,'stringValue')?v.stringValue:
       Object.hasOwn(v,'boolValue')?v.boolValue:'';
     }));
     if(sheet.properties.title==='DATA_CASHCONTROL')state.mirror=matrix;
     else if(sheet.properties.title==='CASHCONTROL_VIEW'){
      state.formulas=matrix.map(row=>[row[14]]);
      let b=Number(matrix[1]?.[17]||0);
      state.view=matrix.map((row,i)=>{
       if(i===0)return row;
       b=Math.round((b+Number(row[6]||0)-
        row.slice(7,14).reduce((n,x)=>n+Number(x||0),0))*1e6)/1e6;
       const clone=row.slice();clone[14]=b;return clone;
      });
     }else throw Error('Attempted to overwrite historical Google tab');
    }
   }
   if(state.afterWrite)state.afterWrite();
   return ok({replies:[]});
  }
  state.reads=(state.reads||0)+1;
  if(url.includes('fields=spreadsheetId'))return ok(state.meta);
  const decoded=decodeURIComponent(url.slice(url.indexOf('/values/')+8,url.indexOf('?')));
  if(decoded.includes("'SỔ GỐC'"))return ok({values:structuredClone(state.history)});
  if(decoded.includes("'DATA_CASHCONTROL'"))return ok({values:state.mirror||[]});
  if(decoded.includes("'CASHCONTROL_VIEW'")){
   return ok({values:url.includes('valueRenderOption=FORMULA')?
     state.formulas||[]:state.view||[]});
  }
  throw Error('Unexpected Google mock URL '+url);
 };
 async function call(action,extra={}){
  const prev=global.fetch;global.fetch=fakeFetch;
  const prevFlag=process.env.CASH_SYNC_MULTI_PRODUCTION_WRITES;
  const prevApprovedMonth=process.env.CASH_SYNC_MULTI_APPROVED_MONTH;
  const prevTargets=process.env.CASH_SYNC_MULTI_ALLOWED_TARGETS;
  const prevEnv=process.env.VERCEL_ENV;
  const prevProject=process.env.CASH_SYNC_FIREBASE_PROJECT_ID;
  const prevTestFlag=process.env.CASH_SYNC_S13_TEST_WRITES;
  const prevTestId=process.env.CASH_SYNC_S13_TEST_FILE_ID;
  const prevTestGid=process.env.CASH_SYNC_S13_TEST_HISTORY_GID;
  const prevStagingConfig=process.env.PAYMENT_FIREBASE_STAGING_CONFIG;
  // This is a local mock: no Vercel or real Google request occurs.
  process.env.VERCEL_ENV=(extra.simulatePreview||extra.testOnly)?'preview':'production';
  if(extra.testOnly){
   process.env.PAYMENT_FIREBASE_STAGING_CONFIG=JSON.stringify({projectId:'cash-control-staging',authDomain:'cash-control-staging.firebaseapp.com'});
   process.env.CASH_SYNC_S13_TEST_WRITES='YES';
   process.env.CASH_SYNC_S13_TEST_FILE_ID=spreadsheetId;
   process.env.CASH_SYNC_S13_TEST_HISTORY_GID='42';
  }
  process.env.CASH_SYNC_FIREBASE_PROJECT_ID=
    extra.simulateStaging?'cash-control-staging':'cscecmep-payment';
  if(extra.enabled){
   process.env.CASH_SYNC_MULTI_APPROVED_MONTH='2026-11';
   process.env.CASH_SYNC_MULTI_PRODUCTION_WRITES='YES';
   process.env.CASH_SYNC_MULTI_ALLOWED_TARGETS=JSON.stringify({
    [project]:{spreadsheetId,historySheetId:42}
   });
  }
  else delete process.env.CASH_SYNC_MULTI_PRODUCTION_WRITES;
  const body={action,project,month:'2026-11',revision:42,spreadsheetId,
   historySheetId:42,source:source.map(record=>({...record,
    id:record.id.replace(/^ELYSIAN:/,project+':'),project})),openingBalance:null,...extra};
  const response={statusCode:200,headers:{},
   setHeader(k,v){this.headers[k]=v;return this},
   status(n){this.statusCode=n;return this},
   json(v){this.payload=v;return this}};
  try{
   await (extra.testOnly?testHandler:handler)({method:'POST',headers:{
    host:'example.vercel.app',origin:'https://example.vercel.app',
    authorization:'Bearer '+'T'.repeat(40),
    'x-firebase-id-token':extra.testOnly?[
      Buffer.from('{}').toString('base64url'),
      Buffer.from(JSON.stringify({sub:'synthetic-admin',padding:'x'.repeat(120)})).toString('base64url'),
      'signed-for-mock-only'].join('.'):'synthetic'
   },body},response);
   return {status:response.statusCode,...response.payload};
  }finally{
   global.fetch=prev;
   if(prevFlag===undefined)delete process.env.CASH_SYNC_MULTI_PRODUCTION_WRITES;
   else process.env.CASH_SYNC_MULTI_PRODUCTION_WRITES=prevFlag;
   if(prevApprovedMonth===undefined)delete process.env.CASH_SYNC_MULTI_APPROVED_MONTH;
   else process.env.CASH_SYNC_MULTI_APPROVED_MONTH=prevApprovedMonth;
   if(prevTargets===undefined)delete process.env.CASH_SYNC_MULTI_ALLOWED_TARGETS;
   else process.env.CASH_SYNC_MULTI_ALLOWED_TARGETS=prevTargets;
   if(prevEnv===undefined)delete process.env.VERCEL_ENV;
   else process.env.VERCEL_ENV=prevEnv;
   if(prevProject===undefined)delete process.env.CASH_SYNC_FIREBASE_PROJECT_ID;
   else process.env.CASH_SYNC_FIREBASE_PROJECT_ID=prevProject;
   for(const [name,value] of [
    ['CASH_SYNC_S13_TEST_WRITES',prevTestFlag],
    ['CASH_SYNC_S13_TEST_FILE_ID',prevTestId],
    ['CASH_SYNC_S13_TEST_HISTORY_GID',prevTestGid],
    ['PAYMENT_FIREBASE_STAGING_CONFIG',prevStagingConfig]
   ])if(value===undefined)delete process.env[name];else process.env[name]=value;
  }
 }
 return {state,call};
}
test('Admin preview is read-only, commit remains gated and original sheet is immutable',async()=>{
 const f=fixture();
 const p=await f.call('preview');
 assert.equal(p.status,200);
 assert.equal(p.summary.project,'ELYSIAN');
 assert.equal(p.summary.changes,1);
 assert.equal(p.summary.closingBalance,700);
 assert.equal(p.writeConfigured,false);
 assert.equal(f.state.writes,0);
 const denied=await f.call('commit',{signature:p.signature,confirm:'SYNC_THIS_PROJECT'});
 assert.equal(denied.status,503);
 assert.equal(f.state.writes,0);
 assert.deepEqual(f.state.history,orig);
});
test('once enabled in isolated mock, atomic multi-project commit verifies and retry is no-op',async()=>{
 const f=fixture();
 const preview=await f.call('preview',{enabled:true});
 const saved=await f.call('commit',{enabled:true,signature:preview.signature,
  confirm:'SYNC_THIS_PROJECT'});
 assert.equal(saved.status,200);
 assert.equal(saved.mode,'verified');
 assert.equal(f.state.writes,1);
 assert.equal(f.state.mirror.length,2);
 assert.equal(f.state.view.length,3);
 assert.equal(f.state.view[2][14],700);
 assert.deepEqual(f.state.history,orig);
 const again=await f.call('preview',{enabled:true});
 assert.equal(again.status,200);
 assert.equal(again.summary.changes,0);
 const unchanged=await f.call('commit',{enabled:true,signature:again.signature,
  confirm:'SYNC_THIS_PROJECT'});
 assert.equal(unchanged.mode,'unchanged');
 assert.equal(f.state.writes,1);
});
test('external modification of generated VIEW blocks second commit',async()=>{
 const f=fixture();
 const p=await f.call('preview',{enabled:true});
 const first=await f.call('commit',{enabled:true,signature:p.signature,confirm:'SYNC_THIS_PROJECT'});
 assert.equal(first.mode,'verified');
 f.state.view[2][7]=12345;
 const denied=await f.call('preview',{enabled:true});
 assert.equal(denied.status,409);
 assert.equal(f.state.writes,1);
});

test('two independent projects write only their respective machine tabs and repeat idempotently',async()=>{
 const e=fixture('ELYSIAN',ID);
 const p1=await e.call('preview',{enabled:true});
 assert.equal(p1.status,200);
 assert.equal(p1.writeConfigured,true);
 const saved1=await e.call('commit',{enabled:true,signature:p1.signature,confirm:'SYNC_THIS_PROJECT'});
 assert.equal(saved1.mode,'verified');
 const eRetry=await e.call('preview',{enabled:true});
 assert.equal(eRetry.summary.changes,0);
 assert.equal(e.state.writes,1);

 const s=fixture('SSIS','B'.repeat(40));
 const p2=await s.call('preview',{enabled:true});
 assert.equal(p2.status,200);
 assert.equal(p2.summary.project,'SSIS');
 const saved2=await s.call('commit',{enabled:true,signature:p2.signature,confirm:'SYNC_THIS_PROJECT'});
 assert.equal(saved2.mode,'verified');
 assert.equal(s.state.writes,1);
 assert.equal(s.state.mirror[1][1],'SSIS');
 assert.equal(e.state.mirror[1][1],'ELYSIAN');
 assert.deepEqual(e.state.history,orig);
 assert.deepEqual(s.state.history,orig);
 const secondRetry=await s.call('preview',{enabled:true});
 assert.equal(secondRetry.summary.changes,0);
 assert.equal(s.state.writes,1);
});
test('a different spreadsheet ID supplied by browser cannot override server project allowlist',async()=>{
 const f=fixture();
 const p=await f.call('preview',{enabled:true});
 assert.equal(p.status,200);
 assert.equal(p.writeConfigured,true);
 // A mismatched target fails closed even when the global release flag is on.
 const readsBefore=f.state.reads;
 const wrong=await f.call('commit',{enabled:true,spreadsheetId:'B'.repeat(40),
   signature:p.signature,confirm:'SYNC_THIS_PROJECT'});
 assert.equal(wrong.status,503);
 assert.equal(f.state.reads,readsBefore);
 assert.equal(f.state.writes,0);
});

test('post-write verification detects changes to original history',async()=>{
 const f=fixture();
 const preview=await f.call('preview',{enabled:true});
 f.state.afterWrite=()=>{f.state.history[0][3]='Concurrent edit';};
 const result=await f.call('commit',{enabled:true,signature:preview.signature,confirm:'SYNC_THIS_PROJECT'});
 assert.equal(result.status,409);
 assert.match(result.error,/tab lịch sử đã thay đổi/);
 assert.equal(f.state.writes,1);
});

test('Preview with mistakenly enabled production flag rejects Google commit before reading',async()=>{
 const f=fixture();
 const denied=await f.call('commit',{enabled:true,simulatePreview:true,
   signature:'a'.repeat(64),confirm:'SYNC_THIS_PROJECT'});
 assert.equal(denied.status,503);
 assert.equal(f.state.reads||0,0);
 assert.equal(f.state.writes,0);
});

test('Staging Firebase credentials cannot authorize production commit',async()=>{
 const f=fixture();
 const denied=await f.call('commit',{enabled:true,simulateStaging:true,
   signature:'a'.repeat(64),confirm:'SYNC_THIS_PROJECT'});
 assert.equal(denied.status,503);
 assert.equal(f.state.reads||0,0);
 assert.equal(f.state.writes,0);
});

test('Excel review row positions cannot be used as source IDs for Google commit',async()=>{
 const f=fixture('S13-2');
 const placeholder=[{id:'excel-row:6',project:'S13-2',month:'2026-11',
   values:newValues,hash:sha(newValues)}];
 const preview=await f.call('preview',{enabled:true,source:placeholder});
 // A local review can remain read-only; no placeholder is write-authorized.
 assert.equal(preview.status,200);
 const readsBefore=f.state.reads;
 const denied=await f.call('commit',{enabled:true,source:placeholder,
   signature:preview.signature,confirm:'SYNC_THIS_PROJECT'});
 assert.equal(denied.status,409);
 assert.match(denied.error,/ID giao dịch Cash Control gốc/);
 assert.equal(f.state.reads,readsBefore);
 assert.equal(f.state.writes,0);
 assert.deepEqual(f.state.history,orig);
});

test('monthly batch compares the selected closing balance independently of future Google entries',async()=>{
 const f=fixture();
 f.state.history.push(['2026-12-01','Vendor','SUBP-3','Future invoice','IPC03','分包款',
   0,50,0,0,0,0,0,850]);
 const cutoff=await f.call('preview',{enabled:true,expectedMonthClosing:900,source:[]});
 assert.equal(cutoff.status,200);
 assert.equal(cutoff.summary.monthClosingBalance,900);
 assert.equal(cutoff.summary.closingBalance,850);
 assert.equal(f.state.writes,0);
 const h=fixture();
 const plan=await h.call('preview',{enabled:true,expectedMonthClosing:700});
 assert.equal(plan.summary.monthClosingBalance,700);
 const rejected=await h.call('commit',{enabled:true,expectedMonthClosing:701,
   signature:plan.signature,confirm:'SYNC_THIS_PROJECT'});
 assert.equal(rejected.status,409);
 assert.match(rejected.error,/Số dư cuối tháng/);
 assert.equal(h.state.writes,0);
});

test('S13-2 verified October sources use TEST route: write, readback, repeat with 0 new writes',async()=>{
 const TEST='testcopyS13202610ABCDEF0123456789';
 const f=fixture('S13-2',TEST);
 f.state.history[0][13]=65583133;
 const before=structuredClone(f.state.history);
 const ids=['manual_salary_payroll_1790835443846_m4hd2',
  'manual_salary_payroll_1790835443852_ihc3a',
  'legacy_salary_672+legacy_salary_680'];
 const records=[
  ['2026-10-02','中方员工工资','','2026年08月中方员工工资','','职工薪酬',0,0,0,0,81463753,0,0],
  ['2026-10-02','伙食费','','2026年08月伙食费','','职工薪酬',0,0,0,0,3859500,0,0],
  ['2026-10-20','','','2026年第3季度个人所得税','','职工薪酬',0,0,0,0,52923736,0,0]
 ].map((values,i)=>({id:ids[i],project:'S13-2',month:'2026-10',
  values,hash:sha([...values,0])}));
 const request={testOnly:true,month:'2026-10',source:records,
  expectedMonthClosing:-72663856};
 const preview=await f.call('preview',request);
 assert.equal(preview.status,200);
 assert.equal(preview.summary.changes,3);
 assert.equal(preview.summary.monthClosingBalance,-72663856);
 assert.equal(f.state.writes,0);
 const first=await f.call('commit',{...request,signature:preview.signature,confirm:'SYNC_THIS_PROJECT'});
 assert.equal(first.status,200);
 assert.equal(first.mode,'verified');
 assert.equal(first.summary.changes,3);
 assert.equal(first.summary.monthClosingBalance,-72663856);
 assert.equal(f.state.writes,1);
 assert.equal(f.state.mirror.length,4);
 assert.deepEqual(f.state.history,before);
 const secondPreview=await f.call('preview',request);
 assert.equal(secondPreview.status,200);
 assert.equal(secondPreview.summary.changes,0);
 const second=await f.call('commit',{...request,signature:secondPreview.signature,confirm:'SYNC_THIS_PROJECT'});
 assert.equal(second.status,200);
 assert.equal(second.mode,'unchanged');
 assert.equal(second.writes,0);
 assert.equal(f.state.writes,1);
 assert.deepEqual(f.state.history,before);
});

test('S13-2 TEST route rejects a wrongly titled Google file before writes',async()=>{
 const f=fixture('S13-2','testcopyS13202610ABCDEF0123456789');
 f.state.history[0][13]=65583133;
 f.state.meta.properties.title='S13-2 PRODUCTION';
 const vals=['2026-10-02','中方员工工资','','2026年08月中方员工工资','','职工薪酬',0,0,0,0,81463753,0,0];
 const records=[{id:'manual_salary_payroll_1790835443846_m4hd2',project:'S13-2',month:'2026-10',values:vals,hash:sha([...vals,0])}];
 const denied=await f.call('preview',{testOnly:true,month:'2026-10',source:records,expectedMonthClosing:-72663856});
 assert.equal(denied.status,409);
 assert.match(denied.error,/bản sao S13-2 TEST/);
 assert.equal(f.state.writes,0);
});

test('S13-2 production commit cannot use global allowlist for an unrelated month',async()=>{
 const f=fixture('S13-2');
 const preview=await f.call('preview',{enabled:true});
 assert.equal(preview.status,200);
 assert.equal(preview.writeConfigured,true);
 const denied=await f.call('commit',{enabled:true,
  signature:preview.signature,confirm:'SYNC_THIS_PROJECT'});
 assert.equal(denied.status,409);
 assert.match(denied.error,/S13-2 Production chỉ cho phép ba khoản/);
 assert.equal(f.state.writes,0);
 assert.deepEqual(f.state.history,orig);
});

test('S13-2 production alias or case variant never skips four-ID source check',async()=>{
 for(const project of ['s13-2','S13-2 ','Ｓ13-2']){
  const f=fixture(project);
  // The alias must be rejected before any Google read, even when a caller
  // possesses a syntactically valid signature and a matching allowlist.
  const denied=await f.call('commit',{enabled:true,month:'2026-10',
   signature:'a'.repeat(64),confirm:'SYNC_THIS_PROJECT'});
  assert.equal(denied.status,409);
  assert.match(denied.error,/yêu cầu tên dự án chuẩn/);
  assert.equal(f.state.writes,0);
  assert.deepEqual(f.state.history,orig);
 }
});
test('release allowlist is exact single original Google file and gid only',()=>{
 const {canWriteTarget,parseAllowlist}=require('../server/cash-sync-multi-targets.cjs');
 const spreadsheetId='1s7-EZqTfS_6raZDxpK74m5gxDoAbRwBIJptCkG2lyUg';
 const historySheetId=1543850344;
 const env={VERCEL_ENV:'production',CASH_SYNC_FIREBASE_PROJECT_ID:'cscecmep-payment',
  CASH_SYNC_MULTI_PRODUCTION_WRITES:'YES',
  CASH_SYNC_MULTI_ALLOWED_TARGETS:JSON.stringify({
   'S13-2':{spreadsheetId,historySheetId}
  })};
 const allowed=parseAllowlist(env.CASH_SYNC_MULTI_ALLOWED_TARGETS);
 assert.deepEqual([...allowed.keys()],['S13-2']);
 assert.equal(canWriteTarget(env,'S13-2',spreadsheetId,historySheetId),true);
 assert.equal(canWriteTarget(env,'FOXCONN',spreadsheetId,historySheetId),false);
 assert.equal(canWriteTarget(env,'S13-2',spreadsheetId,historySheetId+1),false);
 assert.equal(canWriteTarget(env,'S13-2','anotherGoogleSpreadsheetId_12345678',historySheetId),false);
 assert.equal(canWriteTarget({...env,CASH_SYNC_MULTI_PRODUCTION_WRITES:'NO'},'S13-2',spreadsheetId,historySheetId),false);
 assert.equal(canWriteTarget({...env,VERCEL_ENV:'preview'},'S13-2',spreadsheetId,historySheetId),false);
});
