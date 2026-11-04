'use strict';
/* Run: node --test google-sheets-sync/pilot.test.cjs
 * Uses the actual pilot functions from site/cash-control.html, mock Google API,
 * and fake transactions. NEVER accesses Firebase or Google on the network.
 */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {TextEncoder}=require('node:util');
const html=fs.readFileSync(path.join(__dirname,'../site/cash-control.html'),'utf8');
const start=html.indexOf('/* Google Sheets API pilot.');
const end=html.indexOf('function ccGoogleSyncInitializePreview()',start);
assert.ok(start>0&&end>start,'Cannot locate Cash Control pilot code');
const pilot=html.slice(start,end);
const header=['sourceId','projectKey','month','date','company','contractNo',
  'content','ipc','type','income','subcontract','material','otherDirect','indirect',
  'financial','otherPayable','balance','sourceHash','syncStatus'];
function tx(month='2026-11',amount=100.3) {
  return {date:month+'-03',company:'Test Vendor',contractNo:'H-001',
    content:'IPC',ipc:'IPC01',type:'支出',income:0,subcontract:amount,material:0,
    otherDirect:0,indirect:0,financial:0,otherPayable:0,_syncIds:['expense:001']};
}
function fixture({month='2026-11',source=[tx(month)]}={}){
  const state={rows:[],tab:false,postCalls:0,legacyValues:[],source};
  const nodes={
    ccGoogleSyncMonth:{value:month},
    ccGoogleSyncCommit:{disabled:true},
    ccGoogleSyncGoogleStatus:{textContent:''}
  };
  async function mockFetch(url,options={}){
    const method=options.method||'GET';
    const body=options.body?JSON.parse(options.body):null;
    if(method!=='GET')state.postCalls++;
    if(method==='GET'&&url.includes('fields=spreadsheetId'))return ok({
      properties:{title:'PHU HUNG - TEST DONG BO'},
      sheets:[{properties:{title:'PHU HUNG'}},
        ...(state.tab?[{properties:{title:'DATA_CASHCONTROL'}}]:[])]
    });
    if(method==='GET'&&url.includes('valueRenderOption')&&url.includes('PHU%20HUNG'))
      return ok({values:state.legacyValues});
    if(method==='GET'&&url.includes('valueRenderOption'))return ok({values:[header,...state.rows]});
    if(method==='POST'&&url.includes('/values:batchUpdate')){
      for(const data of body.data){
        const index=Number(data.range.match(/!A(\d+)/)[1])-2;
        state.rows[index]=data.values[0];
      }
      return ok({});
    }
    if(method==='POST'&&url.includes(':append')){
      state.rows.push(...body.values);
      return ok({});
    }
    if(method==='POST'&&url.endsWith(':batchUpdate')){
      state.tab=true;
      return ok({});
    }
    if(method==='PUT')return ok({});
    throw Error('Unknown mocked API operation '+method+' '+url);
  }
  function ok(data){return {ok:true,json:async()=>data}}
  const context={
    currentAuthUser:{uid:'admin'},
    isCashControlOwner:()=>true,
    paymentMonths:new Map([['PHU HUNG',[]]]),
    legacyCashExportRows:()=>state.source,
    ccGoogleSyncSelectedProjects:()=>['PHU HUNG'],
    $:id=>nodes[id],
    fetch:mockFetch,crypto:webcrypto,TextEncoder,
    window:{},localStorage:{getItem:()=>null,setItem:()=>{}},
    google:{},confirm:()=>true,console
  };
  vm.createContext(context);
  vm.runInContext(pilot+
    "\nccGoogleSyncToken='FAKE_TEST_TOKEN';"+
    "\nthis.pilotAPI={compare:ccGoogleSyncComparePilot,commit:ccGoogleSyncCommitPilot,audit:ccGoogleSyncAuditLegacy,currentRows:ccGoogleSyncCurrentRows};",context);
  return {state,nodes,api:context.pilotAPI};
}
test('new transaction is written to isolated TEST tab and verified',async()=>{
  const f=fixture();
  const preview=await f.api.compare();
  assert.equal(preview.changes.length,1);
  await f.api.commit();
  assert.equal(f.state.rows.length,1);
  assert.match(f.nodes.ccGoogleSyncGoogleStatus.textContent,/ĐÃ XÁC MINH/);
});
test('repeated sync does not append a second transaction',async()=>{
  const f=fixture();
  await f.api.compare();await f.api.commit();
  const second=await f.api.compare();
  assert.equal(second.changes.length,0);
  assert.equal(second.unchanged.length,1);
  assert.equal(f.state.rows.length,1);
});
test('edited source amount updates its original target row',async()=>{
  const f=fixture();
  await f.api.compare();await f.api.commit();
  f.state.source[0].subcontract=155.3;
  const diff=await f.api.compare();
  assert.equal(diff.changes[0].op,'update');
  await f.api.commit();
  assert.equal(f.state.rows.length,1);
  assert.equal(f.state.rows[0][10],155.3);
});
test('manually altered target amount blocks all writes',async()=>{
  const f=fixture();
  await f.api.compare();await f.api.commit();
  f.state.rows[0][10]=999;
  const count=f.state.postCalls;
  const diff=await f.api.compare();
  assert.equal(diff.blocked.length,1);
  assert.equal(f.nodes.ccGoogleSyncCommit.disabled,true);
  assert.equal(f.state.postCalls,count);
});
test('removed source record triggers orphan block, not delete',async()=>{
  const f=fixture();
  await f.api.compare();await f.api.commit();
  f.state.source.length=0;
  const diff=await f.api.compare();
  assert.equal(diff.blocked.length,1);
  assert.equal(f.state.rows.length,1);
});
test('October ledger must match date, amounts, contract and IPC',async()=>{
  const f=fixture({month:'2026-10',source:[tx('2026-10')]});
  f.state.legacyValues=[
    ['日期'],[46303,'Test Vendor','H-001','IPC','IPC01','',0,100.3,0,0,0,0,0]
  ];
  const matches=await f.api.audit('2026-10',await f.api.currentRows('PHU HUNG','2026-10'));
  // 46303 is 2026-10-08, while source date is Oct 3.
  assert.equal(matches.exact,false);
});
test('pilot source rejects months older than 2026-10',async()=>{
  const f=fixture({month:'2026-09',source:[tx('2026-09')]});
  await assert.rejects(f.api.currentRows('PHU HUNG','2026-09'),/tháng 10/);
});

test('November historical manual entries are audited, not blindly duplicated',async()=>{
  const f=fixture({month:'2026-11'});
  f.state.legacyValues=[
    ['日期'],['2026-11-03','Test Vendor','H-999','IPC','IPC01','',0,100.3,0,0,0,0,0]
  ];
  const diff=await f.api.compare();
  assert.equal(diff.legacyAudit.ledgerCount,1);
  assert.equal(diff.legacyAudit.exact,false);
  assert.ok(diff.blocked.some(x=>x.id==='legacy'));
  assert.equal(f.nodes.ccGoogleSyncCommit.disabled,true);
  assert.equal(f.state.postCalls,0);
});
test('November empty historical ledger allows separate mirror rows',async()=>{
  const f=fixture({month:'2026-11'});
  const diff=await f.api.compare();
  assert.equal(diff.legacyAudit.ledgerCount,0);
  assert.equal(diff.blocked.length,0);
  assert.equal(diff.changes.length,1);
});

test('October entries already present in PHU HUNG are not duplicated in DATA_CASHCONTROL',async()=>{
  const f=fixture({month:'2026-10',source:[tx('2026-10')]});
  f.state.legacyValues=[
    ['日期'],['2026-10-03','Test Vendor','H-001','IPC','IPC01','',0,100.3,0,0,0,0,0]
  ];
  const diff=await f.api.compare();
  assert.equal(diff.legacyAudit.matchedSourceIds.length,1);
  assert.equal(diff.changes.length,0);
  assert.equal(diff.unchanged.length,1);
  assert.equal(diff.blocked.length,0);
  assert.equal(f.state.postCalls,0);
});
test('November partial historic entries allow only the missing transaction to sync',async()=>{
  const source=[tx('2026-11'),{...tx('2026-11',250.5),_syncIds:['expense:002']}];
  const f=fixture({month:'2026-11',source});
  f.state.legacyValues=[
    ['日期'],['2026-11-03','Test Vendor','H-001','IPC','IPC01','',0,100.3,0,0,0,0,0]
  ];
  const diff=await f.api.compare();
  assert.equal(diff.legacyAudit.matchedSourceIds.length,1);
  assert.equal(diff.changes.length,1);
  assert.equal(diff.unchanged.length,1);
  assert.equal(diff.blocked.length,0);
  assert.equal(diff.changes[0].values[7],250.5);
});

test('a transaction in both historic ledger and mirror blocks a second copy',async()=>{
  const f=fixture({month:'2026-11'});
  await f.api.compare();
  await f.api.commit();
  f.state.legacyValues=[
    ['日期'],['2026-11-03','Test Vendor','H-001','IPC','IPC01','',0,100.3,0,0,0,0,0]
  ];
  const diff=await f.api.compare();
  assert.ok(diff.blocked.some(x=>/đồng thời/.test(x.reason)));
  assert.equal(f.nodes.ccGoogleSyncCommit.disabled,true);
  assert.equal(f.state.rows.length,1);
});
