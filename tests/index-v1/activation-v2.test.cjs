'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../site');
const html=fs.readFileSync(path.join(root,'admin-index-maintenance.html'),'utf8');
const script=html.split('<script type="module">')[1].split('</script>')[0];
for(const file of ['payment.html','payment-mobile-renderer.html']){
 test(file+': a stale true v1 marker cannot enable indexed duplicate checking after a new build',async()=>{
  const src=fs.readFileSync(path.join(root,file),'utf8');
  const start=src.indexOf('async function paymentIndexV1Ready(){');
  const end=src.indexOf('\n}',start);
  assert.ok(start>0&&end>start);
  let state={ready:true,schemaVersion:1,continuousMaintenance:true,verified:true,
    synchronousWritersVerified:true,historySourceSeparated:true};
  const ctx={db:{},console:{warn(){}},doc:()=>({}),getDocFromServer:async()=>({exists:()=>true,data:()=>state})};
  vm.createContext(ctx);vm.runInContext(src.slice(start,end+2),ctx);
  assert.equal(await ctx.paymentIndexV1Ready(),false,'old ready:true is not sufficient');
  state={...state,activationVersion:2};
  assert.equal(await ctx.paymentIndexV1Ready(),true);
  state={...state,verified:false};
  assert.equal(await ctx.paymentIndexV1Ready(),false);
 });
}
test('Admin activation never modifies Payment, requires a fresh complete server audit and compiled release approval',()=>{
 const start=script.indexOf('async function activateIndexedExcel(){');
 const end=script.indexOf('async function disableIndexedExcel(){',start);
 assert.ok(start>0&&end>start);
 const fn=script.slice(start,end);
 assert.ok(fn.indexOf('await checkIndexReleaseBuild();')<fn.indexOf('await finalIndexAuditForActivation(uid);'));
 assert.ok(fn.indexOf('await finalIndexAuditForActivation(uid);')<fn.indexOf('await setDoc(INDEX_MARKER,'));
 assert.match(fn,/ready:true,schemaVersion:1,activationVersion:2/);
 assert.match(fn,/verifiedPaymentCount:count/);
 assert.match(fn,/await getDocFromServer\(INDEX_MARKER\)/);
 assert.match(script,/if\(inspect\(item\.data\(\)\)\.wrong\)wrong\+\+/);
 assert.match(script,/if\(wrong\)throw Error/);
 assert.match(script,/previous\.mismatch!==0/);
 assert.match(script,/previous\.seen!==total/);
 assert.match(script,/if\(release\.target!=="production"/);
 assert.match(script,/release\.indexOptimizationEnabledByDefault!==true/);
 assert.match(html,/Tắt tìm trùng nhanh/);
 assert.doesNotMatch(fn,/transaction\.update\(|deleteDoc\(|updateDoc\(/);
});
