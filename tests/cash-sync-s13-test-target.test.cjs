'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {canWriteS13Test,testGateChecks,ORIGINAL,IDS}=require('../server/cash-sync-s13-test-target.cjs');
const TEST='testcopyS13202610ABCDEF0123456789';
const baseEnv={
 VERCEL_ENV:'preview',CASH_SYNC_FIREBASE_PROJECT_ID:'cscecmep-payment',
 CASH_SYNC_S13_TEST_WRITES:'YES',CASH_SYNC_S13_TEST_FILE_ID:TEST,
 CASH_SYNC_S13_TEST_HISTORY_GID:'1543850344'
};
const row=(id,values)=>({id,project:'S13-2',month:'2026-10',values});
const payload=()=>({project:'S13-2',month:'2026-10',spreadsheetId:TEST,
 historySheetId:1543850344,expectedMonthClosing:-72663856,openingBalance:null,
 source:[
 row(IDS[0],['2026-10-02','中方员工工资','','2026年08月中方员工工资','','职工薪酬',0,0,0,0,81463753,0,0]),
 row(IDS[1],['2026-10-02','伙食费','','2026年08月伙食费','','职工薪酬',0,0,0,0,3859500,0,0]),
 row(IDS[2],['2026-10-20','','','2026年第3季度个人所得税','','职工薪酬',0,0,0,0,52923736,0,0])
 ]});
test('S13-2 TEST gate accepts exactly three verified payroll sources and TEST destination',()=>{
 assert.equal(canWriteS13Test(baseEnv,payload()),true);
});
test('S13-2 TEST route never authorizes a production or original ledger write',()=>{
 for(const env of [
 {...baseEnv,VERCEL_ENV:'production'},
 {...baseEnv,VERCEL_ENV:'development'},
 {...baseEnv,CASH_SYNC_S13_TEST_WRITES:'NO'},
 {...baseEnv,CASH_SYNC_S13_TEST_FILE_ID:ORIGINAL},
 {...baseEnv,CASH_SYNC_S13_TEST_FILE_ID:''},
 {...baseEnv,CASH_SYNC_S13_TEST_HISTORY_GID:'other'}
 ])assert.equal(canWriteS13Test(env,payload()),false);
 assert.equal(canWriteS13Test({...baseEnv,CASH_SYNC_MULTI_PRODUCTION_WRITES:'YES'},{
  ...payload(),spreadsheetId:ORIGINAL}),false);
});
test('S13-2 TEST gate fails closed for wrong period, project, amount, ID, source count and closing',()=>{
 const scenarios=[
 p=>{p.month='2026-11'},
 p=>{p.project='FOXCONN'},
 p=>{p.spreadsheetId=ORIGINAL},
 p=>{p.historySheetId=0},
 p=>{p.expectedMonthClosing=-72663855},
 p=>{p.openingBalance=65583133},
 p=>{p.source[0].values[10]=81463752},
 p=>{p.source[2].id='excel-row:8'},
 p=>{p.source[2].id='legacy_salary_672'},
 p=>{p.source[1].values[0]='2026-10-03'},
 p=>{p.source[1].values[3]='Wrong payroll memo'},
 p=>{p.source[1].values[10]=-3859500},
 p=>{p.source[1].values[6]=3859500},
 p=>{p.source.pop()},
 p=>{p.source.push(p.source[0])}
 ];
 for(const change of scenarios){const p=payload();change(p);
  assert.equal(canWriteS13Test(baseEnv,p),false,JSON.stringify(p));}
});

test('staging Admin verification is independent of legacy production Firebase config',()=>{
 assert.equal(canWriteS13Test({...baseEnv,CASH_SYNC_FIREBASE_PROJECT_ID:'cash-control-staging'},payload()),true);
 assert.deepEqual(testGateChecks({...baseEnv,CASH_SYNC_FIREBASE_PROJECT_ID:'cash-control-staging'},payload()),[]);
});
test('safe diagnostics identify missing TEST flags without leaking secrets',()=>{
 const denied=testGateChecks({...baseEnv,CASH_SYNC_S13_TEST_WRITES:'NO'},payload());
 assert.deepEqual(denied,['TEST_FLAG_DISABLED']);
 assert.deepEqual(testGateChecks({...baseEnv,CASH_SYNC_S13_TEST_HISTORY_GID:'not-a-gid'},payload()),['TEST_GID_NOT_SET']);
 assert.deepEqual(testGateChecks({...baseEnv,CASH_SYNC_S13_TEST_FILE_ID:'anotherValidGoogleSpreadsheetId_123'},payload()),['TEST_FILE_MISMATCH']);
});
