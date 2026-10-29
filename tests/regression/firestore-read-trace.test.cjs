'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const modulePromise=import(pathToFileURL(path.resolve(__dirname,'../../site/assets/js/firestore-read-trace.mjs')));
const snap={size:17,metadata:{fromCache:false},docs:[],docChanges:()=>[{id:'x'}]};
test('read instrumentation never performs an extra Firestore request or mutates returned snapshots',async()=>{
    const {createReadTracer}=await modulePromise;
    const calls=[],events=[];
    const sdk={
        getDocs:async q=>{calls.push(['getDocs',q]);return snap;},
        getDoc:async q=>{calls.push(['getDoc',q]);return {exists:()=>true};},
        getCountFromServer:async q=>{calls.push(['count',q]);return {data:()=>({count:500})};}
    };
    const t=createReadTracer(sdk,e=>events.push(e));
    const ref={type:'collection',path:'payments'};
    assert.equal(await t.getDocs(ref),snap);
    assert.equal((await t.getDoc(ref)).exists(),true);
    assert.equal((await t.getCountFromServer(ref)).data().count,500);
    assert.equal(calls.length,3);
    assert.equal(events[0].collection,'payments');
    assert.equal(events[0].documentsReturned,17);
    assert.equal(events[0].fromCache,false);
    assert.ok(!JSON.stringify(events).includes('x'));
});
test('listener instrumentation preserves callback, subscribe options and unsubscribe',async()=>{
    const {createReadTracer}=await modulePromise;
    const events=[],opts={includeMetadataChanges:true};
    let next,unsubbed=0;
    const sdk={onSnapshot:(q,...args)=>{assert.equal(args[0],opts);next=args[1];return ()=>{unsubbed++;};}};
    const t=createReadTracer(sdk,e=>events.push(e));
    const received=[],r={_query:{path:{toString:()=> 'payments'},filters:[{}]}};
    const stop=t.onSnapshot(r,opts,s=>received.push(s));
    next(snap);next(snap);stop();
    assert.deepEqual(received,[snap,snap]);
    assert.equal(unsubbed,1);
    assert.deepEqual(events.map(x=>x.operation),['listen-start','listen-first','listen-change','listen-stop']);
    assert.equal(events[1].documentChanges,1);
    assert.equal(events[1].scope,'filtered');
});
test('observer-object subscriptions preserve observer this and any errors in diagnostics never break application',async()=>{
    const {createReadTracer}=await modulePromise;
    let observer;const sdk={onSnapshot:(q,cb)=>{observer=cb;return ()=>{};}};
    const t=createReadTracer(sdk,()=>{throw Error('diagnostics unavailable')});
    const callbacks={n:0,next(){this.n++;}};
    t.onSnapshot({path:'cash_control_private/secret'},callbacks);
    observer.next(snap);
    assert.equal(callbacks.n,1);
});
test('opt-out uses original SDK functions without wrappers',async()=>{
    const {createReadTracer}=await modulePromise;
    const sdk={getDocs(){},getDoc(){},onSnapshot(){}};
    const trace=createReadTracer(sdk,null);
    assert.equal(trace.getDocs,sdk.getDocs);
    assert.equal(trace.onSnapshot,sdk.onSnapshot);
});
test('failed reads keep the same error identity',async()=>{
    const {createReadTracer}=await modulePromise;
    const err=Object.assign(new Error('quota'),{code:'resource-exhausted'}),events=[];
    const sdk={getDocs:async()=>{throw err;}};
    await assert.rejects(createReadTracer(sdk,e=>events.push(e)).getDocs({path:'payments'}),e=>e===err);
    assert.equal(events[0].error,'resource-exhausted');
});
