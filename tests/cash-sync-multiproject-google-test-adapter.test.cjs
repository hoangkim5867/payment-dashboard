'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createGoogleTestAdapter}=require('../server/cash-sync-multiproject-google-test-adapter.cjs');
const {TEST_SPREADSHEET_ID}=require('../server/cash-sync-guard.cjs');
const {planTestSync,viewSignature,tabNames}=
  require('../server/cash-sync-multiproject-write-plan.cjs');
const {runTestOnlySync}=require('../server/cash-sync-multiproject-test-runner.cjs');
const history=[{date:'2026-10-01',company:'A',contractNo:'LAB-01',content:'IPC',
  ipc:'IPC01',type:'支出',income:0,subcontract:100,material:0,otherDirect:0,
  indirect:0,financial:0,otherPayable:0,rowId:2,balance:900}];
function source(id,date,amount){return {project:'ELYSIAN',id,date,company:'B',
  contractNo:'LAB-'+id,content:'IPC',ipc:'IPC02',type:'支出',income:0,
  subcontract:amount,material:0,otherDirect:0,indirect:0,financial:0,
  otherPayable:0};}
function fakeSheets({corrupt=false}={}){
  const sheets=new Map([['PHU HUNG',{id:0,rows:[],formulas:[]}]]);
  let nextId=50,writes=0;const requests=[];
  const reply=(body,status=200)=>({ok:status<400,status,json:async()=>body});
  const calls=async(url,opts={})=>{
    const method=opts.method||'GET',u=new URL(url),base='/v4/spreadsheets/'+TEST_SPREADSHEET_ID;
    const path=decodeURIComponent(u.pathname.slice(base.length));
    requests.push({path,method}); const body=opts.body?JSON.parse(opts.body):null;
    if(u.searchParams.has('fields'))return reply({
      spreadsheetId:TEST_SPREADSHEET_ID,properties:{title:'PHU HUNG TEST COPY'},
      sheets:[...sheets].map(([title,x])=>({properties:{title,sheetId:x.id,hidden:false}}))
    });
    if(method==='POST'&&path===':batchUpdate'){
      const op=body.requests[0];
      if(op.addSheet){const title=op.addSheet.properties.title;
        if(sheets.has(title))return reply({error:'exists'},400);
        sheets.set(title,{id:nextId++,rows:[],formulas:[]});writes++;return reply({replies:[{}]});}
      const update=op.updateCells;const sh=[...sheets.values()].find(x=>x.id===update.range.sheetId);
      if(!sh)return reply({error:'bad sheet'},400);
      sh.rows=update.rows.map((r,i)=>r.values.map((c,j)=>{
        if(i>0&&j===13)return null;
        return c.userEnteredValue?.numberValue??c.userEnteredValue?.stringValue??'';
      }));
      sh.formulas=update.rows.slice(1).map(r=>[r.values[13].userEnteredValue.formulaValue]);
      let bal=Number(sh.rows[1][16]);for(let i=1;i<sh.rows.length;i++){
        const row=sh.rows[i];bal=bal+row[6]-
          row.slice(7,13).reduce((n,x)=>n+Number(x||0),0);
        row[13]=corrupt?bal+1:bal;
      }
      writes++;return reply({replies:[{}]});
    }
    const match=/^\/values\/'([^']+)'!([^?]+)$/.exec(path);
    if(!match)return reply({error:'invalid path'},400);
    const [,name,range]=match,sh=sheets.get(name);
    if(!sh)return reply({error:'unknown sheet'},404);
    if(method==='GET'){
      if(range==='N2:N20000')return reply({values:sh.formulas});
      return reply({values:sh.rows});
    }
    if(method==='PUT'&&range.startsWith('A1:')){
      sh.rows=[body.values[0]];writes++;return reply({updatedRows:1});
    }
    if(method==='POST'&&range==='A:S:append'){
      sh.rows.push(...body.values);writes++;return reply({updates:{updatedRows:body.values.length}});
    }
    return reply({error:'write forbidden'},403);
  };
  return {calls,requests,sheets,get writes(){return writes}};
}
async function compare(adapter,sourceRows){
  const snapshot=await adapter.readSnapshot();
  return planTestSync({project:'ELYSIAN',history,source:sourceRows,
    sourceComplete:true,destinationConfirmed:true,mirror:snapshot.mirror,
    currentView:snapshot.view,
    expectedViewSignature:snapshot.view.length?viewSignature(snapshot.view):null});
}
function setup(remote,sourceRows){
  let rows=sourceRows;
  const adapter=createGoogleTestAdapter({project:'ELYSIAN',
    accessToken:'abcdefghijklmnopqrstuvwxyz012345',adminVerified:true,
    fetcher:remote.calls,recompare:()=>compare(adapter,rows)});
  return {adapter,setRows:r=>{rows=r},compare:()=>compare(adapter,rows)};
}
test('real Google API shapes: first TEST append, monthly update, repeat without duplicate',async()=>{
  const remote=fakeSheets(),a=source('a','2026-11-02',50);
  const client=setup(remote,[a]);
  const p1=await client.compare();
  assert.equal(p1.preview.additions,1);
  const v1=await runTestOnlySync({prepared:p1,adapter:client.adapter,
    expectedTestSpreadsheetId:TEST_SPREADSHEET_ID,explicitAdminConsent:true});
  assert.equal(v1.status,'FULL_READBACK_VERIFIED');
  assert.equal(v1.closingBalance,850);
  const tabs=tabNames('ELYSIAN');
  assert(remote.sheets.has(tabs.view)&&remote.sheets.has(tabs.mirror));
  assert.equal(remote.sheets.get('PHU HUNG').rows.length,0);
  const p2=await client.compare();
  assert.equal(p2.preview.additions,0);
  assert.equal(p2.preview.wouldChange,false);
  const b=source('b','2026-12-02',25);
  client.setRows([a,b]);
  const p3=await client.compare();
  assert.equal(p3.preview.additions,1);
  assert.equal(p3.preview.originalViewSignature!==null,true);
  const v3=await runTestOnlySync({prepared:p3,adapter:client.adapter,
    expectedTestSpreadsheetId:TEST_SPREADSHEET_ID,explicitAdminConsent:true});
  assert.equal(v3.closingBalance,825);
  assert.equal(remote.sheets.get(tabs.mirror).rows.length,3); // header + 2 distinct rows
  assert.equal(remote.sheets.get(tabs.view).rows.length,4); // header + history + 2
});
test('wrong file ID and unverified Admin prevent all Google requests',async()=>{
  const remote=fakeSheets();
  assert.throws(()=>createGoogleTestAdapter({project:'ELYSIAN',
    accessToken:'abcdefghijklmnopqrstuvwxyz012345',adminVerified:false,
    fetcher:remote.calls}),e=>e.code==='AUTH_FAILED');
  assert.equal(remote.requests.length,0);
  const client=setup(remote,[source('a','2026-11-02',50)]);
  await assert.rejects(client.adapter.checkAuthority({
    spreadsheetId:'some-original-production-id',...tabNames('ELYSIAN')
  }),e=>e.code==='TARGET');
  assert.equal(remote.requests.length,0);
});
test('wrong balance from Google API blocks verification, no silent success',async()=>{
  const remote=fakeSheets({corrupt:true}),client=setup(remote,[source('a','2026-11-02',50)]);
  const p=await client.compare();
  await assert.rejects(runTestOnlySync({prepared:p,adapter:client.adapter,
    expectedTestSpreadsheetId:TEST_SPREADSHEET_ID,explicitAdminConsent:true}),
    e=>e.code==='BALANCE_NOT_VERIFIED');
  assert.equal(remote.sheets.get('PHU HUNG').rows.length,0);
});
