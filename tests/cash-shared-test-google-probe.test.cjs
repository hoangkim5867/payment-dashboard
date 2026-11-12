'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../api/cash-shared-test-google-probe.js');
const {HEADER}=require('../site/assets/js/cash-shared-google-test-transport.js');
const TEST_ID='E'.repeat(35);
const env={
  VERCEL_ENV:'preview',
  CASH_SYNC_FIREBASE_PROJECT_ID:'cash-control-staging',
  CASH_SYNC_ADMIN_UID:'test_admin_uid',
  CASH_SYNC_MULTI_TEST_TARGETS_JSON:JSON.stringify([{
    project:'ELYSIAN',spreadsheetId:TEST_ID,title:'ELYSIAN GOOGLE TEST COPY',
    tab:'DATA_CASHCONTROL_TEST_ELYSIAN'
  }])
};
const token='x'.repeat(128);
const jwt='y'.repeat(160);
const verifyAdmin=async(got,config)=>{
  assert.equal(got,jwt);assert.equal(config.uid,'test_admin_uid');
};
function fixture({wrongTitle=false,wrongHeader=false,status=200}={}){
  const log=[];
  const fetcher=async(url,options)=>{
    log.push({url,options});
    if(status!==200)return {ok:false,status};
    if(url.includes('?fields=spreadsheetId')){
      return {ok:true,json:async()=>({
        spreadsheetId:TEST_ID,
        properties:{title:wrongTitle?'ELYSIAN LIVE':'ELYSIAN GOOGLE TEST COPY'},
        sheets:[{properties:{title:'DATA_CASHCONTROL_TEST_ELYSIAN',
          sheetId:42,hidden:false}}]
      })};
    }
    if(url.includes('/values/'))return {ok:true,json:async()=>({
      values:[wrongHeader?['date','company']:HEADER]
    })};
    throw Error('Unexpected URL '+url);
  };
  return {log,fetcher};
}
const probe=(f,over={})=>handler._internals.probe({
  env,project:'ELYSIAN',firebaseJwt:jwt,googleToken:token,
  verifyAdmin,fetcher:f.fetcher,...over
});
function res(){
  return {headers:{},code:200,body:null,
    setHeader(key,value){this.headers[key]=value;return this},
    status(code){this.code=code;return this},
    json(body){this.body=body;return this}};
}
test('Authenticated real Google TEST preflight reads only metadata and first-row header',async()=>{
  const f=fixture();
  const result=await probe(f);
  assert.equal(result.fileVerified,true);
  assert.equal(result.canWrite,false);
  assert.equal(result.googleReads,2);
  assert.equal(f.log.length,2);
  assert.equal(f.log.filter(x=>x.options.method!=='GET').length,0);
  assert.ok(f.log.every(x=>x.url.includes(TEST_ID)));
  assert.ok(f.log.every(x=>x.options.headers.Authorization==='Bearer '+token));
  assert.ok(f.log[1].url.includes('A1%3AO1'));
});
test('Wrong file title or Google header always rejects; no POST writes',async()=>{
  for(const options of [{wrongTitle:true},{wrongHeader:true},{status:403}]){
    const f=fixture(options);
    await assert.rejects(probe(f),/TEST_SHEET_IDENTITY_MISMATCH|TEST_HEADER_NOT_READY|GOOGLE_TEST_READ_DENIED_403/);
    assert.ok(f.log.every(x=>x.options.method==='GET'));
  }
});
test('Production, unknown project, absent admin token are blocked before Google',async()=>{
  const f=fixture();
  await assert.rejects(probe(f,{env:{...env,VERCEL_ENV:'production'}}),/PREVIEW_ONLY/);
  await assert.rejects(probe(f,{project:'PHU HUNG'}),/PROJECT_NOT_ALLOWLISTED/);
  await assert.rejects(probe(f,{googleToken:''}),/GOOGLE_TOKEN_REQUIRED/);
  assert.equal(f.log.length,0);
});
test('Endpoint rejects cross-origin, malformed and unauthorized requests safely',async()=>{
  const r=res();
  await handler({method:'GET',headers:{}},r);
  assert.equal(r.code,405);
  const x=res();
  await handler({method:'POST',headers:{origin:'https://bad.example',
    host:'test.example'},body:{project:'ELYSIAN'}},x);
  assert.equal(x.code,403);
  const y=res();
  await handler({method:'POST',headers:{origin:'https://test.example',
    host:'test.example'},body:{project:'ELYSIAN',spreadsheetId:TEST_ID}},y);
  assert.equal(y.code,403);
  assert.doesNotMatch(JSON.stringify(y.body),new RegExp(TEST_ID));
});
