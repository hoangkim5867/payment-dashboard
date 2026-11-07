'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runReadProbe,validateCaller}=require('../functions/cash-sync/service-probe.cjs');
const {HEADER}=require('../functions/cash-sync/verified-mirror.cjs');
const {hashValues}=require('../functions/cash-sync/three-way.cjs');
const staging={GCLOUD_PROJECT:'cash-control-staging',
  CASH_SHEETS_TEST_READ_PROBE_ENABLED:'YES',
  CASH_SHEETS_ADMIN_UID:'staging_owner_uid_001'};
const auth={uid:'staging_owner_uid_001'};
function fixture({badBalance=false,noMirror=false}={}){
  const rows=[
    ['Ngày','Đơn vị'],
    ['2026-11-05','Vendor','A','','IPC001','支出',0,0,0,0,100,0,0,900],
    ['2026-11-06','Vendor','A','','IPC002','支出',0,0,0,0,200,0,0,badBalance?777:700]
  ];
  const formulas=[[],['=1000+G2-SUM(H2:M2)'],['=N2+G3-SUM(H3:M3)']];
  const values=['2026-11-06','Vendor','B','','IPC003','支出',0,0,0,0,321000,0,0];
  const mirror=[HEADER,['PHU HUNG:expense:001','PHU HUNG','2026-11',
    ...values,'',hashValues(values),'synced']];
  const methods=[];
  return {
    inspectorFactory:async()=>({
      metadata:async()=>{methods.push('metadata');return {spreadsheetId:'TEST'}},
      read:async(tab)=>{
        methods.push('read:'+tab);
        if(tab==='PHU HUNG')return rows;
        if(noMirror)throw Object.assign(Error('not found'),{status:404});
        return mirror;
      },
      readFormulas:async(tab)=>{
        methods.push('formulas:'+tab);return formulas;
      }
    }),
    methods
  };
}
test('TEST-only probe is disabled without a staging project, explicit gate and owner token',async()=>{
  for(const env of [
    {...staging,GCLOUD_PROJECT:'cscecmep-payment'},
    {...staging,CASH_SHEETS_TEST_READ_PROBE_ENABLED:'NO'},
    {...staging,CASH_SHEETS_ADMIN_UID:''}
  ])assert.throws(()=>validateCaller({env,auth}));
  assert.throws(()=>validateCaller({env:staging,auth:{uid:'staff'}}),/authorized/);
  const f=fixture();
  await assert.rejects(runReadProbe({
    env:{...staging,GCLOUD_PROJECT:'cscecmep-payment'},
    auth,inspectorFactory:f.inspectorFactory
  }),/disabled/);
  assert.equal(f.methods.length,0,'no Google calls without an authorized gate');
});
test('authorized probe reads only historical formulas and TEST mirror and never writes',async()=>{
  const f=fixture();
  const result=await runReadProbe({env:staging,auth,inspectorFactory:f.inspectorFactory});
  assert.deepEqual(result,{
    status:'read-only-verified',historicalCount:2,mirrorCount:1,
    historicalBalanceVerified:true,sourceAuthoritative:false,
    autoWriteEnabled:false,additionalFirestoreQueries:0
  });
  assert.deepEqual(f.methods,['metadata','read:PHU HUNG','formulas:PHU HUNG','read:DATA_CASHCONTROL']);
  assert.equal(JSON.stringify(result).includes('Vendor'),false,
    'no account details/financial rows may be returned');
});
test('Google permission denied returns a sanitized blocker',async()=>{
  const result=await runReadProbe({env:staging,auth,
    inspectorFactory:async()=>{throw Object.assign(Error('google secret token contents'),{
      response:{status:403}
    })}});
  assert.equal(result.status,'blocked');
  assert.equal(result.reason,'GOOGLE_IDENTITY_PERMISSION');
  assert.equal(JSON.stringify(result).includes('secret'),false);
});
test('untrusted historical running balance fails closed and leaves write disabled',async()=>{
  const f=fixture({badBalance:true});
  const result=await runReadProbe({env:staging,auth,inspectorFactory:f.inspectorFactory});
  assert.equal(result.status,'blocked');
  assert.equal(result.autoWriteEnabled,false);
});
test('missing TEST mirror cannot falsely claim successful synchronization',async()=>{
  const f=fixture({noMirror:true});
  const result=await runReadProbe({env:staging,auth,inspectorFactory:f.inspectorFactory});
  assert.deepEqual(result,{status:'blocked',reason:'MIRROR_TAB_MISSING',
    autoWriteEnabled:false});
});
