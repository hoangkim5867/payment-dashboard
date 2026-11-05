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
function fixture({month='2026-11',source=[tx(month)],demo=false,staging=false}={}){
  const state={rows:[],tab:false,tabName:demo?'DATA_CASHCONTROL_DEMO':'DATA_CASHCONTROL',postCalls:0,legacyValues:[],source};
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
        ...(state.tab?[{properties:{title:state.tabName}}]:[])]
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
    firebaseConfig:{projectId:demo||staging?'cash-control-staging':'test-project'},
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
    (demo?"\nccGoogleSyncDemoActive=true; CC_SYNC_PILOT_TAB=ccGoogleSyncDemoTab;":"")+
    (staging?"\nccGoogleSyncImportedRows=new Map();":"")+
    "\nthis.pilotAPI={compare:ccGoogleSyncComparePilot,commit:ccGoogleSyncCommitPilot,audit:ccGoogleSyncAuditLegacy,currentRows:ccGoogleSyncCurrentRows,correctionCandidate:ccGoogleSyncLegacyCorrectionCandidate};",context);
  return {state,nodes,api:context.pilotAPI,context};
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

test('two payments with the same date/IPC/amount but different companies are distinct',async()=>{
  const f=fixture({month:'2026-11',source:[tx('2026-11')]});
  f.state.legacyValues=[
    ['日期'],['2026-11-03','A different vendor','H-001','IPC','IPC01','',0,100.3,0,0,0,0,0]
  ];
  const diff=await f.api.compare();
  assert.ok(diff.blocked.some(x=>x.id==='legacy'));
  assert.equal(diff.legacyAudit.matchedSourceIds.length,0);
  assert.equal(f.nodes.ccGoogleSyncCommit.disabled,true);
});

test('TEST sync preserves historical ledger and writes all 19 mirror fields',async()=>{
  const f=fixture({month:'2026-11'});
  const historicalSnapshot=JSON.stringify(f.state.legacyValues);
  await f.api.compare();
  await f.api.commit();
  assert.equal(f.state.rows.length,1);
  assert.equal(f.state.rows[0].length,19);
  assert.equal(f.state.rows[0][1],'PHU HUNG');
  assert.equal(f.state.rows[0][2],'2026-11');
  assert.equal(f.state.rows[0][10],100.3);
  assert.equal(JSON.stringify(f.state.legacyValues),historicalSnapshot);
  await f.api.compare();
  await f.api.commit();
  assert.equal(f.state.rows.length,1,'repeated sync must not duplicate');
  assert.equal(JSON.stringify(f.state.legacyValues),historicalSnapshot);
});

test('conflicting historical amount blocks TEST writes entirely',async()=>{
  const f=fixture({month:'2026-11'});
  f.state.legacyValues=[
    ['日期'],['2026-11-03','Test Vendor','H-001','IPC','IPC01','',0,100.31,0,0,0,0,0]
  ];
  const before=JSON.stringify(f.state.legacyValues);
  const diff=await f.api.compare();
  assert.ok(diff.blocked.some(row=>row.id==='legacy'));
  assert.equal(f.nodes.ccGoogleSyncCommit.disabled,true);
  assert.equal(f.state.postCalls,0);
  assert.equal(f.state.rows.length,0);
  assert.equal(JSON.stringify(f.state.legacyValues),before);
});

test('changed contract on historical row is not mistaken for matching IPC',async()=>{
  const f=fixture({month:'2026-11'});
  f.state.legacyValues=[
    ['日期'],['2026-11-03','Test Vendor','H-002','IPC','IPC01','',0,100.3,0,0,0,0,0]
  ];
  const diff=await f.api.compare();
  assert.equal(diff.legacyAudit.matchedSourceIds.length,0);
  assert.ok(diff.blocked.some(row=>row.id==='legacy'));
  assert.equal(f.state.postCalls,0);
});

test('staging DEMO generates two fake source records and never reads production data',async()=>{
  const f=fixture({demo:true});
  const diff=await f.api.compare();
  assert.equal(diff.sourceCount,2);
  assert.equal(diff.changes.length,2);
  assert.equal(diff.blocked.length,0);
  assert.equal(f.state.postCalls,0);
  assert.deepEqual(Array.from(diff.changes,x=>String(x.id)),['DEMO-PHU-HUNG-001','DEMO-PHU-HUNG-002']);
  await f.api.commit();
  assert.equal(f.state.rows.length,2);
  assert.equal(f.state.rows[0].length,19);
  assert.equal(f.state.rows[0][0],'DEMO-PHU-HUNG-001');
  const unchanged=await f.api.compare();
  assert.equal(unchanged.unchanged.length,2);
  assert.equal(unchanged.changes.length,0);
  assert.equal(f.state.rows.length,2);
});

test('staging DEMO amount edit updates one fake row without duplication',async()=>{
  const f=fixture({demo:true});
  await f.api.compare();await f.api.commit();
  vm.runInContext('ccGoogleSyncDemoEdited=true',f.context);
  const diff=await f.api.compare();
  assert.equal(diff.changes.length,1);
  assert.equal(diff.changes[0].op,'update');
  await f.api.commit();
  assert.equal(f.state.rows.length,2);
  assert.equal(f.state.rows[1][11],765432);
});

test('historical payroll bilingual labels match only with identical date, all amounts and no contract',async()=>{
  const amount=349248728;
  const source=[{...tx('2026-10',amount),_syncIds:['salary:001'],contractNo:'',
    ipc:'',company:'Lương Trung Quốc',indirect:amount,subcontract:0}];
  const f=fixture({month:'2026-10',source});
  f.state.legacyValues=[['Ngày'],['2026-10-03','中方员工工资','','','', '',0,0,0,0,amount,0,0]];
  const diff=await f.api.compare();
  assert.equal(diff.legacyAudit.matchedSourceIds.length,1);
  assert.equal(diff.legacyAudit.unmatchedLedger,0);
  assert.equal(diff.changes.length,0);
  assert.equal(diff.blocked.length,0);
});
test('bilingual payroll cannot hide a 0.3 VND amount difference',async()=>{
  const amount=350945181;
  const source=[{...tx('2026-10',amount),_syncIds:['salary:002'],contractNo:'',
    ipc:'',company:'Lương Trung Quốc',indirect:amount,subcontract:0}];
  const f=fixture({month:'2026-10',source});
  f.state.legacyValues=[['Ngày'],['2026-10-03','中方员工工资','','','', '',0,0,0,0,amount+0.3,0,0]];
  const diff=await f.api.compare();
  assert.equal(diff.legacyAudit.matchedSourceIds.length,0);
  assert.equal(diff.legacyAudit.unmatchedLedger,1);
  assert.equal(diff.blocked.length,1);
});
test('unrelated companies are never collapsed by bilingual payroll alias',async()=>{
  const source=[{...tx('2026-10',125),_syncIds:['expense:third-party'],
    company:'Lương Trung Quốc',contractNo:'REAL-C-01',ipc:'IPC002'}];
  const f=fixture({month:'2026-10',source});
  f.state.legacyValues=[['Ngày'],['2026-10-03','中方员工工资','REAL-C-01','','IPC002','',0,125,0,0,0,0,0]];
  const diff=await f.api.compare();
  assert.equal(diff.legacyAudit.matchedSourceIds.length,0);
  assert.equal(diff.blocked.length,1);
});

test('exactly one authorized 0.3 VND payroll mismatch is eligible for one-cell TEST repair',async()=>{
  const month='2026-10';
  const source=Array.from({length:29},(_,i)=>({...tx(month,100+i),_syncIds:['expense:'+i],
    company:'Company '+i,contractNo:'C-'+i,ipc:'IPC-'+i}));
  source.forEach((r,i)=>{r.date=month+'-'+String((i%26)+1).padStart(2,'0')});
  source.push({date:'2026-10-27',company:'Lương Trung Quốc',contractNo:'',content:'Payroll',
    ipc:'',type:'Chi phí nhân sự',income:0,subcontract:0,material:0,otherDirect:0,
    indirect:350945181,financial:0,otherPayable:0,
    _syncIds:['expense:manual_salary_payroll_1793330653912_rzk8d']});
  const f=fixture({month,source,staging:true});
  f.state.legacyValues=[['Date'],...source.map((r,i)=>[
    r.date,i===29?'中方员工工资':r.company,r.contractNo,'',r.ipc,'',
    0,r.subcontract,0,0,i===29?350945181.3:r.indirect,0,0
  ])];
  const entries=source.map((row,i)=>({
    id:i===29?'PHU HUNG:expense:manual_salary_payroll_1793330653912_rzk8d':'PHU HUNG:expense:'+i,
    project:'PHU HUNG',month,
    values:[row.date,row.company,row.contractNo,row.content,row.ipc,row.type,
      row.income,row.subcontract,row.material,row.otherDirect,row.indirect,row.financial,row.otherPayable]
  }));
  for(const e of entries)e.hash=await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(e.values)))
    .then(b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join(''));
  const audit=await f.api.audit(month,entries);
  assert.equal(audit.matchedSourceIds.length,29);
  assert.equal(audit.unmatchedSource,1);
  const fix=await f.api.correctionCandidate(audit,entries,month);
  assert.equal(fix.row,31);
  assert.equal(fix.oldValue,350945181.3);
  assert.equal(fix.newValue,350945181);
  assert.equal(f.state.postCalls,0);
  // Reject even 0.01 VND difference from the authorized old value.
  f.state.legacyValues[30][11]=350945181.31;
  const bad=await f.api.audit(month,entries);
  assert.equal(await f.api.correctionCandidate(bad,entries,month),null);
});

test('October correction recognizes ISO date A148 and rejects non-date headers',()=>{
  const repairSource=pilot.slice(pilot.indexOf('async function ccGoogleSyncCorrectLegacyTest()'),
    pilot.indexOf('async function ccGoogleSyncCommitPilot()'));
  const dates=[...repairSource.matchAll(/\/\^([^\n]+?)\$\/\.test\(date\)/g)];
  assert.equal(dates.length,2,'both validation and diagnostic must use same date regex');
  for(const match of dates){
    const expression=new RegExp('^'+match[1]+'$');
    assert.equal(expression.test('2026-10-27'),true);
    assert.equal(expression.test('TỔNG CỘNG'),false);
    assert.equal(expression.test('2026-10-27x'),false);
  }
});
