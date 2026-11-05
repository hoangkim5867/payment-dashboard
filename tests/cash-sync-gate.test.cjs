'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {generateKeyPairSync,sign}=require('node:crypto');
const {
  readConfig,verifyFirebaseAdminToken,validateWrite,TEST_SPREADSHEET_ID
}=require('../server/cash-sync-guard.cjs');
const server=require('../api/cash-sync-write.js');
const now=Math.floor(Date.now()/1000),project='cash-control-staging',uid='admin_test_uid_001';
const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...keys.publicKey.export({format:'jwk'}),alg:'RS256',use:'sig',kid:'cash-sync-test-key'};
const fetchJwks=async()=>({ok:true,json:async()=>({keys:[jwk]})});
const config={project,uid};
const token=(claims={},headerChanges={})=>{
  const header=Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:jwk.kid,...headerChanges})).toString('base64url');
  const body=Buffer.from(JSON.stringify({
    aud:project,iss:'https://securetoken.google.com/'+project,
    sub:uid,exp:now+3600,iat:now-30,auth_time:now-60,...claims
  })).toString('base64url');
  const signingInput=header+'.'+body;
  return signingInput+'.'+sign('RSA-SHA256',Buffer.from(signingInput),keys.privateKey).toString('base64url');
};
const addAuto={requests:[{addSheet:{properties:{title:'AUTO_PHU_HUNG_TEST_20261105T110000'}}}]};
const fail=(method,path,body,proj=project)=>assert.throws(()=>validateWrite(method,path,body,proj),
  /(?:Disallowed|Cannot|Only|Unsupported|Invalid|Historic)/);
test('configuration fails closed and production requires an explicit approval',()=>{
  assert.throws(()=>readConfig({}),/not configured/);
  assert.deepEqual(readConfig({CASH_SYNC_FIREBASE_PROJECT_ID:project,CASH_SYNC_ADMIN_UID:uid}),config);
  assert.throws(()=>readConfig({CASH_SYNC_FIREBASE_PROJECT_ID:project,
    CASH_SYNC_ADMIN_UID:uid,VERCEL_ENV:'production'}),/not been approved/);
  assert.deepEqual(readConfig({CASH_SYNC_FIREBASE_PROJECT_ID:project,
    CASH_SYNC_ADMIN_UID:uid,VERCEL_ENV:'production',CASH_SYNC_PRODUCTION_ENABLED:'YES'}),config);
});
test('valid signed Firebase Admin ID token is accepted',async()=>{
  assert.deepEqual(await verifyFirebaseAdminToken(token(),config,{fetcher:fetchJwks,now:now*1000}),
    {uid,project});
});
test('forged, expired, wrong project and different account tokens are rejected',async()=>{
  for(const change of [{sub:'attacker'},{aud:'other-project'},
    {iss:'https://securetoken.google.com/other-project'},
    {exp:now-5},{iat:now+1000},{auth_time:now+1000}]){
    await assert.rejects(verifyFirebaseAdminToken(token(change),config,{fetcher:fetchJwks,now:now*1000}));
  }
  const clean=token(),corrupt=clean.slice(0,-4)+'ABCD';
  await assert.rejects(verifyFirebaseAdminToken(corrupt,config,{fetcher:fetchJwks,now:now*1000}));
  await assert.rejects(verifyFirebaseAdminToken(token({}, {alg:'none'}),config,{fetcher:fetchJwks,now:now*1000}));
});
test('only fixed TEST tab names may be created',()=>{
  validateWrite('POST',':batchUpdate',addAuto,project);
  validateWrite('POST',':batchUpdate',{requests:[{addSheet:{properties:{title:'DATA_CASHCONTROL_DEMO'}}}]},project);
  fail('POST',':batchUpdate',{requests:[{addSheet:{properties:{title:'PHU HUNG'}}}]});
  fail('POST',':batchUpdate',{requests:[{deleteSheet:{sheetId:123}}]});
  fail('POST',':batchUpdate',{requests:[{addSheet:{properties:{title:'AUTO_PHU_HUNG_TEST_20261105T110000',
    index:0}}}]});
  fail('POST',':batchUpdate',{requests:[{addSheet:{properties:{title:'DATA_CASHCONTROL_DEMO'}}}]},'cscecmep-payment');
});
test('generated TEST ledger can only contain approved rows and balance formulas',()=>{
  const header=['date','company','contractNo','content','ipc','type','income',
    'subcontract','material','otherDirect','indirect','financial','otherPayable',
    'balance','origin','sourceId','openingBalance'];
  const row=['2026-11-05','VENDOR','','','IPC','支出',0,0,0,100,0,0,0,'',
    'CASH_CONTROL','PHU HUNG:abc',0];
  validateWrite('PUT',"/values/'AUTO_PHU_HUNG_TEST_20261105T110000'!A1:Q2?valueInputOption=RAW",
    {values:[header,row]},project);
  validateWrite('PUT',"/values/'AUTO_PHU_HUNG_TEST_20261105T110000'!N2:N3?valueInputOption=USER_ENTERED",
    {values:[['=$Q$2+G2-SUM(H2:M2)'],['=N2+G3-SUM(H3:M3)']]},project);
  fail('PUT',"/values/'AUTO_PHU_HUNG_TEST_20261105T110000'!N2:N2?valueInputOption=USER_ENTERED",
    {values:[['=IMPORTRANGE("private","A:Z")']]});
  fail('PUT',"/values/'PHU HUNG'!N2:N3?valueInputOption=USER_ENTERED",
    {values:[['=N1+1'],['=N2+1']]});
  fail('PUT',"/values/'AUTO_PHU_HUNG_TEST_20261105T110000'!A1:Q2?valueInputOption=USER_ENTERED",
    {values:[header,row]});
});
test('mirror writes are scoped to machine-managed columns in TEST only',()=>{
  const row=Array(19).fill('');
  validateWrite('POST',"/values/'DATA_CASHCONTROL'!A:S:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
    {values:[row]},project);
  validateWrite('POST','/values:batchUpdate',{valueInputOption:'RAW',
    data:[{range:"'DATA_CASHCONTROL'!A2:S2",values:[row]}]},project);
  fail('POST','/values:batchUpdate',{valueInputOption:'RAW',
    data:[{range:"'PHU HUNG'!A2:S2",values:[row]}]});
  fail('POST',"/values/'DATA_CASHCONTROL'!A:S:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS",
    {values:[row]});
  fail('PUT',"/values/'PHU HUNG'!A1:Q2?valueInputOption=RAW",{values:[Array(17).fill('')]});
});
function mockReq(method='POST',body=addAuto,opts={}){
  const req={method,headers:{host:'preview.example.test',
    origin:'https://preview.example.test','x-firebase-id-token':token(),
    authorization:'Bearer abcdefghijklmnopqrstuvwxyz',...opts.headers},
    body:{path:':batchUpdate',method:'POST',body}};
  const response={
    statusCode:200,headers:{},body:null,setHeader(name,value){this.headers[name]=value;return this},
    status(code){this.statusCode=code;return this},
    json(data){this.body=data;return this}
  };
  return {req,response};
}
test('server endpoint blocks unauthorized origins and missing config before touching Google',async()=>{
  const before={...process.env};
  const originalFetch=global.fetch;let calls=0;
  global.fetch=async()=>{calls++;throw Error('Should not reach Google')};
  try{
    delete process.env.CASH_SYNC_FIREBASE_PROJECT_ID;
    delete process.env.CASH_SYNC_ADMIN_UID;
    let {req,response}=mockReq();
    await server(req,response);
    assert.equal(response.statusCode,503);
    assert.equal(calls,0);
    req.headers.origin='https://evil.example.test';
    await server(req,response);
    assert.equal(response.statusCode,403);
    assert.equal(calls,0);
  }finally{
    global.fetch=originalFetch;
    for(const key of ['CASH_SYNC_FIREBASE_PROJECT_ID','CASH_SYNC_ADMIN_UID','VERCEL_ENV','CASH_SYNC_PRODUCTION_ENABLED']){
      if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];
    }
  }
});
test('server authorizes signed Admin then relays only permitted TEST write',async()=>{
  const before={...process.env};const originalFetch=global.fetch;
  process.env.CASH_SYNC_FIREBASE_PROJECT_ID=project;
  process.env.CASH_SYNC_ADMIN_UID=uid;
  delete process.env.VERCEL_ENV;
  const calls=[];
  global.fetch=async(url,options={})=>{
    calls.push({url,method:options.method||'GET'});
    if(url.includes('/jwk/'))return {ok:true,json:async()=>({keys:[jwk]})};
    if(url.includes('?fields=spreadsheetId'))return {ok:true,json:async()=>({
      spreadsheetId:TEST_SPREADSHEET_ID,properties:{title:'PHU HUNG TEST COPY'},
      sheets:[{properties:{title:'PHU HUNG'}}]
    })};
    if(url.includes(':batchUpdate'))return {ok:true,status:200,json:async()=>({replies:[{}]})};
    throw Error('Unapproved URL '+url);
  };
  try{
    const {req,response}=mockReq();
    await server(req,response);
    assert.equal(response.statusCode,200,JSON.stringify(response.body));
    assert.ok(calls.some(x=>x.method==='POST'&&x.url.includes(TEST_SPREADSHEET_ID+':batchUpdate')));
    const forbidden=mockReq('POST',{requests:[{deleteSheet:{sheetId:0}}]});
    await server(forbidden.req,forbidden.response);
    assert.equal(forbidden.response.statusCode,403);
    assert.equal(calls.filter(x=>x.method==='POST').length,1);
  }finally{
    global.fetch=originalFetch;
    for(const key of ['CASH_SYNC_FIREBASE_PROJECT_ID','CASH_SYNC_ADMIN_UID','VERCEL_ENV','CASH_SYNC_PRODUCTION_ENABLED']){
      if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];
    }
  }
});

test('atomic fixed TEST view update permits only approved sheet ID and N balance formulas',()=>{
  const header=['date','company','contractNo','content','ipc','type','income',
    'subcontract','material','otherDirect','indirect','financial','otherPayable',
    'balance','origin','sourceId','openingBalance'];
  const mk=value=>({userEnteredValue:typeof value==='number'?
    {numberValue:value}:{stringValue:String(value)}});
  const first=['2026-11-05','Vendor','','','IPC','支出',0,0,0,100,0,0,0,
    '', 'CASH_CONTROL','PHU HUNG:abc',0].map(mk);
  first[13]={userEnteredValue:{formulaValue:'=$Q$2+G2-SUM(H2:M2)'}};
  const second=['2026-11-06','Vendor B','','','IPC','支出',0,0,0,50,0,0,0,
    '', 'CASH_CONTROL','PHU HUNG:def',''].map(mk);
  second[13]={userEnteredValue:{formulaValue:'=N2+G3-SUM(H3:M3)'}};
  const body={requests:[{updateCells:{
    range:{sheetId:42,startRowIndex:0,endRowIndex:5,
      startColumnIndex:0,endColumnIndex:17},
    rows:[{values:header.map(mk)},{values:first},{values:second}],
    fields:'userEnteredValue'
  }}]};
  validateWrite('POST',':batchUpdate',body,project,42);
  assert.throws(()=>validateWrite('POST',':batchUpdate',body,project,43),/TEST view/);
  assert.throws(()=>validateWrite('POST',':batchUpdate',body,project,null),/TEST view/);
  body.requests[0].updateCells.rows[2].values[13].userEnteredValue.formulaValue='=H2';
  assert.throws(()=>validateWrite('POST',':batchUpdate',body,project,42),/balance formula/);
  body.requests[0].updateCells.rows[2].values[13].userEnteredValue.formulaValue='=N2+G3-SUM(H3:M3)';
  body.requests[0].updateCells.range.endColumnIndex=18;
  assert.throws(()=>validateWrite('POST',':batchUpdate',body,project,42),/TEST view/);
});
test('fixed generated TEST view name is permitted but original PHU HUNG tab remains forbidden',()=>{
  validateWrite('POST',':batchUpdate',{requests:[{addSheet:{
    properties:{title:'PHU_HUNG_VIEW_TEST'}}}]},project);
  fail('POST',':batchUpdate',{requests:[{addSheet:{
    properties:{title:'PHU HUNG'}}}]});
});
