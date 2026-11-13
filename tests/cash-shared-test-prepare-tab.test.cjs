'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../api/cash-shared-test-prepare-tab.js');
const {HEADER}=require('../site/assets/js/cash-shared-google-test-transport.js');
const target={project:'FOXCONN',spreadsheetId:'F'.repeat(35),
 title:'FOXCONN_GOOGLE_TEST',tab:'DATA_CASHCONTROL_TEST_FOXCONN'};
const env={VERCEL_ENV:'preview',CASH_SYNC_FIREBASE_PROJECT_ID:'cash-control-staging',
 CASH_SYNC_ADMIN_UID:'admin_test',
 CASH_SYNC_MULTI_TEST_TARGETS_JSON:JSON.stringify([target])};
const auth={firebaseJwt:'a'.repeat(150),googleToken:'b'.repeat(60),
 verifyAdmin:async()=>({uid:'admin_test'})};
const url='https://sheets.googleapis.com/v4/spreadsheets/'+target.spreadsheetId;
function mock({tab=false,header=false,existingWrong=false,failedWrite=false}={}){
 const state={tab,header,writePaths:[],getPaths:[],history:{title:'FOXCONN',sheetId:16501839}};
 const fetcher=async(path,opts)=>{
  if(opts.method==='GET'){
   state.getPaths.push(path);
   if(path.includes('?fields=spreadsheetId'))return {ok:true,json:async()=>({
    spreadsheetId:target.spreadsheetId,properties:{title:target.title},
    sheets:[{properties:state.history},...(state.tab?[{properties:{title:target.tab,sheetId:32}}]:[])]
   })};
   return {ok:true,json:async()=>({values:state.header?[existingWrong?['SOMETHING ELSE']:HEADER]:[]})};
  }
  state.writePaths.push(path);
  if(failedWrite)return {ok:false,status:503};
  const body=JSON.parse(opts.body);
  if(opts.method==='POST'){
   assert.equal(body.requests[0].addSheet.properties.title,target.tab);
   state.tab=true;return {ok:true,json:async()=>({replies:[{addSheet:{properties:{sheetId:32}}}]})};
  }
  assert.equal(opts.method,'PUT');
  assert.deepEqual(body.values,[HEADER]);state.header=true;
  return {ok:true,json:async()=>({updatedCells:15})};
 };
 return {state,fetcher};
}
const prepare=(f,more={})=>handler._internals.prepare({
 env,project:'FOXCONN',...auth,fetcher:f.fetcher,...more
});
test('missing FOXCONN TEST tab created with only machine header, never original 271 historic rows',async()=>{
 const f=mock();const r=await prepare(f);
 assert.equal(r.status,'TEST_TAB_PREPARED');assert.equal(r.historyChanged,false);
 assert.equal(r.canWrite,false);assert.equal(r.googleWrites,2);
 assert.equal(f.state.history.sheetId,16501839);
 assert.equal(f.state.writePaths.length,2);
 assert.ok(f.state.writePaths.every(p=>p.startsWith(url)));
 assert.equal(f.state.getPaths.length,3);
 const again=await prepare(f);assert.equal(again.status,'TEST_TAB_ALREADY_READY');
 assert.equal(f.state.writePaths.length,2);
});
test('existing populated TEST tab with expected header never modified',async()=>{
 const f=mock({tab:true,header:true});
 const r=await prepare(f);
 assert.equal(r.status,'TEST_TAB_ALREADY_READY');assert.equal(f.state.writePaths.length,0);
});
test('existing nonempty foreign TEST tab is blocked without edits',async()=>{
 const f=mock({tab:true,header:true,existingWrong:true});
 await assert.rejects(prepare(f),/TEST_TAB_NOT_EMPTY_OR_UNEXPECTED_HEADER/);
 assert.equal(f.state.writePaths.length,0);
});
test('Google 503 after tab creation cannot be misreported as success',async()=>{
 const f=mock({failedWrite:true});
 await assert.rejects(prepare(f),/GOOGLE_TEST_API_503/);
 assert.equal(f.state.writePaths.length,1);
});
test('production, non-allowlisted project or missing OAuth always blocks writes',async()=>{
 const f=mock();
 await assert.rejects(prepare(f,{env:{...env,VERCEL_ENV:'production'}}),/PREVIEW_ONLY/);
 await assert.rejects(prepare(f,{project:'PHU HUNG'}),/TEST_PROJECT_NOT_ALLOWED/);
 await assert.rejects(prepare(f,{googleToken:''}),/GOOGLE_OAUTH_REQUIRED/);
 assert.equal(f.state.writePaths.length,0);
});
test('HTTP handler requires explicit POST confirmation and same origin',async()=>{
 const response=()=>({statusCode:0,body:null,
 setHeader(){return this},status(c){this.statusCode=c;return this},
 json(x){this.body=x;return this}});
 for(const req of [
 {method:'GET',headers:{}},
 {method:'POST',headers:{host:'example.test',origin:'https://evil.test'},body:{}},
 {method:'POST',headers:{host:'example.test',origin:'https://example.test'},
  body:{project:'FOXCONN',confirmed:false}}
 ]){
  const res=response();await handler(req,res);
  assert.ok(res.statusCode>=400);
 }
});
