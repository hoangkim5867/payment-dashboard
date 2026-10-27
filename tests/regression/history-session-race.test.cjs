'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root=path.resolve(__dirname,'../..');
const rows=Array.from({length:812},(_,i)=>({id:`FAKE-${i+1}`,amount:i+1}));
const expected=crypto.createHash('sha256').update(JSON.stringify(rows.map(r=>({amount:r.amount,id:r.id})))).digest('hex');

for(const page of ['payment.html','payment-mobile-renderer.html']){
  function contextFactory({badHash=false,pauseHash=false,missingDoc=false}={}){
    let startedResolve, releaseResolve;
    const started=new Promise(r=>startedResolve=r);
    const released=new Promise(r=>releaseResolve=r);
    const fakeWindow={};
    let reads=0;
    const ctx={
      window:fakeWindow, TextEncoder,
      currentAuthUser:{uid:'staff'}, currentUserProfile:{role:'Staff'},
      auth:{currentUser:{uid:'staff'}},db:{},
      doc:(_db,collection,id)=>({collection,id}),
      getDocFromServer:async ref=>{reads++;return ({
        exists:()=>!(missingDoc&&ref.id==='raw'),
        data:()=>({schemaVersion:1,rowCount:812,sha256:badHash?'0'.repeat(64):expected,rows})
      });},
      crypto:{subtle:{digest:async (alg,buffer)=>{
        if(pauseHash){startedResolve();await released;}
        return crypto.webcrypto.subtle.digest(alg,buffer);
      }}}
    };
    vm.createContext(ctx);
    const html=fs.readFileSync(path.join(root,'site',page),'utf8');
    const start=html.indexOf('let privateHistory2026LoadedUid = null;');
    const end=html.indexOf('const PAYMENT_INDEX_QUERY_CODE_ENABLED',start);
    assert.ok(start>0 && end>start,`Could not extract history loader from ${page}`);
    vm.runInContext(html.slice(start,end),ctx,{filename:page});
    return {ctx, started, getReads:()=>reads, released:()=>releaseResolve()};
  }
  test(`${page}: approved user gets 812+812 fake records and no extra reads on cache`,async()=>{
    const {ctx,getReads}=contextFactory();
    await vm.runInContext('ensurePrivateHistory2026Loaded()',ctx);
    assert.equal(ctx.window.HISTORY_2026_EMBEDDED.length,812);
    assert.equal(ctx.window.HISTORY_2026_CLEAN_SOURCE.length,812);
    await vm.runInContext('ensurePrivateHistory2026Loaded()',ctx);
    assert.equal(getReads(),2,'A cached second open must not reread Firestore');
  });
  test(`${page}: missing or tampered source fails closed`,async()=>{
    for(const opts of [{badHash:true},{missingDoc:true}]){
      const {ctx}=contextFactory(opts);
      await assert.rejects(vm.runInContext('ensurePrivateHistory2026Loaded()',ctx));
      assert.equal(ctx.window.HISTORY_2026_EMBEDDED,null);
      assert.equal(ctx.window.HISTORY_2026_CLEAN_SOURCE,null);
    }
  });
  test(`${page}: logout during SHA-256 cannot repopulate history after same UID re-login`,async()=>{
    const {ctx,started,released}=contextFactory({pauseHash:true});
    const promise=vm.runInContext('ensurePrivateHistory2026Loaded()',ctx);
    await started;
    vm.runInContext('clearPrivateHistory2026()',ctx);
    // Same UID again: checking only currentUser.uid would have passed incorrectly.
    ctx.auth.currentUser={uid:'staff'};
    ctx.currentAuthUser={uid:'staff'};
    ctx.currentUserProfile={role:'Staff'};
    released();
    await assert.rejects(promise,/Phiên đăng nhập thay đổi/);
    assert.equal(ctx.window.HISTORY_2026_EMBEDDED,null);
    assert.equal(ctx.window.HISTORY_2026_CLEAN_SOURCE,null);
  });
}
