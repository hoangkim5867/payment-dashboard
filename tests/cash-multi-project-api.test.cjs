'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {sha}=require('../server/cash-sync-multi-project-core.cjs');
// Fake Firebase JWT verification and Google Sheets API: NO network, NO production data.
const guard=require.resolve('../server/cash-sync-guard.cjs');
const saved=require.cache[guard];
require.cache[guard]={id:guard,filename:guard,loaded:true,exports:{
 readConfig:()=>({project:'cscecmep-payment',uid:'synthetic-admin'}),
 verifyFirebaseAdminToken:async()=>({project:'cscecmep-payment',uid:'synthetic-admin'})
}};
const handler=require('../api/cash-sync-multi-project.js');
if(saved)require.cache[guard]=saved;else delete require.cache[guard];
const ID='12345678901234567890ABCDEFGHIJKLMNOPQRST';
const orig=[['2026-10-01','Vendor','SUBP-1','Invoice','IPC01','分包款',
  0,100,0,0,0,0,0,900]];
const newValues=['2026-11-03','Vendor','SUBP-2','Another invoice','IPC02','分包款',
  0,200,0,0,0,0,0,0];
const source=[{id:'ELYSIAN:expense:new',project:'ELYSIAN',month:'2026-11',
 values:newValues,hash:sha(newValues)}];
function fixture(project='ELYSIAN',spreadsheetId=ID){
 const state={meta:{spreadsheetId,sheets:[
  {properties:{sheetId:42,title:'SỔ GỐC',gridProperties:{rowCount:1000,columnCount:15}}}
 ]},history:structuredClone(orig),mirror:null,view:null,formulas:null,writes:0};
 const ok=data=>({ok:true,status:200,json:async()=>data});
 const fakeFetch=async(url,request={})=>{
  const method=request.method||'GET';
  if(method==='POST'){
   assert.ok(url.endsWith(':batchUpdate'));
   state.writes++;
   const body=JSON.parse(request.body);
   for(const item of body.requests){
    if(item.addSheet)state.meta.sheets.push({properties:item.addSheet.properties});
    if(item.updateCells){
     const sheet=state.meta.sheets.find(x=>x.properties.sheetId===item.updateCells.range.sheetId);
     const matrix=item.updateCells.rows.map(row=>row.values.map(cell=>{
      const v=cell.userEnteredValue||{};
      return Object.hasOwn(v,'formulaValue')?v.formulaValue:
       Object.hasOwn(v,'numberValue')?v.numberValue:
       Object.hasOwn(v,'stringValue')?v.stringValue:
       Object.hasOwn(v,'boolValue')?v.boolValue:'';
     }));
     if(sheet.properties.title==='DATA_CASHCONTROL')state.mirror=matrix;
     else if(sheet.properties.title==='CASHCONTROL_VIEW'){
      state.formulas=matrix.map(row=>[row[14]]);
      let b=Number(matrix[1]?.[17]||0);
      state.view=matrix.map((row,i)=>{
       if(i===0)return row;
       b=Math.round((b+Number(row[6]||0)-
        row.slice(7,14).reduce((n,x)=>n+Number(x||0),0))*1e6)/1e6;
       const clone=row.slice();clone[14]=b;return clone;
      });
     }else throw Error('Attempted to overwrite historical Google tab');
    }
   }
   if(state.afterWrite)state.afterWrite();
   return ok({replies:[]});
  }
  state.reads=(state.reads||0)+1;
  if(url.includes('fields=spreadsheetId'))return ok(state.meta);
  const decoded=decodeURIComponent(url.slice(url.indexOf('/values/')+8,url.indexOf('?')));
  if(decoded.includes("'SỔ GỐC'"))return ok({values:structuredClone(state.history)});
  if(decoded.includes("'DATA_CASHCONTROL'"))return ok({values:state.mirror||[]});
  if(decoded.includes("'CASHCONTROL_VIEW'")){
   return ok({values:url.includes('valueRenderOption=FORMULA')?
     state.formulas||[]:state.view||[]});
  }
  throw Error('Unexpected Google mock URL '+url);
 };
 async function call(action,extra={}){
  const prev=global.fetch;global.fetch=fakeFetch;
  const prevFlag=process.env.CASH_SYNC_MULTI_PRODUCTION_WRITES;
  const prevTargets=process.env.CASH_SYNC_MULTI_ALLOWED_TARGETS;
  if(extra.enabled){
   process.env.CASH_SYNC_MULTI_PRODUCTION_WRITES='YES';
   process.env.CASH_SYNC_MULTI_ALLOWED_TARGETS=JSON.stringify({
    [project]:{spreadsheetId,historySheetId:42}
   });
  }
  else delete process.env.CASH_SYNC_MULTI_PRODUCTION_WRITES;
  const body={action,project,month:'2026-11',spreadsheetId,
   historySheetId:42,source:source.map(record=>({...record,
    id:record.id.replace(/^ELYSIAN:/,project+':'),project})),openingBalance:null,...extra};
  const response={statusCode:200,headers:{},
   setHeader(k,v){this.headers[k]=v;return this},
   status(n){this.statusCode=n;return this},
   json(v){this.payload=v;return this}};
  try{
   await handler({method:'POST',headers:{
    host:'example.vercel.app',origin:'https://example.vercel.app',
    authorization:'Bearer '+'T'.repeat(40),'x-firebase-id-token':'synthetic'
   },body},response);
   return {status:response.statusCode,...response.payload};
  }finally{
   global.fetch=prev;
   if(prevFlag===undefined)delete process.env.CASH_SYNC_MULTI_PRODUCTION_WRITES;
   else process.env.CASH_SYNC_MULTI_PRODUCTION_WRITES=prevFlag;
   if(prevTargets===undefined)delete process.env.CASH_SYNC_MULTI_ALLOWED_TARGETS;
   else process.env.CASH_SYNC_MULTI_ALLOWED_TARGETS=prevTargets;
  }
 }
 return {state,call};
}
test('Admin preview is read-only, commit remains gated and original sheet is immutable',async()=>{
 const f=fixture();
 const p=await f.call('preview');
 assert.equal(p.status,200);
 assert.equal(p.summary.project,'ELYSIAN');
 assert.equal(p.summary.changes,1);
 assert.equal(p.summary.closingBalance,700);
 assert.equal(p.writeConfigured,false);
 assert.equal(f.state.writes,0);
 const denied=await f.call('commit',{signature:p.signature,confirm:'SYNC_THIS_PROJECT'});
 assert.equal(denied.status,503);
 assert.equal(f.state.writes,0);
 assert.deepEqual(f.state.history,orig);
});
test('once enabled in isolated mock, atomic multi-project commit verifies and retry is no-op',async()=>{
 const f=fixture();
 const preview=await f.call('preview',{enabled:true});
 const saved=await f.call('commit',{enabled:true,signature:preview.signature,
  confirm:'SYNC_THIS_PROJECT'});
 assert.equal(saved.status,200);
 assert.equal(saved.mode,'verified');
 assert.equal(f.state.writes,1);
 assert.equal(f.state.mirror.length,2);
 assert.equal(f.state.view.length,3);
 assert.equal(f.state.view[2][14],700);
 assert.deepEqual(f.state.history,orig);
 const again=await f.call('preview',{enabled:true});
 assert.equal(again.status,200);
 assert.equal(again.summary.changes,0);
 const unchanged=await f.call('commit',{enabled:true,signature:again.signature,
  confirm:'SYNC_THIS_PROJECT'});
 assert.equal(unchanged.mode,'unchanged');
 assert.equal(f.state.writes,1);
});
test('external modification of generated VIEW blocks second commit',async()=>{
 const f=fixture();
 const p=await f.call('preview',{enabled:true});
 const first=await f.call('commit',{enabled:true,signature:p.signature,confirm:'SYNC_THIS_PROJECT'});
 assert.equal(first.mode,'verified');
 f.state.view[2][7]=12345;
 const denied=await f.call('preview',{enabled:true});
 assert.equal(denied.status,409);
 assert.equal(f.state.writes,1);
});

test('two independent projects write only their respective machine tabs and repeat idempotently',async()=>{
 const e=fixture('ELYSIAN',ID);
 const p1=await e.call('preview',{enabled:true});
 assert.equal(p1.status,200);
 assert.equal(p1.writeConfigured,true);
 const saved1=await e.call('commit',{enabled:true,signature:p1.signature,confirm:'SYNC_THIS_PROJECT'});
 assert.equal(saved1.mode,'verified');
 const eRetry=await e.call('preview',{enabled:true});
 assert.equal(eRetry.summary.changes,0);
 assert.equal(e.state.writes,1);

 const s=fixture('SSIS','B'.repeat(40));
 const p2=await s.call('preview',{enabled:true});
 assert.equal(p2.status,200);
 assert.equal(p2.summary.project,'SSIS');
 const saved2=await s.call('commit',{enabled:true,signature:p2.signature,confirm:'SYNC_THIS_PROJECT'});
 assert.equal(saved2.mode,'verified');
 assert.equal(s.state.writes,1);
 assert.equal(s.state.mirror[1][1],'SSIS');
 assert.equal(e.state.mirror[1][1],'ELYSIAN');
 assert.deepEqual(e.state.history,orig);
 assert.deepEqual(s.state.history,orig);
 const secondRetry=await s.call('preview',{enabled:true});
 assert.equal(secondRetry.summary.changes,0);
 assert.equal(s.state.writes,1);
});
test('a different spreadsheet ID supplied by browser cannot override server project allowlist',async()=>{
 const f=fixture();
 const p=await f.call('preview',{enabled:true});
 assert.equal(p.status,200);
 assert.equal(p.writeConfigured,true);
 // A mismatched target fails closed even when the global release flag is on.
 const readsBefore=f.state.reads;
 const wrong=await f.call('commit',{enabled:true,spreadsheetId:'B'.repeat(40),
   signature:p.signature,confirm:'SYNC_THIS_PROJECT'});
 assert.equal(wrong.status,503);
 assert.equal(f.state.reads,readsBefore);
 assert.equal(f.state.writes,0);
});

test('post-write verification detects changes to original history',async()=>{
 const f=fixture();
 const preview=await f.call('preview',{enabled:true});
 f.state.afterWrite=()=>{f.state.history[0][3]='Concurrent edit';};
 const result=await f.call('commit',{enabled:true,signature:preview.signature,confirm:'SYNC_THIS_PROJECT'});
 assert.equal(result.status,409);
 assert.match(result.error,/tab lịch sử đã thay đổi/);
 assert.equal(f.state.writes,1);
});
