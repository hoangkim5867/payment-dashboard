import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessProjectSourceCoverage as assess} from '../site/assets/js/cash-sync-project-source-coverage.mjs';
const rows=[{id:'p1',project:'FOXCONN',processPaymentDate:'2026-11-06'},
 {id:'p2',project:'FOXCONN',processPaymentDate:''}];
test('exact project COUNT matches cached documents but never grants Google writes',()=>{
 const r=assess({project:'FOXCONN',serverCount:2,rows,hasFullProjectCache:true,
  cashCloudReady:true,legacySeedReady:true});
 assert.equal(r.state,'CANONICAL_COUNT_MATCH_ONLY');
 assert.equal(r.cachedCount,2);
 assert.equal(r.paymentPaid,1);
 assert.equal(r.paymentPending,1);
 assert.deepEqual(r.actualMonthsInCache,['2026-11']);
 assert.equal(r.canCompareGoogle,true);
 assert.equal(r.paymentBusinessComplete,false);
 assert.equal(r.googleHistoryCompared,false);
 assert.equal(r.canWrite,false);
 assert.equal(r.firestoreDocumentReads,0);
 assert.equal(r.googleReads,0);
 assert.equal(r.googleWrites,0);
 assert.equal(JSON.stringify(r).includes('p1'),false);
});
test('count mismatch never infers missing is zero or permits Google comparison',()=>{
 for(const serverCount of [1,3,101]){
  const r=assess({project:'FOXCONN',serverCount,rows,
   hasFullProjectCache:true,cashCloudReady:true,legacySeedReady:true});
  assert.equal(r.state,'PROJECT_COUNT_MISMATCH');
  assert.equal(r.canCompareGoogle,false);assert.equal(r.canWrite,false);
 }
});
test('no full-project cache remains NOT_LOADED even if month data or server count is zero',()=>{
 for(const count of [0,101]){
  const r=assess({project:'FOXCONN',serverCount:count,rows,
   cashCloudReady:true,legacySeedReady:true});
  assert.equal(r.state,'NOT_LOADED');assert.equal(r.cachedCount,null);
  assert.equal(r.canCompareGoogle,false);
 }
});
test('legacy aliases and cross-project or deleted records require review',()=>{
 const a=assess({project:'FOXCONN',serverCount:2,rows,
  hasFullProjectCache:true,cashCloudReady:true,legacySeedReady:true,
  aliasProjects:['FOXCONN','FOXCONN 1',' FOXCONN 1 ']});
 assert.equal(a.aliasProjectsSeen,1);
 assert.equal(a.state,'PROJECT_ALIAS_REVIEW');
 const b=assess({project:'FOXCONN',serverCount:2,rows:[
   {id:'p1',project:'OTHER'},{id:'p2',project:'FOXCONN'}],
  hasFullProjectCache:true,cashCloudReady:true,legacySeedReady:true});
 assert.equal(b.wrongProject,1);
 assert.equal(b.state,'PROJECT_ALIAS_REVIEW');
 const c=assess({project:'FOXCONN',serverCount:2,rows:[
   {...rows[0],deleted:true},{...rows[0]}],
  hasFullProjectCache:true,cashCloudReady:true,legacySeedReady:true});
 assert.equal(c.duplicateIds,1);assert.equal(c.deleted,1);
 assert.equal(c.state,'SOURCE_ID_REVIEW');assert.equal(c.canWrite,false);
});
test('snapshot not ready and invalid counts fail closed',()=>{
 const a=assess({project:'FOXCONN',serverCount:2,rows,
  hasFullProjectCache:true,cashCloudReady:false,legacySeedReady:true});
 assert.equal(a.state,'CASH_CLOUD_NOT_READY');
 assert.equal(a.canCompareGoogle,false);
 assert.throws(()=>assess({project:'FOXCONN',serverCount:NaN}),/INVALID_PROJECT_COUNT/);
 assert.throws(()=>assess({project:'FOXCONN',serverCount:-1}),/INVALID_PROJECT_COUNT/);
 assert.throws(()=>assess({project:'',serverCount:0}),/INVALID_PROJECT/);
});
