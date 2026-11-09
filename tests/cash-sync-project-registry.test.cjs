'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildCatalog,projectFor,canActivate}=
  require('../server/cash-sync-project-registry.cjs');
const names=['大福莲花市政','Krista','FelizenVista','HAPPY SGSU','HERITAGE',
  'M5M6','理文造纸厂','SUNWAH','SSR','SA','D1 mension','Krisvue','S6-1',
  'C13B','CHAOMED','DELASOL','CAPITAL PLACE','CLUB HOUSE','大福5区',
  '大幅莲花8区','中健厂房','289','SSIS','C17-2','S13-2','EATON',
  'ELYSIAN','ADVANCE','H14-3','红鹤别墅1.1区','PHU HUNG','OCEAN LINK',
  'CN8-2','CR5-1B','FOXCONN'];
test('dynamic registry includes full Cash Control catalog without eight-project cap',()=>{
  const items=buildCatalog([...names,' elysian ']);
  assert.equal(items.length,names.length);
  assert.ok(items.some(p=>p.key==='ELYSIAN'));
  assert.ok(items.some(p=>p.key==='红鹤别墅1.1区'));
  assert.equal(projectFor(names,'  elysian ')?.key,'ELYSIAN');
  assert.equal(projectFor(names,'UNKNOWN'),null);
});
test('a future project appears immediately without changing code',()=>{
  const dynamic=[...names,'NEW PROJECT DEC 2026'];
  assert.equal(projectFor(dynamic,'new project dec 2026').status,'pending-audit');
  assert.equal(projectFor(names,'NEW PROJECT DEC 2026'),null);
});
test('existing PHU HUNG is protected and new projects require complete proof',()=>{
  const proof={matchingProject:'ELYSIAN',readOnlyAuditPassed:true,
    historicalRowsVerified:true,closingBalanceVerified:true,
    explicitAdminApproval:true,destinationSpreadsheetVerified:true};
  assert.equal(canActivate(names,'PHU HUNG',{...proof,matchingProject:'PHU HUNG'}),false);
  assert.equal(canActivate(names,'ELYSIAN',proof),true);
  for(const field of ['readOnlyAuditPassed','historicalRowsVerified',
    'closingBalanceVerified','explicitAdminApproval','destinationSpreadsheetVerified']){
    assert.equal(canActivate(names,'ELYSIAN',{...proof,[field]:false}),false);
  }
  assert.equal(canActivate(names,'EATON',proof),false);
});
