import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildBatchReadiness} from '../site/assets/js/cash-sync-batch-readiness.mjs';
const row=(id,over={})=>({
 date:'2026-11-12',company:'Vendor',contractNo:'LAB-1',ipc:'IPC01',
 _syncIds:[id],income:0,subcontract:0,material:50,otherDirect:0,
 indirect:0,financial:0,otherPayable:0,...over
});
test('35-project overview scans only active projects and does not authorize writes',()=>{
 const projects=['FOXCONN','PHU HUNG','ELYSIAN',...Array.from({length:32},(_,i)=>'P'+i)];
 const r=buildBatchReadiness({month:'2026-11',projects,
  links:{FOXCONN:true,ELYSIAN:true},
  rowsByProject:{FOXCONN:[row('expense:a',{material:0,importTaxVat:5})],
   ELYSIAN:[row('expense:e')]}});
 assert.equal(r.projects,35);
 assert.equal(r.activeProjects,2);
 assert.equal(r.inactiveProjects,33);
 assert.equal(r.candidateProjects,2);
 assert.equal(r.activeRows,2);
 assert.equal(r.firestoreReads,0);
 assert.equal(r.googleReads,0);
 assert.equal(r.googleWrites,0);
 assert.equal(r.canWrite,false);
 assert.ok(r.rows.every(x=>x.canWrite===false&&x.sourceComplete===false&&x.googleCompared===false));
});
test('link-less project, duplicate IDs and missing source IDs are blocked separately',()=>{
 const r=buildBatchReadiness({month:'2026-11',projects:['FOXCONN','ELYSIAN','SSIS'],
  links:{ELYSIAN:true,FOXCONN:true},
  rowsByProject:{
   FOXCONN:[row('expense:tax',{importTaxVat:undefined})],
   ELYSIAN:[row('expense:e'),row('expense:e'),row('',{_syncIds:[]})],
   SSIS:[row('expense:s')]}});
 assert.equal(r.missingLinkProjects,1);
 assert.equal(r.sourceReviewProjects,2);
 assert.equal(r.candidateProjects,0);
 assert.equal(r.rows.find(x=>x.project==='ELYSIAN').duplicateSourceIds,1);
 assert.equal(r.rows.find(x=>x.project==='ELYSIAN').missingSourceIds,1);
 assert.equal(r.rows.find(x=>x.project==='FOXCONN').unknownImportTax,1);
 assert.equal(r.rows.find(x=>x.project==='SSIS').status,'MISSING_GOOGLE_LINK');
});
test('signed cash transfer stays a valid signed receipt, not a missing ID',()=>{
 const r=buildBatchReadiness({month:'2026-11',projects:['A'],links:{A:true},
  rowsByProject:{A:[row('transfer:one:out',{income:-100,material:0})]}});
 assert.equal(r.rows[0].transferRows,1);
 assert.equal(r.rows[0].income,-100);
 assert.equal(r.rows[0].transferCounterpartsUnverified,1);
 assert.equal(r.rows[0].status,'SOURCE_REVIEW_REQUIRED');
 assert.equal(r.candidateProjects,0);
 assert.equal(r.canWrite,false);
});
test('invalid or duplicated projects and dates fail safe',()=>{
 assert.throws(()=>buildBatchReadiness({month:'2026-09',projects:['A']}),/INVALID_SYNC_MONTH/);
 assert.throws(()=>buildBatchReadiness({month:'2026-11',projects:['A','A']}),/INVALID_OR_DUPLICATE_PROJECT/);
 const r=buildBatchReadiness({month:'2026-11',projects:['A'],links:{A:true},
  rowsByProject:{A:[row('id',{date:'garbage',material:'30'})]}});
 assert.equal(r.rows[0].invalidDates,1);
 assert.equal(r.rows[0].invalidAmounts,1);
 assert.equal(r.rows[0].status,'SOURCE_REVIEW_REQUIRED');
});
test('never infer a 0-transaction project is fully loaded or synced',()=>{
 const r=buildBatchReadiness({month:'2026-11',projects:['A'],links:{A:true}});
 assert.equal(r.activeProjects,0);
 assert.equal(r.rows[0].status,'NO_ACTIVITY_IN_MEMORY');
 assert.equal(r.rows[0].sourceComplete,false);
 assert.equal(r.rows[0].canWrite,false);
});

test('catalog-wide missing links are reported even when no transaction source is loaded',()=>{
 const r=buildBatchReadiness({month:'2026-11',
  projects:['A','B','C','D'],links:{A:true,C:true},rowsByProject:{}});
 assert.equal(r.projects,4);
 assert.equal(r.activeProjects,0);
 assert.equal(r.linkedProjects,2);
 assert.equal(r.unlinkedProjects,2);
 assert.equal(r.missingLinkProjects,0);
 assert.equal(r.absentRowsDoNotProveNoActivity,true);
 assert.equal(r.canWrite,false);
 assert.equal(r.firestoreReads,0);
 assert.equal(r.googleWrites,0);
});
