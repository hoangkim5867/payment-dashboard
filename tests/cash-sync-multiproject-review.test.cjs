'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {reviewMultiProjectDraft}=require('../server/cash-sync-multiproject-review.cjs');
const sheet=id=>'https://docs.google.com/spreadsheets/d/'+id+'/edit?gid=42#gid=42';
const draft={schema:'CASH_SYNC_PROJECT_LINK_DRAFT_V1',projects:{
  EATON:sheet('eaton_fake'),ELYSIAN:sheet('elysian_fake'),
  'PHU HUNG':sheet('phu_hung_fake')}};
const catalog=['EATON','ELYSIAN','PHU HUNG'];
const source=[{project:'EATON',id:'t1',date:'2026-10-01',
  amounts:[100,20,0,0,0,0,0]}];
const history=[['DATE'],['2026-10-01','company','c','d','i','type',
  100,20,0,0,0,0,0,1080]];
const meta=id=>({spreadsheetId:id,
  sheets:[{properties:{sheetId:42,title:'Ledger',hidden:false}}]});
test('batch report is read-only and never approves a fully matching ledger',()=>{
 const r=reviewMultiProjectDraft(draft,catalog,{EATON:{
   metadata:meta('eaton_fake'),historicalRows:history,
   sourceRows:source,confirmedOpeningBalance:1000}});
 assert.equal(r.linkedCount,3);assert.equal(r.canWrite,false);
 assert.equal(r.statuses['offline-matched-needs-source-completeness'],1);
 assert.equal(r.statuses['awaiting-readonly-snapshot'],1);
 assert.equal(r.statuses['separate-existing-sync'],1);
 const e=r.projects.find(x=>x.project==='EATON');
 assert.equal(e.historicalRowsVerified,true);
 assert.equal(e.closingBalanceVerified,true);
 assert.equal(e.sourceCompletenessVerified,false);
 assert.equal(e.canWrite,false);
 assert.ok(!JSON.stringify(r).includes('eaton_fake'));
});
test('wrong Google spreadsheet ID results in blocked status',()=>{
 const r=reviewMultiProjectDraft(draft,catalog,{
   EATON:{metadata:meta('wrong'),historicalRows:history,sourceRows:source}});
 assert.equal(r.projects.find(x=>x.project==='EATON').status,'blocked');
 assert.equal(r.canWrite,false);
});
test('missing historical or source snapshot never passes',()=>{
 const r=reviewMultiProjectDraft(draft,catalog,{EATON:{metadata:meta('eaton_fake')}});
 assert.equal(r.projects[0].status,'awaiting-ledger-snapshots');
 assert.equal(r.projects[0].canWrite,false);
});
test('blank Google tab still requires manual reconciliation',()=>{
 const r=reviewMultiProjectDraft(draft,catalog,{EATON:{
   metadata:meta('eaton_fake'),historicalRows:[],sourceRows:source,
   confirmedOpeningBalance:0}});
 assert.equal(r.projects[0].status,'requires-manual-reconciliation');
 assert.equal(r.projects[0].canWrite,false);
});
test('rejects snapshots for unknown projects, including extra fields',()=>{
 assert.throws(()=>reviewMultiProjectDraft(draft,catalog,{
   UNLISTED:{metadata:meta('x')}}),/unconfigured/);
});
test('historical balance differences are visible but never treated as approval',()=>{
 const bad=history.map(row=>row.slice());bad[1][13]=1081;
 const r=reviewMultiProjectDraft(draft,catalog,{EATON:{
   metadata:meta('eaton_fake'),historicalRows:bad,
   sourceRows:source,confirmedOpeningBalance:1000}});
 assert.equal(r.projects[0].status,'requires-manual-reconciliation');
 assert.equal(r.projects[0].canWrite,false);
});

test('multi-project review exposes backward dates without ever approving the project',()=>{
 const reversed=[
  ['DATE'],
  ['2026-10-02','company','c','d','i','type',50,30,0,0,0,0,0,1020],
  ['2026-10-01','company','c','d','i','type',100,20,0,0,0,0,0,1100]
 ];
 const rows=[...source,{project:'EATON',id:'t2',date:'2026-10-02',
   amounts:[50,30,0,0,0,0,0]}];
 const r=reviewMultiProjectDraft(draft,catalog,{EATON:{
  metadata:meta('eaton_fake'),historicalRows:reversed,sourceRows:rows,
  confirmedOpeningBalance:1000}});
 const item=r.projects.find(x=>x.project==='EATON');
 assert.equal(item.status,'requires-manual-reconciliation');
 assert.equal(item.dateOrderRegressions,1);
 assert.equal(item.dateOrderExamples.length,1);
 assert.equal(item.continuityErrorCount,0);
 assert.equal(item.historicalRowsVerified,false);
 assert.equal(item.closingBalanceVerified,false);
 assert.equal(item.canWrite,false);
});

test('one-pass overview includes all catalog projects without links or write approval',()=>{
 const extended=[...catalog,'FOXCONN','OCEAN LINK','SSIS'];
 const r=reviewMultiProjectDraft(draft,extended,{});
 assert.equal(r.catalogCount,6);
 assert.equal(r.linkedCount,3);
 assert.equal(r.unlinkedCount,3);
 assert.deepEqual(r.unlinkedProjects,['FOXCONN','OCEAN LINK','SSIS']);
 assert.equal(r.statuses['missing-link'],3);
 assert.equal(r.canWrite,false);
 assert.equal(r.reviewedCount,3);
 assert.ok(!JSON.stringify(r).includes('phu_hung_fake'));
});
test('empty link draft still reports all active projects as pending',()=>{
 const empty={schema:'CASH_SYNC_PROJECT_LINK_DRAFT_V1',projects:{}};
 const r=reviewMultiProjectDraft(empty,catalog,{});
 assert.equal(r.catalogCount,3);
 assert.equal(r.linkedCount,0);
 assert.equal(r.unlinkedCount,3);
 assert.equal(r.statuses['missing-link'],3);
 assert.equal(r.canWrite,false);
});
