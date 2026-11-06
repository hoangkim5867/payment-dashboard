'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {hashValues}=require('../functions/cash-sync/three-way.cjs');
const {HEADER}=require('../functions/cash-sync/verified-mirror.cjs');
const {fingerprint,verifyHistory,normalizeDate}=require('../functions/cash-sync/history-audit.cjs');
const {auditSourceAgainstTestLedger,auditWithInspector}=
  require('../functions/cash-sync/read-only-audit.cjs');
const {createTestSheetsInspector,TEST_ID}=require('../functions/cash-sync/sheets-inspector.cjs');
const financial=(date,company,contract,ipc,otherDirect,indirect)=>[
  date,company,contract,'Nội dung',ipc,'支出',
  0,0,0,otherDirect,indirect,0,0
];
const historic=[
  ['Ngày','Công ty','Hợp đồng'],
  [...financial('2026-10-27','中方员工工资','','',0,100),900],
  [...financial('2026-10-28','Vendor A','CONTRACT-1','IPC001',120,0),780],
  [...financial('2026-11-01','Vendor B','CONTRACT-2','IPC002',70,0),710]
];
const formula=[
  [],['=1000+G2-SUM(H2:M2)'],
  ['=N2+G3-SUM(H3:M3)'],
  ['=N3+G4-SUM(H4:M4)']
];
const makeSource=(values,id)=>({id:'PHU HUNG:'+id,project:'PHU HUNG',
  month:values[0].slice(0,7),values,hash:hashValues(values)});
const sample={
  oldSalary:makeSource(financial('2026-10-27','Lương Trung Quốc','','',0,100),'payroll:cn'),
  oldVendor:makeSource(financial('2026-10-28','Vendor A','CONTRACT-1','IPC001',120,0),'expense:001'),
  oldNov:makeSource(financial('2026-11-01','Vendor B','CONTRACT-2','IPC002',70,0),'expense:002'),
  newNov:makeSource(financial('2026-11-06','Vendor C','CONTRACT-3','IPC003',0,321000),'expense:003')
};
const snapshot=()=>({schema:'PHU_HUNG_CASH_SOURCE_V1',project:'PHU HUNG',
  sourceProject:'cscecmep-payment',createdAt:'2026-11-06T01:01:01Z',
  months:[{month:'2026-10',rows:[sample.oldSalary,sample.oldVendor]},
    {month:'2026-11',rows:[sample.oldNov,sample.newNov]}]});
const pack=row=>[row.id,row.project,row.month,...row.values,'',row.hash,'synced'];
const sheet=()=>[HEADER,pack(sample.newNov)];
test('history matches source payroll CN/VN aliases with unchanged contract/IPC rules',()=>{
  const a=fingerprint(sample.oldSalary.values);
  const b=fingerprint(financial('2026-10-27','中方员工工资','','',0,100));
  assert.equal(a,b);
  assert.notEqual(fingerprint(financial('2026-10-27','Lương Trung Quốc','A','',0,100)),
    fingerprint(financial('2026-10-27','中方员工工资','A','',0,100)));
  assert.equal(normalizeDate('27/10/2026'),'2026-10-27');
  assert.equal(normalizeDate('2026-10-27'),'2026-10-27');
  assert.equal(normalizeDate(46322),'2026-10-27'); // Google date serial (verify)
});
test('full read-only audit matches historic rows and mirror with zero write permissions',()=>{
  const result=auditSourceAgainstTestLedger({snapshot:snapshot(),historical:historic,
    historyFormulas:formula,mirror:sheet()});
  assert.equal(result.status,'matched-read-only');
  assert.equal(result.matchedHistory,3);
  assert.equal(result.unmatchedHistory,0);
  assert.equal(result.pendingCount,0);
  assert.equal(result.conflictCount,0);
  assert.equal(result.groups['2026-10'].history,2);
  assert.equal(result.groups['2026-11'].mirror,1);
  assert.equal(result.historicalOpening,1000);
  assert.equal(result.historicalClosing,710);
  assert.equal(result.sourceAuthoritative,false);
  assert.equal(result.eligibleForUnattendedWrites,false);
});
test('new payment appears as pending, never declared auto-synced',()=>{
  const result=auditSourceAgainstTestLedger({snapshot:snapshot(),historical:historic,
    historyFormulas:formula,mirror:[HEADER]});
  assert.equal(result.status,'pending-mirror');
  assert.equal(result.pendingCount,1);
  assert.equal(result.eligibleForUnattendedWrites,false);
});
test('does not hide missing historical transactions behind matching totals',()=>{
  const src=snapshot();src.months[0].rows.splice(1,1);
  const result=auditSourceAgainstTestLedger({snapshot:src,historical:historic,
    historyFormulas:formula,mirror:sheet()});
  assert.equal(result.status,'blocked');
  assert.equal(result.unmatchedHistory,1);
  assert.ok(result.conflictKinds.includes('history-missing-from-source'));
});
test('edited mirror amount without matching signed source hash blocks audit',()=>{
  const tampered=sheet();tampered[1][13]=999999;
  assert.throws(()=>auditSourceAgainstTestLedger({snapshot:snapshot(),historical:historic,
    historyFormulas:formula,mirror:tampered}),/hash/);
});
test('orphan in existing TEST mirror blocks automatic deletion',()=>{
  const additional=makeSource(financial('2026-11-05','Vendor D','OTHER','IPC005',500,0),'expense:missing');
  const result=auditSourceAgainstTestLedger({snapshot:snapshot(),historical:historic,
    historyFormulas:formula,mirror:[...sheet(),pack(additional)]});
  assert.equal(result.status,'blocked');
  assert.equal(result.orphanCount,1);
  assert.ok(result.conflictKinds.includes('mirror-orphan'));
});
test('history running balance mismatch or broken formula cannot pass',()=>{
  const incorrect=historic.map(row=>row.slice());incorrect[2][13]=800;
  assert.throws(()=>verifyHistory(incorrect,formula),/balance mismatch/);
  const wrongFormula=formula.map(row=>row.slice());wrongFormula[3][0]='=N1+G4';
  assert.throws(()=>verifyHistory(historic,wrongFormula),/does not reference/);
  const badDate=historic.map(row=>row.slice());badDate[3][0]='2026-02-30';
  assert.throws(()=>verifyHistory(badDate,formula),/Impossible date/);
});
test('Sheets inspector uses only GET, canonical sheet ID and verified formula read',async()=>{
  const requests=[];
  const meta={spreadsheetId:TEST_ID,properties:{title:'PHU HUNG TEST'},
    sheets:[{properties:{title:'PHU HUNG',sheetId:0}},
      {properties:{title:'DATA_CASHCONTROL',sheetId:1}}]};
  const inspector=createTestSheetsInspector({request:async ({url})=>{
    requests.push(url);
    if(url.includes('?fields='))return {data:meta};
    if(url.includes('FORMULA'))return {data:{values:formula}};
    if(url.includes('DATA_CASHCONTROL'))return {data:{values:sheet()}};
    return {data:{values:historic}};
  }});
  const result=await auditWithInspector({snapshot:snapshot(),inspector});
  assert.equal(result.status,'matched-read-only');
  assert.equal(requests.length,6,'three read-only requests, each preceded by metadata validation');
  assert.ok(requests.every(url=>url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/'+TEST_ID)));
});
