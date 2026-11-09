'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {verifyDestinationMetadata,auditSourceSnapshot}=
  require('../server/cash-sync-multiproject-preflight.cjs');
const entry={project:'EATON',spreadsheetId:'eaton_sheet',gid:'1214250390',
  status:'pending-readonly-audit'};
const metadata={spreadsheetId:'eaton_sheet',sheets:[
  {properties:{sheetId:1214250390,title:'Original cash ledger',hidden:false}},
  {properties:{sheetId:90,title:'Other tab',hidden:false}}]};
test('verifies exact destination file and selected gid but does not enable writes',()=>{
  const x=verifyDestinationMetadata(entry,metadata);
  assert.equal(x.selectedGid,'1214250390');
  assert.equal(x.selectedTabTitle,'Original cash ledger');
  assert.equal(x.metadataVerified,true);
  assert.equal(x.historicalRowsVerified,false);
  assert.equal(x.closingBalanceVerified,false);
  assert.equal(x.canWrite,false);
});
test('refuses missing gid, missing tab, wrong file and hidden tab',()=>{
  for(const patch of [{gid:null},{gid:'485113919'}])
    assert.throws(()=>verifyDestinationMetadata({...entry,...patch},metadata));
  assert.throws(()=>verifyDestinationMetadata(entry,{...metadata,spreadsheetId:'other'}));
  assert.throws(()=>verifyDestinationMetadata(entry,{...metadata,
    sheets:[{properties:{sheetId:1214250390,title:'Hidden',hidden:true}}]}));
});
test('PHU HUNG remains protected, including when caller tampers status',()=>{
  assert.throws(()=>verifyDestinationMetadata({...entry,project:'PHU HUNG'},metadata));
  assert.throws(()=>verifyDestinationMetadata({...entry,status:'existing-sync-protected'},metadata));
});
test('read-only Cash Control source screening rejects duplicates, cross-project rows',()=>{
  const row={project:'EATON',id:'tx1',date:'2026-11-09',amounts:[100,20,0,0,0,0,0]};
  const x=auditSourceSnapshot('EATON',[row]);
  assert.equal(x.netChange,80);
  assert.equal(x.canWrite,false);
  assert.equal(x.closingBalanceVerified,false);
  assert.throws(()=>auditSourceSnapshot('EATON',[row,row]));
  assert.throws(()=>auditSourceSnapshot('EATON',[{...row,project:'ELYSIAN'}]));
  assert.throws(()=>auditSourceSnapshot('EATON',[{...row,amounts:[100,-1,0,0,0,0,0]}]));
});
test('empty snapshot can be screened but never marked as reconciled',()=>{
  const x=auditSourceSnapshot('EATON',[]);
  assert.equal(x.recordCount,0);
  assert.equal(x.historicalRowsVerified,false);
  assert.equal(x.canWrite,false);
});
