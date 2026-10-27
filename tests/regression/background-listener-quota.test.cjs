'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

for(const filename of ['payment.html','payment-mobile-renderer.html']){
  test(filename+': background listener is paused and restored without duplicates',async()=>{
    const html=fs.readFileSync(path.join(__dirname,'../../site',filename),'utf8');
    const from=html.indexOf('function stopPaymentsRealtime(){');
    const to=html.indexOf('async function loadPayments(){',from);
    assert(from>=0 && to>from,'Expected original listener functions');
    const part=html.slice(from,to);
    assert.match(part,/document\.addEventListener\("visibilitychange"/);
    const subscriptions=[],callbacks=[],events={};let unsubscribeCount=0,applied=0;
    const document={
      visibilityState:'visible',
      addEventListener(name,fn){assert.equal(name,'visibilitychange');events[name]=fn;}
    };
    const context={
      document,
      paymentMonthFilter:{value:'2026-10'},
      CURRENT_MONTH:'2026-10',
      isAdmin:()=>true,
      authorizedPaymentListenerMonth:m=>m,
      paymentScopeKey:m=>m||'ALL',
      paymentSourceForMonth:m=>({month:m}),
      unsubscribePaymentsRealtime:null,
      settlePaymentsRealtimeReady:null,
      paymentsRealtimeReadyPromise:null,
      activePaymentsScopeKey:null,
      paymentsListenerGeneration:0,
      allPayments:[],
      selectedPaymentIds:new Set(),
      paymentBody:{innerHTML:''},
      t:()=> 'loading',
      escapeHTML:x=>x,
      console,
      currentAuthUser:{uid:'test-admin'},
      currentUserProfile:{role:'admin'},
      applyRealtimePaymentSnapshot:()=>{applied++;},
      onSnapshot(q,next,error){
        subscriptions.push(q.month);
        callbacks.push({next,error});
        return ()=>{unsubscribeCount++;};
      },
      Set,Promise
    };
    vm.createContext(context);
    vm.runInContext(part,context,{timeout:500});
    const first=vm.runInContext("startPaymentsRealtime('2026-10')",context);
    assert.deepEqual(subscriptions,['2026-10']);
    const same=vm.runInContext("startPaymentsRealtime('2026-10')",context);
    assert.equal(same,first,'Same-scope call should reuse the listener promise');
    callbacks[0].next({});
    assert.equal(await first,true);
    document.visibilityState='hidden'; events.visibilitychange();
    assert.equal(unsubscribeCount,1);
    assert.equal(await vm.runInContext("startPaymentsRealtime('2026-10')",context),false);
    assert.equal(subscriptions.length,1,'Hidden tab must not re-register listener');
    callbacks[0].next({});
    assert.equal(applied,1,'Stale listener callbacks must be ignored');
    document.visibilityState='visible';events.visibilitychange();
    assert.deepEqual(subscriptions,['2026-10','2026-10']);
    callbacks[1].next({});
    assert.equal(applied,2);
    events.visibilitychange();
    assert.equal(subscriptions.length,2,'Repeated visible event should not duplicate listener');
    const next=vm.runInContext("startPaymentsRealtime('2026-10')",context);
    assert.equal(await next,true);
    assert.equal(subscriptions.length,2);
  });

  test(filename+': in-flight listener promise settles on hidden event',async()=>{
    const html=fs.readFileSync(path.join(__dirname,'../../site',filename),'utf8');
    const from=html.indexOf('function stopPaymentsRealtime(){');
    const to=html.indexOf('async function loadPayments(){',from);
    const events={};
    const document={visibilityState:'visible',addEventListener(n,fn){events[n]=fn;}};
    const context={document,paymentMonthFilter:{value:'2026-10'},CURRENT_MONTH:'2026-10',
      isAdmin:()=>true,authorizedPaymentListenerMonth:m=>m,paymentScopeKey:m=>m||'ALL',
      paymentSourceForMonth:m=>m,unsubscribePaymentsRealtime:null,settlePaymentsRealtimeReady:null,
      paymentsRealtimeReadyPromise:null,activePaymentsScopeKey:null,paymentsListenerGeneration:0,
      allPayments:[],selectedPaymentIds:new Set(),paymentBody:{innerHTML:''},t:x=>x,
      escapeHTML:x=>x,console,currentAuthUser:{uid:'u'},currentUserProfile:{role:'admin'},
      onSnapshot:()=>()=>{},applyRealtimePaymentSnapshot:()=>{},Set,Promise};
    vm.createContext(context);
    vm.runInContext(html.slice(from,to),context,{timeout:500});
    const p=vm.runInContext("startPaymentsRealtime('2026-10')",context);
    document.visibilityState='hidden';events.visibilitychange();
    const outcome=await Promise.race([p,Promise.resolve('PENDING')]);
    assert.equal(outcome,false,'Unsubscribing must settle pending initialization promise');
  });
}
