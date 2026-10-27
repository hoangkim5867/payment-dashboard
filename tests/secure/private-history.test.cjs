'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('fs');const path=require('path');const vm=require('vm');const crypto=require('crypto');
const root=path.resolve(__dirname,'../..');const site=path.join(root,'site');
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
function hash(rows){return crypto.createHash('sha256').update(JSON.stringify(canonical(rows))).digest('hex');}
function makeRows(){return Array.from({length:812},(_,i)=>({z:'project-'+(i%4),a:i,amount:i*101.5}));}
function launch(file,opts={}){
 const source=fs.readFileSync(path.join(site,file),'utf8');
 const start=source.indexOf('let privateHistory2026LoadedUid = null;');
 const end=source.indexOf('const PAYMENT_INDEX_QUERY_CODE_ENABLED = true;',start);
 assert.ok(start>0 && end>start,'loader present');
 const part=source.slice(start,end);
 const uid='approved-uid';const data=makeRows();const reordered=data.map(({a,amount,z})=>({amount,a,z}));const docs={raw:{rows:opts.reordered?reordered:data,rowCount:812,sha256:hash(data),schemaVersion:1},clean:{rows:opts.reordered?reordered:data,rowCount:812,sha256:hash(data),schemaVersion:1}};
 if(opts.corrupt)docs.clean.sha256='0'.repeat(64);
 if(opts.missing)delete docs.clean;
 let calls=0;
 const context={console,TextEncoder,crypto:crypto.webcrypto,window:{},currentAuthUser:{uid},currentUserProfile:{role:'Staff'},auth:{currentUser:{uid}},
  doc:(db,col,id)=>({col,id}),db:{},getDocFromServer:async({col,id})=>{calls++;const item=docs[id];return {exists:()=>!!item,data:()=>item}}};
 vm.createContext(context);vm.runInContext(part,context);
 return {context,calls:()=>calls};
}
for(const page of ['payment.html','payment-mobile-renderer.html']){
 test(page+': HTML ships without historical arrays',()=>{
  const html=fs.readFileSync(path.join(site,page),'utf8');
  assert.doesNotMatch(html,/window\.HISTORY_2026_(EMBEDDED|CLEAN_SOURCE)\s*=\s*\[\{/);
  assert.match(html,/await ensurePrivateHistory2026Loaded\(\)/);
 });
 test(page+': authorized loading, checksum, cache and clear',async()=>{
  const x=launch(page);await x.context.ensurePrivateHistory2026Loaded();
  assert.equal(x.calls(),2); assert.equal(x.context.window.HISTORY_2026_EMBEDDED.length,812);
  await x.context.ensurePrivateHistory2026Loaded(); assert.equal(x.calls(),2);
  x.context.clearPrivateHistory2026();assert.equal(x.context.window.HISTORY_2026_EMBEDDED,null);
 });
 test(page+': canonical checksum survives Firestore map key ordering',async()=>{
  const x=launch(page,{reordered:true});await x.context.ensurePrivateHistory2026Loaded();
  assert.equal(x.calls(),2);assert.equal(x.context.window.HISTORY_2026_CLEAN_SOURCE.length,812);
 });
 test(page+': refuses incomplete or corrupted historical documents',async()=>{
  await assert.rejects(launch(page,{missing:true}).context.ensurePrivateHistory2026Loaded(),/chưa được chuyển/);
  await assert.rejects(launch(page,{corrupt:true}).context.ensurePrivateHistory2026Loaded(),/checksum/);
 });
 test(page+': signed-out access is rejected without reads',async()=>{
  const x=launch(page);x.context.auth.currentUser=null;x.context.currentAuthUser=null;
  await assert.rejects(x.context.ensurePrivateHistory2026Loaded(),/đăng nhập/);assert.equal(x.calls(),0);
 });
}
test('migration tool cannot apply to production without authorization',()=>{
 const s=fs.readFileSync(path.join(root,'migration/history-import.cjs'),'utf8');
 assert.match(s,/Production writes forbidden/);
 assert.match(s,/ABORT: existing/);
 assert.match(s,/Checksum mismatch/);
});
test('index is ARMED with Firestore marker read on every access',()=>{
 for(const file of ['payment.html','payment-mobile-renderer.html','contract-master.html']){
  const code=fs.readFileSync(path.join(site,file),'utf8');
  assert.match(code,/getDocFromServer\(doc\(db,"systemConfig","paymentLookupV1"\)\)/);
  assert.match(code,/state\.continuousMaintenance===true && state\.verified===true/);
 }
});

test('Rules are explicit and default-deny unknown paths',()=>{
 const rules=fs.readFileSync(path.join(root,'security/firestore.rules.PROPOSED_STAGING_ONLY'),'utf8');
 assert.ok(!rules.includes('match /{collection}/{document=**}'));
 for(const name of ['payments','authUsers','activityLogs','cash_control_private','contracts','vendorMasters','paymentArchives','paymentArchiveDetails','cash_flow_monthly_snapshots','messages'])assert.ok(rules.includes('match /'+name+'/'));
 assert.match(rules,/match \/paymentHistorySources2026\/\{sourceId\}/);
});
