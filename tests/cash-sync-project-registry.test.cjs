'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {PROJECTS,projectFor,canActivate}=require('../server/cash-sync-project-registry.cjs');
test('multi-project registry contains only explicit unique supported projects',()=>{
 assert.equal(PROJECTS.length,8);
 assert.equal(new Set(PROJECTS.map(p=>p.key)).size,8);
 assert.equal(projectFor('  elysian ')?.key,'ELYSIAN');
 assert.equal(projectFor('EATON P1')?.key,'EATON P1');
 assert.equal(projectFor('UNKNOWN'),null);
 assert.equal(projectFor('__proto__'),null);
});
test('existing PHU HUNG never auto-migrates through new registry',()=>{
 assert.equal(canActivate('PHU HUNG',{
  matchingProject:'PHU HUNG',readOnlyAuditPassed:true,
  historicalRowsVerified:true,closingBalanceVerified:true,explicitAdminApproval:true
 }),false);
});
test('all new projects start blocked until independent audit and Admin approval',()=>{
 const proof={matchingProject:'ELYSIAN',readOnlyAuditPassed:true,
  historicalRowsVerified:true,closingBalanceVerified:true,explicitAdminApproval:true};
 assert.equal(canActivate('ELYSIAN',proof),true);
 for(const key of ['readOnlyAuditPassed','historicalRowsVerified',
  'closingBalanceVerified','explicitAdminApproval']){
  assert.equal(canActivate('ELYSIAN',{...proof,[key]:false}),false);
 }
 assert.equal(canActivate('EATON P1',proof),false);
 assert.equal(canActivate('ELYSIAN',{...proof,matchingProject:'FOXCONN'}),false);
});
