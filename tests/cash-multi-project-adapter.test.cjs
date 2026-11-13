'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {planMonth}=require('../server/cash-sync-multi-project-core.cjs');
const {compileBatch,normalizeMirror,normalizeView,parseStoredMirror,
 verifyExistingView,MIRROR_HEADER,VIEW_HEADER}=require('../server/cash-sync-multi-project-adapter.cjs');
const a=(day,amount,contract='SUBP-001')=>
 [day,'Vendor',contract,'Invoice','IPC01','分包款',0,amount,0,0,0,0,0];
const meta=(extra=[])=>({sheets:[{properties:{title:'SỔ LỊCH SỬ',sheetId:42}},
 ...extra.map(([title,sheetId])=>({properties:{title,sheetId}}))]});
test('atomic batch writes only new machine tabs, never the original historical gid',()=>{
 const plan=planMonth({project:'ELYSIAN',month:'2026-11',
  source:[{id:'expense:1',project:'ELYSIAN',month:'2026-11',
   values:a('2026-11-03',100)}],history:[],openingBalance:0});
 const batch=compileBatch({plan,metadata:meta(),historySheetId:42});
 assert.equal(batch.historyPreserved,true);
 assert.equal(batch.requests.length,4);
 assert.deepEqual(batch.requests.filter(r=>r.updateCells).map(r=>r.updateCells.range.sheetId),
  [batch.mirrorId,batch.viewId]);
 assert.equal(batch.requests.some(r=>r.updateCells?.range.sheetId===42),false);
 assert.equal(batch.expectedMirror[0].length,19);
 assert.equal(batch.expectedView[0].length,18);
 assert.equal(batch.requests[3].updateCells.rows[1].values[14].userEnteredValue.formulaValue,
  '=$R$2+G2-SUM(H2:N2)');
 assert.equal(batch.canWrite,false);
 assert.equal(batch.approvedWrites,0);
});
test('same project once repeated yields an identical batch fingerprint, no new source writes',()=>{
 const input={project:'SSIS',month:'2026-11',
  source:[{id:'transfer:1:in',project:'SSIS',month:'2026-11',
   values:a('2026-11-09',500)}],history:[],openingBalance:0};
 const first=planMonth(input);
 const again=planMonth({...input,mirror:first.mirrorNext});
 assert.equal(again.changes.length,0);
 const batch=compileBatch({plan:again,
  metadata:meta([['DATA_CASHCONTROL',10001],['CASHCONTROL_VIEW',10002]]),
  historySheetId:42});
 assert.equal(batch.requests.length,2);
 assert.equal(batch.mirrorId,10001);
 assert.equal(batch.viewId,10002);
 assert.equal(batch.historyPreserved,true);
});
test('machine mirror header cannot be confused with old PHU HUNG pilot mirror',()=>{
 assert.deepEqual(parseStoredMirror([MIRROR_HEADER]),[]);
 assert.throws(()=>parseStoredMirror([['sourceId','projectKey','month']]),/header khác/);
});
test('existing VIEW matches exact values and formulas; manual changes are rejected',()=>{
 const plan=planMonth({project:'SSIS',month:'2026-11',
  source:[{id:'expense:one',project:'SSIS',month:'2026-11',
   values:a('2026-11-09',50)}],history:[],openingBalance:100});
 const raw=normalizeView(plan);
 const values=raw.map((row,i)=>i===0?row:[...row.slice(0,14),
  plan.viewRows[i-1].balance,...row.slice(15)]);
 const formulas=raw.map((row,i)=>[i===0?VIEW_HEADER[14]:row[14]]);
 assert.equal(verifyExistingView(values,formulas,plan),true);
 values[1][7]=55;
 assert.throws(()=>verifyExistingView(values,formulas,plan),/số tiền bị sửa tay/);
});
test('wrong historical gid or partial prior machine tabs cannot be targeted',()=>{
 const plan=planMonth({project:'ELYSIAN',month:'2026-11',
   source:[],history:[],openingBalance:0});
 assert.throws(()=>compileBatch({plan,metadata:meta(),historySheetId:100}),/gid/);
 assert.throws(()=>compileBatch({plan,metadata:meta([['DATA_CASHCONTROL',10001]]),
  historySheetId:42}),/không nhất quán/);
 assert.throws(()=>compileBatch({plan,metadata:meta([['CASHCONTROL_VIEW',42]]),
  historySheetId:42}),/metadata/);
});
test('FOXCONN retains a separate tax column and uses no untrusted formulas from descriptions',()=>{
 const values=[...a('2026-11-09',100),5];
 values[3]='=IMPORTXML("https://invalid.example","//x")';
 const plan=planMonth({project:'FOXCONN',month:'2026-11',
  source:[{id:'expense:fox',project:'FOXCONN',month:'2026-11',values}],
  history:[],openingBalance:200,foxconn:true});
 const batch=compileBatch({plan,metadata:meta(),historySheetId:42});
 assert.equal(batch.expectedView[1][13],5);
 assert.equal(batch.expectedView[1][14],'=$R$2+G2-SUM(H2:N2)');
 assert.ok(batch.requests[3].updateCells.rows[1].values[3].userEnteredValue.stringValue.startsWith('=IMPORTXML'));
 assert.equal(batch.requests[3].updateCells.rows[1].values[3].userEnteredValue.formulaValue,undefined);
});
