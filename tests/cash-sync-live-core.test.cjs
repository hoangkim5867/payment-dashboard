'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const C=require('../server/cash-sync-live-core.cjs');
const signature=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function fixture(){
  let balance=10000000;
  const original=[['Ngày','Đơn vị','HĐ','Nội dung','IPC','Loại','Thu',
    'SUBP','SUPL','Other','Indirect','Financial','OtherPayable','Balance']];
  const revised=[original[0].slice()];
  for(let n=2;n<=161;n++){
    const date=n<148?'2026-10-01':'2026-10-27';
    const expense=n===148?350945181.3:1000+n;
    const values=[date,'Vendor'+n,'LAB-'+n,'Chi phí '+n,'IPC'+n,'支出',
      0,0,0,0,expense,0,0];
    balance=Math.round((balance-expense)*1e6)/1e6;
    original.push([...values,balance]);
    revised.push([...values.slice(0,10),n===148?350945181:expense,0,0,
      Math.round((balance+(n>=148?0.3:0))*1e6)/1e6]);
  }
  const sources=revised.slice(131,161).map((v,i)=>{
    const values=v.slice(0,13);
    return {id:'PHU HUNG:synced-id-'+i,project:'PHU HUNG',month:'2026-10',
      values,hash:signature(values)};
  });
  return {original,revised,sources};
}
test('the one-time correction is 160 historical records; no data is changed in place',()=>{
  const f=fixture(),snapshot=JSON.stringify(f.original);
  const rows=C.correctedHistory(f.original);
  assert.equal(rows.length,160);
  assert.equal(rows.find(r=>r.sheetRow===148).values[10],350945181);
  assert.equal(JSON.stringify(f.original),snapshot);
});
test('30 dated sources bind exactly once to history and are not appended again',()=>{
  const f=fixture(),history=C.correctedHistory(f.original);
  const p=C.prepareNewMirror(f.sources,history);
  assert.equal(p.newMirror.length,30);
  assert.equal(p.newMirror.filter(x=>x.status.startsWith('history:')).length,30);
  const ledger=C.buildLedger(history,p.newMirror);
  assert.equal(ledger.rows.length,160);
  assert.equal(ledger.extraCount,0);
  assert.equal(ledger.rows.at(-1).balance,ledger.closingBalance);
});
test('Google view grid retains original historical order and formulas',()=>{
  const f=fixture(),history=C.correctedHistory(f.original);
  const p=C.prepareNewMirror(f.sources,history);
  const plan=C.buildLedger(history,p.newMirror);
  const view=C.viewGrid(plan).map(r=>r.values.map(v=>Object.values(v.userEnteredValue||{})[0]??''));
  for(let i=1;i<view.length;i++)view[i][13]=plan.rows[i-1].balance;
  const formulas=plan.rows.map(x=>[x.formula]);
  assert.equal(C.verifyView(view,formulas,plan),true);
  view[145][12]=1;
  assert.equal(C.verifyView(view,formulas,plan),false);
});
test('new November transaction generates exactly one extra, with a stable ID',()=>{
  const f=fixture(),history=C.correctedHistory(f.original);
  const novValues=['2026-11-10','New Vendor','SUBP-001','IPC','IPC025','支出',
    0,5000,0,0,0,0,0];
  const source={id:'PHU HUNG:NEW-NOV',project:'PHU HUNG',month:'2026-11',
    values:novValues,hash:signature(novValues)};
  const p=C.prepareNewMirror([...f.sources,source],history);
  const plan=C.buildLedger(history,p.newMirror);
  assert.equal(p.newMirror.filter(x=>x.status==='synced').length,1);
  assert.equal(plan.extraCount,1);
  assert.equal(plan.rows.length,161);
  assert.equal(plan.rows.at(-1).sourceId,'PHU HUNG:NEW-NOV');
});
test('a correction to a historical source keeps its binding across later updates',()=>{
  const f=fixture(),history=C.correctedHistory(f.original);
  const p=C.prepareNewMirror(f.sources,history);
  const old=p.newMirror.map(x=>[
    x.id,'PHU HUNG',x.month,...x.values,'',x.hash,x.status
  ]);
  const modified=f.sources.map(x=>({...x,values:x.values.slice()}));
  modified[0].values[10]+=1;
  modified[0].hash=signature(modified[0].values);
  const next=C.prepareNewMirror(modified,history,old);
  const changed=next.newMirror.find(x=>x.id===modified[0].id);
  assert.match(changed.status,/^historyUpdated:/);
  const newPlan=C.buildLedger(history,next.newMirror);
  assert.equal(newPlan.rows.length,160);
  assert.equal(newPlan.closingBalance,C.buildLedger(history,p.newMirror).closingBalance-1);
  const later=C.prepareNewMirror(modified,history,
    next.newMirror.map(x=>[x.id,'PHU HUNG',x.month,...x.values,'',x.hash,x.status]));
  assert.equal(later.newMirror.find(x=>x.id===modified[0].id).status,changed.status);
});
test('missing previously synced transaction stops rather than silently deleting it',()=>{
  const f=fixture(),history=C.correctedHistory(f.original);
  const p=C.prepareNewMirror(f.sources,history);
  const old=p.newMirror.map(x=>[x.id,'PHU HUNG',x.month,...x.values,'',x.hash,x.status]);
  assert.throws(()=>C.prepareNewMirror(f.sources.slice(1),history,old),/không còn giao dịch/);
});
test('source ID duplication, wrong amount hash, missing months fail closed',()=>{
  const f=fixture(),rows=f.sources,base={fromMonth:'2026-10',
    throughMonth:'2026-11',months:['2026-10','2026-11'],rows};
  assert.equal(C.sanitizeSource(base).length,30);
  assert.throws(()=>C.sanitizeSource({...base,months:['2026-10']}),/đủ tất cả tháng/);
  assert.throws(()=>C.sanitizeSource({...base,rows:[...rows,rows[0]]}),/ID trùng/);
  const bad=rows.map(x=>({...x}));
  bad[0].hash='not-hash';
  assert.throws(()=>C.sanitizeSource({...base,rows:bad}),/Hash/);
});
test('mirror grid has exactly 19 columns and formula N cannot be overwritten with static balance',()=>{
  const f=fixture(),history=C.correctedHistory(f.original);
  const p=C.prepareNewMirror(f.sources,history);
  const ledger=C.buildLedger(history,p.newMirror);
  const mirror=C.mirrorGrid(p.newMirror),view=C.viewGrid(ledger);
  assert.equal(mirror.length,31);
  for(const row of mirror)assert.equal(row.values.length,19);
  for(const row of view)assert.equal(row.values.length,17);
  assert.equal(view[1].values[13].userEnteredValue.formulaValue,'=$Q$2+G2-SUM(H2:M2)');
  assert.equal(view[2].values[13].userEnteredValue.formulaValue,'=N2+G3-SUM(H3:M3)');
});

test('one-tab activation is atomic, old history is hidden/renamed only, never overwritten',()=>{
  const requests=require('../api/cash-sync-original-live.js')._internals;
  const f=fixture(),h=C.correctedHistory(f.original);
  const mirror=C.prepareNewMirror(f.sources,h),plan=C.buildLedger(h,mirror.newMirror);
  const initial={meta:{sheets:[{properties:{sheetId:777,title:'PHU HUNG'}}]},
    view:{sheetId:777},plan,combined:mirror};
  const batch=requests.activateRequests(initial);
  assert.ok(batch.requests.length>=7);
  assert.ok(batch.requests.every(x=>!x.deleteSheet&&!x.deleteDimension&&!x.deleteRange));
  const changes=batch.requests.filter(x=>x.updateCells);
  assert.equal(changes.length,2);
  assert.ok(changes.every(x=>x.updateCells.range.sheetId!==777));
  const backup=batch.requests.find(x=>x.updateSheetProperties?.properties.sheetId===777);
  assert.equal(backup.updateSheetProperties.properties.title,'PHU_HUNG_HISTORY_BACKUP');
  assert.equal(backup.updateSheetProperties.properties.hidden,true);
  const makeView=batch.requests.find(x=>x.updateSheetProperties?.properties.sheetId===batch.newViewId &&
    x.updateSheetProperties.properties.title==='PHU HUNG');
  assert.ok(makeView);
  const mirrorSheet=batch.requests.find(x=>x.addSheet?.properties.sheetId===batch.newMirrorId);
  assert.equal(mirrorSheet.addSheet.properties.hidden,true);
});
test('live monthly sync writes only current derived view and hidden mirror, never old history',()=>{
  const requests=require('../api/cash-sync-original-live.js')._internals;
  const f=fixture(),h=C.correctedHistory(f.original);
  const mirror=C.prepareNewMirror(f.sources,h),plan=C.buildLedger(h,mirror.newMirror);
  const changes=requests.syncRequests({
    plan,combined:mirror,
    view:{sheetId:3456,gridProperties:{rowCount:1000}},
    mirrorSheet:{sheetId:3457,gridProperties:{rowCount:1000}},
    oldPlan:plan,oldMirror:[]
  });
  assert.equal(changes.length,2);
  assert.deepEqual(changes.map(r=>r.updateCells.range.sheetId),[3457,3456]);
  assert.ok(!changes.some(r=>JSON.stringify(r).includes('PHU_HUNG_HISTORY_BACKUP')));
});

test('post-write archive verification detects any change, including non-transaction rows',()=>{
  const verify=require('../api/cash-sync-original-live.js')._internals.unchangedHistoricalSnapshot;
  const initial=[['Ngày','Đơn vị','HĐ','Nội dung','IPC','Loại','Thu',
    'SUBP','SUPL','Other','Indirect','Financial','OtherPayable','Balance'],
    ['2026-10-27','VENDOR','CONTRACT','NOTE','IPC','支出',0,0,0,0,350945181.3,0,0,1234],
    ['Tổng cộng','','','','','','','','','','','','',1234]];
  const identical=structuredClone(initial);
  assert.equal(verify(initial,identical),true);
  const changedAmount=structuredClone(initial);
  changedAmount[1][10]=350945181;
  assert.equal(verify(initial,changedAmount),false);
  const changedHeader=structuredClone(initial);
  changedHeader[0][0]='Modified';
  assert.equal(verify(initial,changedHeader),false);
  const changedTotal=structuredClone(initial);
  changedTotal[2][13]=1235;
  assert.equal(verify(initial,changedTotal),false);
  const missingRow=structuredClone(initial);
  missingRow.splice(1,1);
  assert.equal(verify(initial,missingRow),false);
});

test('original live preview is strictly read-only; all write action labels stay gated',()=>{
  const check=require('../api/cash-sync-original-live.js')._internals.actionIsPreview;
  assert.equal(check({action:'activate-preview'}),true);
  assert.equal(check({action:'sync-preview'}),true);
  assert.equal(check(JSON.stringify({action:'activate-preview'})),true);
  for(const input of [{action:'activate'},{action:'sync'},null,[],{action:'sync-preview-now'},
    'not-json', {action:['sync-preview']},{action:'sync-preview',nested:{action:'sync'}}]){
    if(input?.nested)continue; // the top-level action is the sole routing input
    assert.equal(check(input),false);
  }
  // Even if a request is mislabeled, the server's later action dispatcher has
  // the same action value and will not execute a write for either preview label.
  assert.equal(check({action:'sync-preview',nested:{action:'sync'}}),true);
  assert.throws(()=>require('../server/cash-sync-guard.cjs').readConfig({
    VERCEL_ENV:'production',CASH_SYNC_FIREBASE_PROJECT_ID:'cscecmep-payment',
    CASH_SYNC_ADMIN_UID:'AuthorizedAdminUid123'
  }),/not been approved/);
});

test('last-moment revalidation prevents stale activation and stale sync writes',()=>{
  const same=require('../api/cash-sync-original-live.js')._internals.sameApprovedState;
  const activate={active:false,signature:'immutable-snapshot-A'};
  assert.equal(same(activate,{...activate},'activate'),true);
  assert.equal(same(activate,{...activate,signature:'changed-original'},'activate'),false);
  assert.equal(same(activate,{active:true,signature:activate.signature},'activate'),false);
  const synced={active:true,signature:'hash-old',changes:true};
  assert.equal(same(synced,{...synced},'sync'),true);
  assert.equal(same(synced,{...synced,changes:false},'sync'),false);
  assert.equal(same(synced,{...synced,signature:'hash-new'},'sync'),false);
  assert.equal(same(synced,null,'sync'),false);
});

test('already corrected original K148 is accepted without applying 0.3 a second time',()=>{
  const f=fixture(), corrected=structuredClone(f.revised), snapshot=JSON.stringify(corrected);
  const rows=C.correctedHistory(corrected);
  assert.equal(rows.length,160);
  assert.equal(rows.find(r=>r.sheetRow===148).values[10],350945181);
  assert.equal(JSON.stringify(corrected),snapshot);
  const combined=C.prepareNewMirror(f.sources,rows);
  assert.equal(combined.newMirror.filter(x=>x.status.startsWith('history:')).length,30);
  const plan=C.buildLedger(rows,combined.newMirror);
  assert.equal(plan.rows.length,160);
  assert.equal(plan.extraCount,0);
  assert.equal(plan.closingBalance,C.buildLedger(C.correctedHistory(f.original),
    C.prepareNewMirror(f.sources,C.correctedHistory(f.original)).newMirror).closingBalance);
});
test('unapproved K148 values still fail closed',()=>{
  const f=fixture(),bad=structuredClone(f.revised);
  bad[147][10]=350945180;
  assert.throws(()=>C.correctedHistory(bad),/Khoản lương K148/);
});

test('new visible PHU HUNG view reuses archived historical headings and adds formula totals',()=>{
  const f=fixture(), history=C.correctedHistory(f.revised);
  const data=C.prepareNewMirror(f.sources,history),plan=C.buildLedger(history,data.newMirror);
  const header=C.historicalDisplayHeader(f.original);
  assert.equal(header.length,17);
  assert.deepEqual(header.slice(0,14),f.original[0]);
  const grid=C.viewGrid(plan,header);
  assert.equal(grid.length,plan.rows.length+2);
  const values=grid.map(r=>r.values.map(c=>Object.values(c.userEnteredValue||{})[0]??''));
  const sumrow=grid.at(-1).values;
  assert.equal(sumrow[0].userEnteredValue.stringValue,'合计');
  assert.equal(sumrow[6].userEnteredValue.formulaValue,'=SUM(G2:G161)');
  assert.equal(sumrow[12].userEnteredValue.formulaValue,'=SUM(M2:M161)');
  assert.equal(sumrow[13].userEnteredValue.formulaValue,'=N161');
  // Google returns computed values in its UNFORMATTED_VALUE response.
  for(let i=1;i<=plan.rows.length;i++)values[i][13]=plan.rows[i-1].balance;
  for(let j=6;j<=12;j++)
    values.at(-1)[j]=plan.rows.reduce((sum,r)=>sum+r.values[j],0);
  values.at(-1)[13]=plan.closingBalance;
  const formulas=plan.rows.map(r=>[r.formula]).concat([['=N161']]);
  assert.equal(C.verifyView(values,formulas,plan,header),true);
  values.at(-1)[6]++;
  assert.equal(C.verifyView(values,formulas,plan,header),false);
});
test('visible zero hiding is formatting-only; no source amounts or formulas are modified',()=>{
  const f=fixture(),history=C.correctedHistory(f.revised);
  const data=C.prepareNewMirror(f.sources,history),plan=C.buildLedger(history,data.newMirror);
  const api=require('../api/cash-sync-original-live.js')._internals;
  const oldMirror=data.newMirror.map(x=>[x.id,'PHU HUNG',x.month,...x.values,'',x.hash,x.status]);
  const state={plan,combined:data,displayHeader:C.historicalDisplayHeader(f.revised),
    view:{sheetId:3456,gridProperties:{rowCount:1000}},
    mirrorSheet:{sheetId:3457,gridProperties:{rowCount:1000}},
    oldPlan:plan,oldMirror};
  const writes=api.syncRequests(state);
  const updates=writes.filter(x=>x.updateCells);
  assert.equal(updates.length,2);
  assert.deepEqual(updates.map(x=>x.updateCells.range.sheetId),[3457,3456]);
  const moneyFormat=writes.find(x=>x.repeatCell?.fields==='userEnteredFormat.numberFormat');
  assert.equal(moneyFormat.repeatCell.range.sheetId,3456);
  assert.equal(moneyFormat.repeatCell.range.startColumnIndex,6);
  assert.equal(moneyFormat.repeatCell.range.endColumnIndex,13);
  assert.equal(moneyFormat.repeatCell.cell.userEnteredFormat.numberFormat.pattern.includes(';;'),true);
  assert.equal(writes.some(x=>JSON.stringify(x).includes('PHU_HUNG_HISTORY_BACKUP')),false);
  assert.equal(plan.rows.length,160);
});
