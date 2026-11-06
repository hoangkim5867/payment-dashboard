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
  const state={rows:[],tab:false,tabName:demo?'DATA_CASHCONTROL_DEMO':'DATA_CASHCONTROL',postCalls:0,legacyValues:[],source,computedValues:[],computedFormulas:[]};
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
    if(method==='GET'&&url.includes('AUTO_PHU_HUNG_TEST_')&&url.includes('valueRenderOption=FORMULA'))
      return ok({values:state.computedFormulas});
    if(method==='GET'&&url.includes('AUTO_PHU_HUNG_TEST_')&&url.includes('valueRenderOption=UNFORMATTED_VALUE'))
      return ok({values:state.computedValues});
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
    "\nccGoogleSyncToken='FAKE_TEST_TOKEN'; ccGoogleSyncLiveSourceRefreshedAt=Date.now();"+
    (demo?"\nccGoogleSyncDemoActive=true; CC_SYNC_PILOT_TAB=ccGoogleSyncDemoTab;":"")+
    (staging?"\nccGoogleSyncImportedRows=new Map();":"")+
    "\nthis.pilotAPI={compare:ccGoogleSyncComparePilot,commit:ccGoogleSyncCommitPilot,audit:ccGoogleSyncAuditLegacy,currentRows:ccGoogleSyncCurrentRows,correctionCandidate:ccGoogleSyncLegacyCorrectionCandidate,balanceAudit:ccGoogleSyncAnalyzeRunningBalances,buildAutoLedger:ccGoogleSyncBuildConsolidatedLedger,mergeCachedSource:ccGoogleSyncMergeCachedSource,verifyComputedTab:ccGoogleSyncVerifyComputedTab,sha:ccGoogleSyncSha,payload:ccGoogleSyncPayloadCells};",context);
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
  const retry=await f.api.compare();
  assert.equal(retry.changes.length,0);
  assert.equal(retry.unchanged.length,1);
  assert.equal(f.nodes.ccGoogleSyncCommit.disabled,true);
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
  assert.equal(dates.length,1,'historical TEST repair has one ISO date guard');
  for(const match of dates){
    const expression=new RegExp('^'+match[1]+'$');
    assert.equal(expression.test('2026-10-27'),true);
    assert.equal(expression.test('TỔNG CỘNG'),false);
    assert.equal(expression.test('2026-10-27x'),false);
  }
});


test('staging DEMO third transaction appends once and stays unchanged on retry',async()=>{
  const f=fixture({demo:true});
  await f.api.compare();
  await f.api.commit();
  vm.runInContext('ccGoogleSyncDemoEdited=true',f.context);
  await f.api.compare();
  await f.api.commit();
  vm.runInContext('ccGoogleSyncDemoAdded=true',f.context);
  const diff=await f.api.compare();
  assert.equal(diff.sourceCount,3);
  assert.equal(diff.changes.length,1);
  assert.equal(diff.changes[0].op,'new');
  assert.equal(diff.changes[0].id,'DEMO-PHU-HUNG-003');
  assert.equal(diff.unchanged.length,2);
  assert.equal(diff.blocked.length,0);
  await f.api.commit();
  assert.equal(f.state.rows.length,3);
  assert.equal(f.state.rows[2][12],345678);
  const writes=f.state.postCalls;
  const retry=await f.api.compare();
  assert.equal(retry.changes.length,0);
  assert.equal(retry.unchanged.length,3);
  assert.equal(retry.blocked.length,0);
  assert.equal(f.state.postCalls,writes,'comparison must not issue writes');
  assert.equal(f.state.rows.length,3,'retry must not append duplicate');
});

test('historical balance audit reconciles adjacent dated rows and counts formulas',()=>{
  const f=fixture();
  const rows=[
    ['Ngày','Nhà cung cấp'], // heading
    ['2026-10-27','A','','','', '',0,100,0,0,0,0,0,900],
    ['2026-10-28','B','','','', '',300,0,50,0,0,0,0,1150],
    ['2026-10-29','C','','','', '',0,0,0,0,25,0,0,1125]
  ];
  const formulas=[[],['=N1+G2-SUM(H2:M2)'],['=N2+G3-SUM(H3:M3)'],['=N3+G4-SUM(H4:M4)']];
  const check=f.api.balanceAudit(rows,formulas);
  assert.equal(check.checked,2);
  assert.equal(check.mismatches.length,0);
  assert.equal(check.formulaCount,3);
});

test('historical balance audit flags a mismatched balance without writing',()=>{
  const f=fixture();
  const rows=[
    ['2026-11-01','A','','','', '',0,0,0,0,0,0,0,1000],
    ['2026-11-02','B','','','', '',0,0,40,0,0,0,0,965]
  ];
  const before=JSON.stringify(rows);
  const check=f.api.balanceAudit(rows,[[],[]]);
  assert.equal(check.checked,1);
  assert.equal(check.mismatches.length,1);
  assert.equal(check.mismatches[0].expected,960);
  assert.equal(check.mismatches[0].actual,965);
  assert.equal(f.state.postCalls,0);
  assert.equal(JSON.stringify(rows),before);
});

test('historical balance audit does not bridge headers or months',()=>{
  const f=fixture();
  const rows=[
    ['2026-10-31','A','','','', '',0,0,0,0,0,0,0,1000],
    ['TỔNG CỘNG'],
    ['2026-11-01','B','','','', '',0,100,0,0,0,0,0,900],
    ['2026-11-02','C','','','', '',0,50,0,0,0,0,0,850]
  ];
  const check=f.api.balanceAudit(rows,[[],[],[],[]]);
  assert.equal(check.checked,1);
  assert.equal(check.mismatches.length,0);
});

test('historical balance audit refuses to infer a missing balance',()=>{
  const f=fixture();
  const rows=[
    ['2026-11-01','A','','','', '',0,0,0,0,0,0,0,1000],
    ['2026-11-02','B','','','', '',0,50,0,0,0,0,0,''],
    ['2026-11-03','C','','','', '',0,10,0,0,0,0,0,940]
  ];
  const check=f.api.balanceAudit(rows,[[],[],[]]);
  assert.equal(check.checked,0);
  assert.equal(check.unverified.length,1);
  assert.equal(check.unverified[0].row,2);
});

test('balance audit classifies cross-month transition separately from unexplained gaps',()=>{
  const f=fixture();
  const rows=[
    ['2026-10-31','A','','','', '',0,0,0,0,0,0,0,1000],
    ['2026-11-01','B','','','', '',0,100,0,0,0,0,0,900],
    ['2026-11-02','C','','','', '',0,50,0,0,0,0,0,850]
  ];
  const checked=f.api.balanceAudit(rows,[[],['=N1+G2-SUM(H2:M2)'],['=N2+G3-SUM(H3:M3)']]);
  assert.equal(checked.checked,1);
  assert.equal(checked.mismatches.length,0);
  assert.equal(checked.monthBoundaries.length,1);
  assert.equal(checked.monthBoundaries[0].row,2);
  assert.equal(checked.monthBoundaries[0].firstBalanceFormula,true);
  assert.equal(checked.unverified.length,0);
  assert.equal(f.state.postCalls,0);
});

test('boundary formula references last prior month balance without certifying transfer',()=>{
  const f=fixture();
  const rows=[
    ['2026-10-31','A','','','', '',0,0,0,0,0,0,0,1000],
    ['2026-11-01','B','','','', '',0,100,0,0,0,0,0,900]
  ];
  const r=f.api.balanceAudit(rows,[[],['=N1+G2-SUM(H2:M2)']]);
  assert.equal(r.monthBoundaries.length,1);
  assert.equal(r.monthBoundaries[0].referencesPriorBalance,true);
  assert.equal(r.monthBoundaries[0].continuityMatches,true);
  assert.equal(r.mismatches.length,0);
  assert.equal(f.state.postCalls,0);
});
test('month reset is explicitly flagged as not direct continuity, not mislabeled a balance error',()=>{
  const f=fixture();
  const rows=[
    ['2026-10-31','A','','','', '',0,0,0,0,0,0,0,1000],
    ['2026-11-01','B','','','', '',0,100,0,0,0,0,0,-100]
  ];
  const r=f.api.balanceAudit(rows,[[],['=G2-SUM(H2:M2)']]);
  assert.equal(r.monthBoundaries[0].referencesPriorBalance,false);
  assert.equal(r.monthBoundaries[0].continuityMatches,false);
  assert.equal(r.unverified.length,0);
  assert.equal(r.mismatches.length,0);
});

test('read-only formula audit finds previous N, current G and H:M references',()=>{
  const f=fixture();
  const rows=[
    ['2026-10-31','A','','','', '',0,0,0,0,0,0,0,1000],
    ['2026-11-01','B','','','', '',0,100,0,0,0,0,0,900]
  ];
  const outcome=f.api.balanceAudit(rows,[['=900+G1-SUM(H1:M1)'],['=N1+G2-SUM(H2:M2)']]);
  assert.equal(outcome.formulaRowsChecked,2);
  assert.equal(outcome.formulaPriorReferences,1);
  assert.equal(outcome.formulaSelfIncomeReferences,2);
  assert.equal(outcome.formulaExpenseReferences,2);
  assert.equal(outcome.formulaReview.length,0,'first transaction is an opening seed');
  assert.equal(outcome.openingFormulaRow,1);
  assert.equal(f.state.postCalls,0);
});
test('read-only formula audit flags hardcoded balances despite matching current values',()=>{
  const f=fixture();
  const rows=[
    ['2026-11-01','A','','','', '',0,0,0,0,0,0,0,1000],
    ['2026-11-02','B','','','', '',0,100,0,0,0,0,0,900]
  ];
  const outcome=f.api.balanceAudit(rows,[[],['=900']]);
  assert.equal(outcome.checked,1);
  assert.equal(outcome.mismatches.length,0);
  assert.equal(outcome.formulaRowsChecked,1);
  assert.equal(outcome.formulaPriorReferences,0);
  assert.equal(outcome.formulaSelfIncomeReferences,0);
  assert.equal(outcome.formulaExpenseReferences,0);
  assert.equal(outcome.formulaReview[0].row,2);
  assert.equal(f.state.postCalls,0);
});

function autoLedgerFixture(){
  const history=[
    ['Date'],
    ['2026-10-30','History A','C1','IPC','IPC01','支出',1000,0,0,0,0,0,0,1000],
    ['2026-10-31','History B','C2','IPC','IPC02','支出',0,50,0,0,0,0,0,950],
    ['2026-11-01','History C','C3','IPC','IPC03','支出',0,0,20,0,0,0,0,930]
  ];
  const formulas=[[],['=G2-SUM(H2:M2)'],
    ['=N2+G3-SUM(H3:M3)'],['=N3+G4-SUM(H4:M4)']];
  return {history,formulas};
}
async function fakeMirrorRow(api,values,id='PHU HUNG:expense:abc'){
  return [id,'PHU HUNG',values[0].slice(0,7),...values,'',
    await api.sha(api.payload(values)),'synced'];
}
test('computed TEST ledger merges older history and new mirror without touching history',async()=>{
  const f=fixture(),{history,formulas}=autoLedgerFixture();
  const unchanged=JSON.stringify(history),formulaBefore=JSON.stringify(formulas);
  const value=['2026-11-02','New Vendor','C4','IPC','IPC04','支出',0,0,100,0,0,0,0];
  const mirror=await fakeMirrorRow(f.api,value);
  const plan=await f.api.buildAutoLedger(history,formulas,[mirror]);
  assert.equal(plan.historicCount,3);
  assert.equal(plan.mirroredCount,1);
  assert.equal(plan.rows.length,4);
  assert.equal(plan.opening,0);
  assert.equal(plan.closingBalance,830);
  assert.equal(plan.rows[0].formula,'=$Q$2+G2-SUM(H2:M2)');
  assert.equal(plan.rows[3].formula,'=N4+G5-SUM(H5:M5)');
  assert.equal(plan.rows[3].cells[15],mirror[0]);
  assert.equal(JSON.stringify(history),unchanged);
  assert.equal(JSON.stringify(formulas),formulaBefore);
  assert.equal(f.state.postCalls,0);
});
test('computed ledger inserts backdated mirror transaction in a separate sorted view',async()=>{
  const f=fixture(),{history,formulas}=autoLedgerFixture();
  const value=['2026-10-30','Vendor D','C5','IPC','IPC05','支出',0,15,0,0,0,0,0];
  const mirror=await fakeMirrorRow(f.api,value);
  const plan=await f.api.buildAutoLedger(history,formulas,[mirror]);
  assert.equal(plan.rows[1].origin,'CASH_CONTROL');
  assert.equal(plan.rows[1].balance,985);
  assert.equal(plan.closingBalance,915);
  assert.equal(history[2][13],950,'original balance must remain unchanged');
});
test('computed TEST ledger blocks manually modified mirror amount',async()=>{
  const f=fixture(),{history,formulas}=autoLedgerFixture();
  const value=['2026-11-02','New Vendor','C4','IPC','IPC04','支出',0,0,100,0,0,0,0];
  const mirror=await fakeMirrorRow(f.api,value);
  mirror[11]=999;
  await assert.rejects(f.api.buildAutoLedger(history,formulas,[mirror]),/sửa ngoài Cash Control/);
  assert.equal(f.state.postCalls,0);
});
test('computed TEST ledger blocks duplicated transaction in historical sheet',async()=>{
  const f=fixture(),{history,formulas}=autoLedgerFixture();
  const mirror=await fakeMirrorRow(f.api,history[3].slice(0,13),'PHU HUNG:duplicate');
  await assert.rejects(f.api.buildAutoLedger(history,formulas,[mirror]),/trùng nội dung/);
});
test('computed TEST ledger blocks wrong historical balance or broken formula',async()=>{
  const f=fixture(),{history,formulas}=autoLedgerFixture();
  const badHistory=history.map(r=>[...r]);badHistory[2][13]=951;
  await assert.rejects(f.api.buildAutoLedger(badHistory,formulas,[]),/Chưa kiểm chứng/);
  const badFormula=formulas.map(r=>[...r]);badFormula[2]=['=950'];
  await assert.rejects(f.api.buildAutoLedger(history,badFormula,[]),/tham chiếu công thức/);
});
test('computed TEST ledger refuses earlier-than-opening mirror and wrong project',async()=>{
  const f=fixture(),{history,formulas}=autoLedgerFixture();
  const value=['2026-10-29','New Vendor','C4','IPC','IPC04','支出',0,0,100,0,0,0,0];
  const mirror=await fakeMirrorRow(f.api,value);
  await assert.rejects(f.api.buildAutoLedger(history,formulas,[mirror]),/sớm hơn/);
  mirror[1]='OTHER PROJECT';
  await assert.rejects(f.api.buildAutoLedger(history,formulas,[mirror]),/sai dự án/);
});
test('first dated transaction formula is seed, not a missing previous-transaction error',()=>{
  const f=fixture(),{history,formulas}=autoLedgerFixture();
  const audit=f.api.balanceAudit(history,formulas);
  assert.equal(audit.openingFormulaRow,2);
  assert.equal(audit.formulaRowsChecked,3);
  assert.equal(audit.formulaPriorReferences,2);
  assert.equal(audit.formulaReview.length,0);
});

test('computed ledger refuses to reorder unsorted original transactions',async()=>{
  const f=fixture(),{history,formulas}=autoLedgerFixture();
  history[2][0]='2026-10-29';
  await assert.rejects(f.api.buildAutoLedger(history,formulas,[]),
    /Ngày sổ lịch sử không tăng dần/);
  assert.equal(f.state.postCalls,0);
});

test('computed TEST historical-only preview works with no DATA_CASHCONTROL mirror',async()=>{
  const f=fixture(),{history,formulas}=autoLedgerFixture();
  const historyBefore=JSON.stringify(history),formulasBefore=JSON.stringify(formulas);
  const plan=await f.api.buildAutoLedger(history,formulas,[]);
  assert.equal(plan.mirroredCount,0);
  assert.equal(plan.historicCount,3);
  assert.equal(plan.rows.length,3);
  assert.equal(plan.opening,0);
  assert.equal(plan.closingBalance,930);
  assert.equal(plan.rows[0].formula,'=$Q$2+G2-SUM(H2:M2)');
  assert.equal(plan.rows[2].formula,'=N3+G4-SUM(H4:M4)');
  assert.equal(JSON.stringify(history),historyBefore);
  assert.equal(JSON.stringify(formulas),formulasBefore);
  assert.equal(f.state.postCalls,0);
});

async function cachedSourceRow(api,values,id){
  return {id,project:'PHU HUNG',month:values[0].slice(0,7),
    values,hash:await api.sha(api.payload(values))};
}
test('direct cached source matches October history and adds only November new row',async()=>{
  const f=fixture(),{history,formulas}=autoLedgerFixture();
  const matched=await cachedSourceRow(f.api,history[1].slice(0,13),'PHU HUNG:old1');
  const matchedTwo=await cachedSourceRow(f.api,history[2].slice(0,13),'PHU HUNG:old2');
  const newer=await cachedSourceRow(f.api,
    ['2026-11-02','NEW','C4','IPC','IPC04','支出',0,0,100,0,0,0,0],
    'PHU HUNG:expense:new');
  const knownNov=await cachedSourceRow(f.api,history[3].slice(0,13),'PHU HUNG:old3');
  const october=await f.api.mergeCachedSource(history,[],[matched,matchedTwo],'2026-10');
  assert.equal(october.matchedHistoric,2);
  assert.equal(october.sourceNew,0);
  const november=await f.api.mergeCachedSource(history,october.mirror,[knownNov,newer],'2026-11');
  assert.equal(november.matchedHistoric,1);
  assert.equal(november.sourceNew,1);
  assert.equal(november.mirror.length,1);
  const computed=await f.api.buildAutoLedger(history,formulas,november.mirror);
  assert.equal(computed.rows.length,4);
  assert.equal(computed.closingBalance,830);
  assert.equal(f.state.postCalls,0,'no Firestore or Sheets write in pure comparison');
});
test('cached source must match all historic entries of selected month or stop',async()=>{
  const f=fixture(),{history}=autoLedgerFixture();
  const onlyOne=await cachedSourceRow(f.api,history[1].slice(0,13),'PHU HUNG:one');
  await assert.rejects(f.api.mergeCachedSource(history,[],[onlyOne],'2026-10'),
    /Thiếu 1 giao dịch lịch sử/);
});
test('cached-source reconciliation does not erase unexplained older mirror entries',async()=>{
  const f=fixture(),{history}=autoLedgerFixture();
  const octoberMirror=await fakeMirrorRow(f.api,
    ['2026-10-30','NEW','C9','IPC','IPC09','支出',0,5,0,0,0,0,0],
    'PHU HUNG:orphan');
  await assert.rejects(f.api.mergeCachedSource(history,[octoberMirror],[],'2026-10'),
    /Thiếu 2 giao dịch lịch sử|không còn trong dữ liệu/);
});
test('direct source edit replaces valid older mirror row only in generated view',async()=>{
  const f=fixture(),{history,formulas}=autoLedgerFixture();
  const oldValues=['2026-11-02','NEW','C4','IPC','IPC04','支出',0,0,100,0,0,0,0];
  const editedValues=['2026-11-02','NEW','C4','IPC','IPC04','支出',0,0,125,0,0,0,0];
  const current=await fakeMirrorRow(f.api,oldValues,'PHU HUNG:expense:new');
  const direct=await cachedSourceRow(f.api,editedValues,'PHU HUNG:expense:new');
  const before=JSON.stringify(current);
  const knownNov=await cachedSourceRow(f.api,history[3].slice(0,13),'PHU HUNG:old3');
  const merge=await f.api.mergeCachedSource(history,[current],[knownNov,direct],'2026-11');
  assert.equal(merge.sourceUpdated,1);
  assert.equal(merge.mirror.length,1);
  assert.equal(merge.mirror[0][11],125);
  assert.equal(JSON.stringify(current),before,'real mirror is never modified');
  const result=await f.api.buildAutoLedger(history,formulas,merge.mirror);
  assert.equal(result.closingBalance,805);
});
test('direct source detects edited Google mirror and stops before creating a view',async()=>{
  const f=fixture(),{history}=autoLedgerFixture();
  const values=['2026-11-02','NEW','C4','IPC','IPC04','支出',0,0,100,0,0,0,0];
  const existing=await fakeMirrorRow(f.api,values,'PHU HUNG:expense:new');
  existing[11]=999;
  const source=await cachedSourceRow(f.api,values,'PHU HUNG:expense:new');
  const knownNov=await cachedSourceRow(f.api,history[3].slice(0,13),'PHU HUNG:old3');
  await assert.rejects(f.api.mergeCachedSource(history,[existing],[knownNov,source],'2026-11'),
    /Mirror đã bị chỉnh sửa/);
});
test('source fingerprint cannot hide duplicate historic and mirror payment',async()=>{
  const f=fixture(),{history}=autoLedgerFixture();
  const values=history[3].slice(0,13);
  const source=await cachedSourceRow(f.api,values,'PHU HUNG:matched');
  const mirror=await fakeMirrorRow(f.api,values,'PHU HUNG:matched');
  await assert.rejects(f.api.mergeCachedSource(history,[mirror],[source],'2026-11'),
    /đồng thời trong lịch sử và mirror/);
});

test('generated TEST tab comparison avoids repeating identical write or tab creation',async()=>{
  const f=fixture(),{history,formulas}=autoLedgerFixture();
  const plan=await f.api.buildAutoLedger(history,formulas,[]);
  const headers=['date','company','contractNo','content','ipc','type','income',
    'subcontract','material','otherDirect','indirect','financial','otherPayable',
    'balance','origin','sourceId','openingBalance'];
  f.state.computedValues=[headers,...plan.rows.map(x=>{
    const row=[...x.cells];row[13]=x.balance;return row;
  })];
  f.state.computedFormulas=plan.rows.map(x=>[x.formula]);
  const title='AUTO_PHU_HUNG_TEST_20261105T100110';
  assert.equal(await f.api.verifyComputedTab(title,plan),true);
  const surplus=[...f.state.computedValues.at(-1)];
  f.state.computedValues.push(surplus);
  f.state.computedFormulas.push(['=N4+G5-SUM(H5:M5)']);
  assert.equal(await f.api.verifyComputedTab(title,plan),false,
    'extra transaction must not be ignored when new plan is shorter');
  f.state.computedValues.pop();f.state.computedFormulas.pop();
  assert.equal(f.state.postCalls,0,'no mutation allowed during view comparison');
  f.state.computedValues[2][10]=999;
  assert.equal(await f.api.verifyComputedTab(title,plan),false,
    'changed company/amount column in existing tab must not be silently reused');
  assert.equal(f.state.postCalls,0);
});

test('fixed-view plan: new Cash Control payment then edit updates same sourceId without duplication',async()=>{
  const f=fixture(),{history,formulas}=autoLedgerFixture();
  const before=JSON.stringify(history);
  const knownNov=await cachedSourceRow(f.api,history[3].slice(0,13),'PHU HUNG:old3');
  const initial=await f.api.buildAutoLedger(history,formulas,[]);
  assert.equal(initial.rows.length,3);
  assert.equal(initial.closingBalance,930);
  const newValue=['2026-11-02','Vendor TEST','C4','IPC','IPC04','支出',0,0,100,0,0,0,0];
  const newSource=await cachedSourceRow(f.api,newValue,'PHU HUNG:payment:fixed-001');
  const added=await f.api.mergeCachedSource(history,[],[knownNov,newSource],'2026-11');
  assert.equal(added.sourceNew,1);
  const newPlan=await f.api.buildAutoLedger(history,formulas,added.mirror);
  assert.equal(newPlan.rows.length,4);
  assert.equal(newPlan.rows.filter(x=>x.sourceId===newSource.id).length,1);
  assert.equal(newPlan.closingBalance,830);
  const modified=[...newValue];modified[8]=125;
  const changed=await cachedSourceRow(f.api,modified,newSource.id);
  const revised=await f.api.mergeCachedSource(history,added.mirror,[knownNov,changed],'2026-11');
  assert.equal(revised.sourceNew,0);
  assert.equal(revised.sourceUpdated,1);
  const revisedPlan=await f.api.buildAutoLedger(history,formulas,revised.mirror);
  assert.equal(revisedPlan.rows.length,4,'editing must not append a second transaction');
  assert.equal(revisedPlan.rows.filter(x=>x.sourceId===changed.id).length,1);
  assert.equal(revisedPlan.closingBalance,805);
  const repeated=await f.api.mergeCachedSource(history,revised.mirror,[knownNov,changed],'2026-11');
  assert.equal(repeated.sourceNew,0);
  assert.equal(repeated.sourceUpdated,0);
  const same=await f.api.buildAutoLedger(history,formulas,repeated.mirror);
  assert.equal(same.closingBalance,805);
  assert.equal(same.rows.length,4);
  assert.equal(JSON.stringify(history),before,'legacy tab must remain unchanged');
  assert.equal(f.state.postCalls,0,'pure comparison must not write anything');
});

test('fixed TEST view checks the confirmed snapshot again immediately before write',()=>{
  const fnStart=pilot.indexOf('async function ccGoogleSyncUpdateStableView(');
  const fnEnd=pilot.indexOf('async function ccGoogleSyncCreateComputedLedgerTest(',fnStart);
  assert.ok(fnStart>=0&&fnEnd>fnStart,'stable-view write function is present');
  const fn=pilot.slice(fnStart,fnEnd);
  const checkpoint=fn.indexOf('confirmedViewSignature=second.signature;');
  const finalRead=fn.indexOf('const latest=await ccGoogleSyncReadStableView(title);');
  const finalGuard=fn.indexOf('latest.signature!==confirmedViewSignature');
  const write=fn.indexOf("await ccGoogleSyncApi(':batchUpdate',{method:'POST',body:{requests:[request]}});");
  assert.ok(checkpoint>=0&&checkpoint<finalRead,'record confirmed snapshot');
  assert.ok(finalRead>=0&&finalRead<finalGuard&&finalGuard<write,
    'reject an intervening edit before the write API call');
});

test('fixed-view commit refuses a concurrent edit before Google batchUpdate',async()=>{
  const f=fixture();
  const state={reads:0,writes:0};
  f.context.stableHarness={
    read:async()=>{
      state.reads++;
      return {rowCount:2,signature:state.reads===3?'changed-after-confirm':'confirmed'};
    },
    verify:async()=>false,
    api:async(path,options)=>{
      if(path.startsWith('?fields='))return {
        spreadsheetId:vm.runInContext('CC_SYNC_PILOT_ID',f.context),
        properties:{title:'PHU HUNG TEST'},
        sheets:[{properties:{title:'PHU_HUNG_VIEW_TEST',sheetId:123}}]
      };
      if(options?.method==='POST'){state.writes++;return {};}
      throw Error('Unexpected request '+path);
    }
  };
  vm.runInContext(
    'ccGoogleSyncReadStableView=()=>stableHarness.read();'+
    'ccGoogleSyncVerifyComputedTab=()=>stableHarness.verify();'+
    'ccGoogleSyncApi=(path,options)=>stableHarness.api(path,options);',f.context);
  const meta={sheets:[{properties:{title:'PHU_HUNG_VIEW_TEST',sheetId:123}}]};
  const plan={rows:[{cells:Array(17).fill(''),balance:0,formula:'=$Q$2+G2-SUM(H2:M2)'}],closingBalance:0};
  await assert.rejects(
    vm.runInContext('ccGoogleSyncUpdateStableView',f.context)(meta,plan),
    /thay đổi sau khi xác nhận/);
  assert.equal(state.reads,3);
  assert.equal(state.writes,0,'must stop before any Google write');
});

test('no-op DEMO comparison shows completed status and disables misleading commit',async()=>{
  const f=fixture({demo:true});
  await f.api.compare();
  await f.api.commit();
  const result=await f.api.compare();
  assert.equal(result.changes.length,0);
  assert.equal(result.blocked.length,0);
  assert.equal(f.nodes.ccGoogleSyncCommit.disabled,true);
  assert.match(f.nodes.ccGoogleSyncCommit.textContent,/không cần ghi/);
  assert.match(f.nodes.ccGoogleSyncGoogleStatus.textContent,/ĐÃ ĐỒNG BỘ ĐỦ/);
});

test('computed TEST view requests Google sheetId in initial metadata',()=>{
  const start=pilot.indexOf('async function ccGoogleSyncCreateComputedLedgerTest(');
  const end=pilot.indexOf('async function ccGoogleSyncAuditLegacy(',start);
  assert.ok(start>=0&&end>start);
  const fn=pilot.slice(start,end);
  assert.match(fn,/sheets\(properties\(title,sheetId\)\)/,
    'existing PHU_HUNG_VIEW_TEST must include sheetId before update');
});

test('live-source write is blocked if Admin has not explicitly refreshed Payment',async()=>{
  const f=fixture();
  const preview=await f.api.compare();
  assert.equal(preview.changes.length,1);
  vm.runInContext('ccGoogleSyncLiveSourceRefreshedAt=0',f.context);
  const writes=f.state.postCalls;
  await assert.rejects(f.api.commit(),/Làm mới nguồn PHU HUNG/);
  assert.equal(f.state.postCalls,writes,'no Google writes when source is stale');
});
test('live-source freshness expires and TEST staging must never fetch production',()=>{
  const f=fixture();
  vm.runInContext('ccGoogleSyncLiveSourceRefreshedAt=Date.now()-16*60*1000',f.context);
  assert.throws(()=>vm.runInContext('ccGoogleSyncRequireFreshLiveSource()',f.context),
    /Làm mới nguồn PHU HUNG/);
  const start=pilot.indexOf("  $('ccGoogleSyncLoadSource')?.addEventListener('click',async()=>{");
  const end=pilot.indexOf("  $('ccGoogleSyncCompare')?.addEventListener('click',async()=>{",start);
  assert.ok(start>=0&&end>start);
  const handler=pilot.slice(start,end);
  assert.match(handler,/CC_SYNC_DEMO_ALLOWED/);
  assert.match(handler,/force:true,quiet:true,refresh:true/);
  assert.match(handler,/ccGoogleSyncLiveSourceRefreshedAt=Date.now()/);
});

test('one-click TEST sync refuses staging without imported source and makes no writes',async()=>{
  const f=fixture({staging:true});
  const before=f.state.postCalls;
  await assert.rejects(
    vm.runInContext('ccGoogleSyncDirectSyncTest',f.context)(),
    /bản chụp nguồn đã nhập/);
  assert.equal(f.state.postCalls,before,'staging cannot fetch or write real data');
});
test('one-click TEST workflow includes explicit refresh and baseline reconciliation',()=>{
  const start=pilot.indexOf('async function ccGoogleSyncDirectSyncTest(');
  const end=pilot.indexOf('async function ccGoogleSyncAuditLegacy(',start);
  assert.ok(start>=0&&end>start);
  const fn=pilot.slice(start,end);
  assert.match(fn,/loadProjectPayments\('PHU HUNG',\{force:true,quiet:true,refresh:true\}\)/);
  assert.match(fn,/const months=\[\]/);
  assert.match(fn,/months\.push\(year\+'-'\+String\(m\)\.padStart\(2,'0'\)\)/);
  assert.match(fn,/if\(diff.blocked.length\)/);
  assert.ok(fn.indexOf('if(diff.blocked.length)')<fn.indexOf('await ccGoogleSyncCreateComputedLedgerTest({automatic})'));
  assert.match(fn,/finally\{monthControl.value=currentMonth\}/);
});

test('direct TEST workflow persists and verifies mirror before rebuilding view',async()=>{
  const f=fixture({staging:true});
  f.nodes.ccGoogleSyncMonth.value='2026-11';
  f.context.steps=[];
  vm.runInContext(`
    ccGoogleSyncImportedRows.set('2026-10', []);
    ccGoogleSyncImportedRows.set('2026-11', []);
    let comparisonNumber=0;
    ccGoogleSyncComparePilot=async()=>{
      comparisonNumber++;
      steps.push('compare:'+ccGoogleSyncMonthValue());
      return {blocked:[],changes:comparisonNumber===1||comparisonNumber===4?[]:[{id:'TEST-1'}]};
    };
    function ccGoogleSyncMonthValue(){return $('ccGoogleSyncMonth').value}
    ccGoogleSyncCommitPilot=async()=>{steps.push('commit')};
    ccGoogleSyncCreateComputedLedgerTest=async()=>{steps.push('view')};
  `,f.context);
  await vm.runInContext('ccGoogleSyncDirectSyncTest()',f.context);
  assert.deepEqual(Array.from(f.context.steps),[
    'compare:2026-10','compare:2026-11',
    'compare:2026-11','commit','compare:2026-11','view'
  ]);
  assert.equal(f.nodes.ccGoogleSyncMonth.value,'2026-11');
});
test('direct TEST workflow never updates view when mirror verification fails',async()=>{
  const f=fixture({staging:true});
  f.context.steps=[];
  vm.runInContext(`
    ccGoogleSyncImportedRows.set('2026-10', []);
    ccGoogleSyncImportedRows.set('2026-11', []);
    let n=0;ccGoogleSyncComparePilot=async()=>{steps.push('compare');n++;return {blocked:[],changes:n===1?[]:[{id:'still-pending'}]}};
    ccGoogleSyncCommitPilot=async()=>{steps.push('commit')};
    ccGoogleSyncCreateComputedLedgerTest=async()=>{steps.push('view')};
  `,f.context);
  await assert.rejects(vm.runInContext('ccGoogleSyncDirectSyncTest()',f.context),/mirror TEST chưa xác minh/);
  assert.ok(f.context.steps.includes('commit'));
  assert.ok(!f.context.steps.includes('view'),'invalid mirror cannot change consolidated view');
});
test('direct TEST workflow stops at conflicts before any write',async()=>{
  const f=fixture({staging:true});
  f.context.steps=[];
  vm.runInContext(`
    ccGoogleSyncImportedRows.set('2026-10', []);
    ccGoogleSyncImportedRows.set('2026-11', []);
    ccGoogleSyncComparePilot=async()=>{steps.push('compare');return {blocked:[{reason:'conflict'}],changes:[]}};
    ccGoogleSyncCommitPilot=async()=>{steps.push('commit')};
    ccGoogleSyncCreateComputedLedgerTest=async()=>{steps.push('view')};
  `,f.context);
  await assert.rejects(vm.runInContext('ccGoogleSyncDirectSyncTest()',f.context),/xung đột/);
  assert.deepEqual(Array.from(f.context.steps),['compare']);
});

test('later-month one-click sync blocks pending October transactions without writing',async()=>{
  const f=fixture({staging:true});
  f.context.steps=[];
  vm.runInContext(`
    ccGoogleSyncImportedRows.set('2026-10', []);
    ccGoogleSyncImportedRows.set('2026-11', []);
    ccGoogleSyncComparePilot=async()=>{steps.push('compare:'+ $('ccGoogleSyncMonth').value);
      return {blocked:[],changes:[{id:'october-unsynced'}]};};
    ccGoogleSyncCommitPilot=async()=>{steps.push('commit')};
    ccGoogleSyncCreateComputedLedgerTest=async()=>{steps.push('view')};
  `,f.context);
  await assert.rejects(vm.runInContext('ccGoogleSyncDirectSyncTest()',f.context),/Hãy đồng bộ tháng đó trước/);
  assert.deepEqual(Array.from(f.context.steps),['compare:2026-10']);
  assert.equal(f.nodes.ccGoogleSyncMonth.value,'2026-11');
  assert.equal(f.state.postCalls,0);
});

test('one-click integration writes new transaction, edits it, and repeated click is a no-op',async()=>{
  const f=fixture({staging:true});
  // Keep every operation inside mocked Google; actual comparison, mirror commit,
  // readback hashes and conflict detection all run unmodified.
  f.state.legacyValues=[];
  f.context.steps=[];
  vm.runInContext(`
    ccGoogleSyncImportedRows.set('2026-10', []);
    ccGoogleSyncCreateComputedLedgerTest=async()=>{
      steps.push('view');
      const remote=await ccGoogleSyncReadSheet();
      if(remote.rows.length!==1)throw Error('Expected one verified mirror row.');
      const row=remote.rows[0];
      if(row[0]!=='PHU HUNG:expense:001')throw Error('Unexpected source ID');
      if(await ccGoogleSyncSha(ccGoogleSyncPayloadCells(row.slice(3,16)))!==row[17])
        throw Error('Source integrity failed before view update');
    };
  `,f.context);
  const makeSource=async(amount)=>{
    f.state.source=[tx('2026-11',amount)];
    const v=vm.runInContext('ccGoogleSyncRowValues',f.context)(f.state.source[0]);
    const hash=await f.api.sha(f.api.payload(v));
    const entry={id:'PHU HUNG:expense:001',project:'PHU HUNG',month:'2026-11',values:v,hash};
    vm.runInContext('ccGoogleSyncImportedRows',f.context).set('2026-11',[entry]);
  };
  await makeSource(100.3);
  await vm.runInContext('ccGoogleSyncDirectSyncTest()',f.context);
  assert.equal(f.state.rows.length,1);
  assert.equal(f.state.rows[0][10],100.3);
  const afterFirst=f.state.postCalls;
  await vm.runInContext('ccGoogleSyncDirectSyncTest()',f.context);
  assert.equal(f.state.postCalls,afterFirst,'repeated run must not write to Google');
  await makeSource(155.3);
  await vm.runInContext('ccGoogleSyncDirectSyncTest()',f.context);
  assert.equal(f.state.rows.length,1,'edited transaction must preserve ID');
  assert.equal(f.state.rows[0][10],155.3);
  assert.equal(f.context.steps.filter(x=>x==='view').length,3);
});

test('December TEST sync checks intervening November and blocks if it is pending',async()=>{
  const f=fixture({staging:true,month:'2026-12'});
  f.context.steps=[];
  vm.runInContext(`
    ccGoogleSyncImportedRows.set('2026-10', []);
    ccGoogleSyncImportedRows.set('2026-11', []);
    ccGoogleSyncImportedRows.set('2026-12', []);
    ccGoogleSyncComparePilot=async()=>{
      const month=$('ccGoogleSyncMonth').value;
      steps.push(month);
      return {blocked:[],changes:month==='2026-11'?[{id:'november-unwritten'}]:[]};
    };
    ccGoogleSyncCommitPilot=async()=>{steps.push('commit')};
    ccGoogleSyncCreateComputedLedgerTest=async()=>{steps.push('view')};
  `,f.context);
  await assert.rejects(vm.runInContext('ccGoogleSyncDirectSyncTest()',f.context),
    /Tháng 2026-11 còn 1 giao dịch/);
  assert.deepEqual(Array.from(f.context.steps),['2026-10','2026-11']);
  assert.equal(f.nodes.ccGoogleSyncMonth.value,'2026-12');
  assert.equal(f.state.postCalls,0);
});

test('retry after VIEW failure preserves mirror exactly once and recovers',async()=>{
  const f=fixture({staging:true});
  const normalized=vm.runInContext('ccGoogleSyncRowValues',f.context)(tx('2026-11',280000));
  const entry={id:'PHU HUNG:expense:001',project:'PHU HUNG',month:'2026-11',
    values:normalized,hash:await f.api.sha(f.api.payload(normalized))};
  f.context.viewAttempts=0;
  vm.runInContext(`
    ccGoogleSyncImportedRows.set('2026-10', []);
    ccGoogleSyncImportedRows.set('2026-11', recoverySource);
    ccGoogleSyncCreateComputedLedgerTest=async()=>{
      viewAttempts++;
      if(viewAttempts===1)throw Error('TEST simulated view failure after mirror write');
    };
  `.replace('recoverySource','recoverySource'),Object.assign(f.context,{recoverySource:[entry]}));
  await assert.rejects(vm.runInContext('ccGoogleSyncDirectSyncTest()',f.context),/simulated view failure/);
  assert.equal(f.state.rows.length,1,'mirror was committed');
  assert.equal(f.state.rows[0][10],280000);
  const afterFailedView=f.state.postCalls;
  await vm.runInContext('ccGoogleSyncDirectSyncTest()',f.context);
  assert.equal(f.state.rows.length,1,'retry must not duplicate the mirror');
  assert.equal(f.state.postCalls,afterFailedView,'retry must not rewrite unchanged mirror rows');
  assert.equal(f.context.viewAttempts,2,'retry resumes the failed VIEW step');
});

test('staging auto sync reacts to a source change once, then skips unchanged content',async()=>{
  const f=fixture({staging:true});
  f.context.autoRuns=0;
  vm.runInContext(`
    ccGoogleSyncImportedRows.set('2026-10',[]);
    ccGoogleSyncImportedRows.set('2026-11',[{id:'STAGING-TEST-1',hash:'hash-1'}]);
    ccGoogleSyncAutoEnabled=true;
    ccGoogleSyncDirectSyncTest=async({automatic}={})=>{
      if(!automatic)throw Error('Must never invoke manual mode');
      autoRuns++;
      return 'verified';
    };
  `,f.context);
  await vm.runInContext('ccGoogleSyncAutoSourceChanged()',f.context);
  await vm.runInContext('ccGoogleSyncAutoSourceChanged()',f.context);
  assert.equal(f.context.autoRuns,1,'unchanged source must not re-write');
  assert.equal(f.state.postCalls,0,'the auto coordinator itself never queries Google');
  vm.runInContext("ccGoogleSyncImportedRows.get('2026-11')[0].hash='hash-2'",f.context);
  await vm.runInContext('ccGoogleSyncAutoSourceChanged()',f.context);
  assert.equal(f.context.autoRuns,2,'an edited source schedules one new reconciliation');
});
test('auto sync is blocked in production and stops on a failed staging write',async()=>{
  const prod=fixture();
  vm.runInContext('ccGoogleSyncAutoEnabled=true',prod.context);
  await vm.runInContext('ccGoogleSyncAutoSourceChanged()',prod.context);
  assert.equal(prod.state.postCalls,0);
  const f=fixture({staging:true});
  vm.runInContext(`
    ccGoogleSyncImportedRows.set('2026-10',[]);
    ccGoogleSyncImportedRows.set('2026-11',[]);
    ccGoogleSyncAutoEnabled=true;
    ccGoogleSyncDirectSyncTest=async()=>{throw Error('TEST write interrupted')};
  `,f.context);
  await vm.runInContext('ccGoogleSyncAutoSourceChanged()',f.context);
  assert.equal(vm.runInContext('ccGoogleSyncAutoEnabled',f.context),false);
  assert.equal(f.state.postCalls,0);
});
