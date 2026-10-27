'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const sdk=require('firebase/firestore');
const core=require('../../backend/payment-index-core.cjs');
let env,db,writers;
const base={project:'PH',contractNo:'PH-MEP001',ipcNo:'IPC1',paymentMonth:'2026-09',paymentType:'MEP',amount:123};
test.before(async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Local Emulator required');
 const {createPaymentWriters}=await import(pathToFileURL(path.join(__dirname,'../../site/assets/js/payment-writers.mjs')));
 env=await initializeTestEnvironment({projectId:'demo-payment-synchronous',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'../../security/firestore.rules.PROPOSED_STAGING_ONLY'),'utf8')}});
 await env.clearFirestore();await env.withSecurityRulesDisabled(c=>sdk.setDoc(sdk.doc(c.firestore(),'authUsers/staff'),{role:'Admin'}));
 db=env.authenticatedContext('staff').firestore();writers=createPaymentWriters(sdk,core.computeIndexV1);
});
test.after(async()=>{if(env)await env.cleanup()});
async function verify(ref){
 const snap=await sdk.getDocFromServer(ref),row=snap.data();
 for(const [k,v] of Object.entries(core.computeIndexV1(row)))assert.equal(row[k],v,k);
 const found=await sdk.getDocs(sdk.query(sdk.collection(db,'payments'),sdk.where('duplicateKeyV1','==',core.duplicateKeyV1(row))));
 assert.ok(found.docs.some(d=>d.id===ref.id));return row;
}
test('all six Firestore 10.12 pages route writes through the adapter',()=>{
 for(const name of ['payment.html','payment-mobile-renderer.html','contract-master.html','plan-review.html','cash-control.html','payment-archive.html']){
  const text=fs.readFileSync(path.join(__dirname,'../../site',name),'utf8');
  assert.ok(text.includes('./assets/js/firestore-payment.mjs'),name);
  assert.ok(!text.includes('10.12.2/firebase-firestore.js'),name);
 }
});
test('browser and backend index computations remain equal',async()=>{
 const browser=await import(pathToFileURL(path.join(__dirname,'../../site/assets/js/payment-index-core.mjs')));
 for(const row of [base,{...base,project:'中建厂房',contractNo:'MEP9',deleted:true},{...base,project:'Phú Hưng',noMEPException:true}])assert.deepEqual(browser.computeIndexV1(row),core.computeIndexV1(row));
});
test('add, edit IPC, change month, soft-delete, restore, delete immediately query correctly',async()=>{
 const ref=await writers.addDoc(sdk.collection(db,'payments'),base);await verify(ref);
 const oldKey=core.duplicateKeyV1(base);
 await writers.updateDoc(ref,{ipcNo:'IPC2',paymentMonth:'2026-10'});await verify(ref);
 assert.equal((await sdk.getDocs(sdk.query(sdk.collection(db,'payments'),sdk.where('duplicateKeyV1','==',oldKey)))).size,0);
 await writers.updateDoc(ref,{deleted:true});assert.equal((await verify(ref)).mepLookupV1,false);
 await writers.updateDoc(ref,{deleted:false});assert.equal((await verify(ref)).mepLookupV1,true);
 await sdk.deleteDoc(ref);assert.equal((await sdk.getDocFromServer(ref)).exists(),false);
});
test('full set, merge, mergeFields, string field paths and deleted lookup field',async()=>{
 const ref=sdk.doc(db,'payments/merge');await writers.setDoc(ref,base);await verify(ref);
 await writers.setDoc(ref,{project:'Eaton Park'},{merge:true});await verify(ref);
 await writers.setDoc(ref,{ipcNo:'IPC-MERGE',project:'IGNORED'},{mergeFields:['ipcNo']});assert.equal((await verify(ref)).project,'Eaton Park');
 await writers.updateDoc(ref,'ipcNo','IPC-FIELD','amount',200);assert.equal((await verify(ref)).amount,200);
 await writers.updateDoc(ref,{contractNo:sdk.deleteField()});assert.equal((await verify(ref)).contractNo,undefined);
});
test('mixed batch preserves payment and other document updates, server transforms and return chain',async()=>{
 const ref=sdk.doc(db,'payments/batch');await writers.setDoc(ref,base);
 const batch=writers.writeBatch(db);
 assert.equal(batch.update(ref,{ipcNo:'BATCH',amount:sdk.increment(10),updatedAt:sdk.serverTimestamp()}),batch);
 batch.set(sdk.doc(db,'paymentArchives/2026-10'),{month:"2026-10",count:1});await batch.commit();
 const row=await verify(ref);assert.equal(row.amount,133);assert.ok(row.updatedAt.toMillis()>0);
 assert.equal((await sdk.getDoc(sdk.doc(db,'paymentArchives/2026-10'))).data().count,1);
 await assert.rejects(batch.commit());
});
test('failed mixed batch is atomic and does not mutate a payment',async()=>{
 const ref=sdk.doc(db,'payments/atomic');await writers.setDoc(ref,base);
 const batch=writers.writeBatch(db);batch.update(ref,{ipcNo:'SHOULD-NOT-COMMIT'});batch.set(sdk.doc(db,'authUsers/forged'),{role:'Admin'});
 await assert.rejects(batch.commit());assert.equal((await verify(ref)).ipcNo,base.ipcNo);
});
test('existing transaction return value and concurrent edits preserve both index sources',async()=>{
 const ref=sdk.doc(db,'payments/concurrent');await writers.setDoc(ref,base);
 const value=await writers.runTransaction(db,async tx=>{const snap=await tx.get(ref);tx.update(ref,{amount:snap.data().amount+1});return 'committed'});
 assert.equal(value,'committed');
 await Promise.all([writers.updateDoc(ref,{project:'Eaton Park'}),writers.updateDoc(ref,{ipcNo:'CONCURRENT'})]);
 const row=await verify(ref);assert.equal(row.project,'Eaton Park');assert.equal(row.ipcNo,'CONCURRENT');assert.equal(row.amount,124);
});
test('non-payment-only batch and multiple writes to one payment retain semantics',async()=>{
 const batch=writers.writeBatch(db);batch.set(sdk.doc(db,'paymentArchives/2026-11'),{month:"2026-11",count:2});await batch.commit();
 const ref=sdk.doc(db,'payments/multiple');await writers.setDoc(ref,base);
 const mixed=writers.writeBatch(db);mixed.update(ref,{project:'Eaton Park'});mixed.update(ref,{ipcNo:'MULTI'});await mixed.commit();
 const row=await verify(ref);assert.equal(row.project,'Eaton Park');assert.equal(row.ipcNo,'MULTI');
});
