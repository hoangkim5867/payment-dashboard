'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {planTestSync}=require('../server/cash-sync-multiproject-write-plan.cjs');
const {runTestOnlySync}=require('../server/cash-sync-multiproject-test-runner.cjs');
const {token}=require('../site/assets/js/cash-sync-multiproject-planner.js');
const file='1TESTPROJECTFILEABCDEFGHIJKLMNOPQ';
const tx=(date,amount,contractNo)=>({date,company:'Vendor',contractNo,
  content:'IPC',ipc:'IPC01',type:'支出',income:0,subcontract:amount,
  material:0,otherDirect:0,indirect:0,financial:0,otherPayable:0});
const history=[{...tx('2026-10-01',100,'H-1'),rowId:2,balance:900}];
const source=[{project:'ELYSIAN',id:'x1',...tx('2026-11-01',50,'H-2')}];
const inputs={project:'ELYSIAN',history,source,sourceComplete:true,destinationConfirmed:true};
const plan=()=>planTestSync(inputs);
function mock(prepared,{mutate=false,stale=false,access=true,badBalance=false}={}){
  const calls=[],state={mirror:[],view:[],formulas:[]};
  const normalizeView=()=>prepared.expectedView.map((r,i)=>({values:r.values.map((cell,j)=>
    i>0&&j===13?prepared.expectedBalances[i-1]+(badBalance?1:0):
      cell.userEnteredValue?.numberValue??cell.userEnteredValue?.stringValue??'')}));
  const adapter={
    async checkAuthority(){calls.push('auth');return {adminVerified:access,testOnly:true,spreadsheetId:file}},
    async readSnapshot(){calls.push('read');return {project:'ELYSIAN',spreadsheetId:file,
      viewTab:'PROJECT_VIEW',mirrorTab:'DATA_CASHCONTROL',mirror:[],view:[]}},
    async recompare(){calls.push('compare');const p=plan();return stale?{...p,preview:{...p.preview,afterFingerprint:'changed'}}:p},
    async writeMirrorAdditions(rows){calls.push('mirror');if(mutate)throw Error('Write failed');state.mirror.push(...rows)},
    async writeView(){calls.push('view');state.view=normalizeView();
      state.formulas=prepared.expectedView.slice(1).map(x=>[x.values[13].userEnteredValue.formulaValue])},
    async readAfterWrite(){calls.push('verify');return {project:'ELYSIAN',spreadsheetId:file,...state}}
  };
  return {adapter,calls};
}
const denied=async(fn,code)=>assert.rejects(fn,e=>e.code===code);
test('Admin-confirmed TEST scenario follows auth/read/recompare/write/readback, no Firebase',async()=>{
  const p=plan(),m=mock(p);
  const res=await runTestOnlySync({prepared:p,adapter:m.adapter,
    expectedTestSpreadsheetId:file,explicitAdminConsent:true});
  assert.deepEqual(m.calls,['auth','read','compare','mirror','view','verify']);
  assert.equal(res.status,'FULL_READBACK_VERIFIED');
  assert.equal(res.closingBalance,850);
  assert.equal(res.balancesVerified,true);
});
test('without consent, no adapter method is called',async()=>{
  const p=plan(),m=mock(p);
  await denied(()=>runTestOnlySync({prepared:p,adapter:m.adapter,
    expectedTestSpreadsheetId:file}),'NO_CONSENT');
  assert.deepEqual(m.calls,[]);
});
test('wrong verified Admin blocks before reads and writes',async()=>{
  const p=plan(),m=mock(p,{access:false});
  await denied(()=>runTestOnlySync({prepared:p,adapter:m.adapter,
    expectedTestSpreadsheetId:file,explicitAdminConsent:true}),'AUTH_FAILED');
  assert.deepEqual(m.calls,['auth']);
});
test('stale plan blocks before any write',async()=>{
  const p=plan(),m=mock(p,{stale:true});
  await denied(()=>runTestOnlySync({prepared:p,adapter:m.adapter,
    expectedTestSpreadsheetId:file,explicitAdminConsent:true}),'STALE_PLAN');
  assert.deepEqual(m.calls,['auth','read','compare']);
});
test('failed mirror write never proceeds to view and never retries',async()=>{
  const p=plan(),m=mock(p,{mutate:true});
  await assert.rejects(()=>runTestOnlySync({prepared:p,adapter:m.adapter,
    expectedTestSpreadsheetId:file,explicitAdminConsent:true}),/Write failed/);
  assert.deepEqual(m.calls,['auth','read','compare','mirror']);
});
test('Google returns wrong balance and completion is never reported',async()=>{
  const p=plan(),m=mock(p,{badBalance:true});
  await denied(()=>runTestOnlySync({prepared:p,adapter:m.adapter,
    expectedTestSpreadsheetId:file,explicitAdminConsent:true}),'BALANCE_NOT_VERIFIED');
  assert.equal(m.calls.at(-1),'verify');
});
test('production target and missing adapter cannot bypass allowlist',async()=>{
  const p=plan(),m=mock(p);
  await denied(()=>runTestOnlySync({prepared:p,adapter:m.adapter,
    expectedTestSpreadsheetId:'bad',explicitAdminConsent:true}),'NO_TEST_ALLOWLIST');
  await denied(()=>runTestOnlySync({prepared:p,adapter:{},
    expectedTestSpreadsheetId:file,explicitAdminConsent:true}),'MISSING_ADAPTER');
  assert.deepEqual(m.calls,[]);
});
