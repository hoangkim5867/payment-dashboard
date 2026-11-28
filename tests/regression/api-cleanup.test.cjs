'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),router=require('../../api/cash-shared-test.js');
const names=['google-probe','history-audit','idempotency','real-compare'];
function response(){return {code:200,body:null,setHeader(){},status(n){this.code=n;return this},json(v){this.body=v;return this}}}
test('only nine deployed API entries; legacy routes preserved; Web Push removed',()=>{
 const files=fs.readdirSync(path.join(root,'api')).filter(x=>x.endsWith('.js'));
 assert.equal(files.length,9);
 const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
 for(const n of names){
  assert.ok(!files.includes('cash-shared-test-'+n+'.js'));
  assert.ok(fs.existsSync(path.join(root,'server','cash-shared-test-'+n+'.cjs')));
  assert.ok(config.rewrites.some(x=>x.source==='/api/cash-shared-test-'+n&&x.destination==='/api/cash-shared-test?operation='+n));
 }
 assert.ok(!files.includes('payment-reminder-push.js'));
 assert.ok(!fs.existsSync(path.join(root,'site/payment-reminder-push/sw.js')));
 const ui=fs.readFileSync(path.join(root,'site/assets/js/payment-reminder-pilot.mjs'),'utf8');
 assert.doesNotMatch(ui,/queueBackgroundPreview|pushBusy|pushStatus/);
 assert.match(ui,/!items.length&&!weeklyPending&&!settingsOpen/);
});
test('router rejects production and rejects unknown or ambiguous operations; delegates original request without bypassing origin gate',async()=>{
 const old=process.env.VERCEL_ENV;
 try{
  process.env.VERCEL_ENV='production';
  for(const operation of names){const res=response();await router({method:'POST',query:{operation}},res);assert.equal(res.code,403);assert.equal(res.body.error,'PREVIEW_ONLY')}
  process.env.VERCEL_ENV='preview';
  for(const operation of ['__proto__','constructor','missing',undefined,['google-probe','idempotency']]){const res=response();await router({method:'POST',query:{operation}},res);assert.equal(res.code,404)}
  for(const operation of names){const res=response();await router({method:'POST',query:{operation},headers:{}},res);assert.equal(res.code,403);assert.equal(res.body.error,'CROSS_ORIGIN')}
  const res=response();await router({method:'GET',query:{operation:'idempotency'}},res);assert.equal(res.code,405);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old}
});
