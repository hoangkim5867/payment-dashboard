'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const {initializeTestEnvironment}=require('@firebase/rules-unit-testing'),sdk=require('firebase/firestore'),{computeIndexV1}=require('../../backend/payment-index-core.cjs');
let env,db,create;const evidence={environment:'Firestore Emulator',cases:[]};
const month=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).format(new Date());
const row=i=>({paymentMonth:month,project:'EATON PARK',contractNo:'LOAD-'+i,ipcNo:'IPC'+i,amount:i+1,createdByUid:'staff',source:'excel-paste',importBatchId:'LOAD',deleted:false});
test.before(async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Local Emulator required');
 ({createPaymentWriters:create}=await import(pathToFileURL(path.join(__dirname,'../../site/assets/js/payment-writers.mjs'))));
 env=await initializeTestEnvironment({projectId:'demo-payment-load-validation',firestore:{host:'127.0.0.1',port:8080,rules:fs.readFileSync(path.join(__dirname,'../../security/firestore.rules.PROPOSED_STAGING_ONLY'),'utf8')}});
 await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{for(const [id,role] of [['staff','Staff'],['admin','Admin']])await sdk.setDoc(sdk.doc(c.firestore(),'authUsers',id),{role})});
 db=env.authenticatedContext('staff').firestore();
});
test.after(async()=>{fs.writeFileSync(path.join(__dirname,'large-writer-results.json'),JSON.stringify(evidence,null,2));if(env)await env.cleanup()});
test('400 and 450 payment batches create/update complete indexes under actual Staff rules',{timeout:120000},async()=>{
 const started=Date.now(),writer=create(sdk,computeIndexV1);
 for(const [start,count] of [[0,400],[400,450]]){const batch=writer.writeBatch(db);for(let i=start;i<start+count;i++)batch.set(sdk.doc(db,'payments/p'+i),row(i));await batch.commit();}
 const snapshot=await sdk.getDocs(sdk.collection(db,'payments'));assert.equal(snapshot.size,850);
 for(const doc of snapshot.docs){const data=doc.data();for(const [k,v] of Object.entries(computeIndexV1(data)))assert.equal(data[k],v)}
 const batch=writer.writeBatch(db);for(let i=400;i<850;i++)batch.update(sdk.doc(db,'payments/p'+i),{ipcNo:'UPDATED-'+i});await batch.commit();
 const changed=await sdk.getDocs(sdk.query(sdk.collection(db,'payments'),sdk.where('contractNo','==','LOAD-449')));assert.equal(changed.docs[0].data().ipcNo,'UPDATED-449');
 evidence.cases.push({name:'400+450 create, 450 update',documents:850,allIndexesVerified:true,elapsedMs:Date.now()-started,pass:true});
});
test('four concurrent sessions, ten rounds preserve 40 increments and current index',{timeout:120000},async()=>{
 const started=Date.now(),ref=sdk.doc(db,'payments/concurrent');await create(sdk,computeIndexV1).setDoc(ref,{...row(999),amount:0});
 const sessions=Array.from({length:4},()=>env.authenticatedContext('staff').firestore());
 for(let round=0;round<10;round++)await Promise.all(sessions.map((s,i)=>create(sdk,computeIndexV1).updateDoc(sdk.doc(s,'payments/concurrent'),{amount:sdk.increment(1),ipcNo:'ROUND-'+round+'-'+i})));
 const result=(await sdk.getDocFromServer(ref)).data();assert.equal(result.amount,40);assert.equal(result.duplicateKeyV1,computeIndexV1(result).duplicateKeyV1);
 evidence.cases.push({name:'4 sessions x 10 rounds',increments:40,elapsedMs:Date.now()-started,pass:true});
});
test('second chunk denied: first chunk remains intact and owned Undo removes only its own batch',{timeout:120000},async()=>{
 const writer=create(sdk,computeIndexV1),first=writer.writeBatch(db);
 for(let i=0;i<400;i++)first.set(sdk.doc(db,'payments/partial-'+i),{...row(i),importBatchId:'PARTIAL'});await first.commit();
 const second=writer.writeBatch(db);second.set(sdk.doc(db,'payments/partial-later'),{...row(401),importBatchId:'PARTIAL'});second.set(sdk.doc(db,'authUsers/forged'),{role:'Admin'});
 await assert.rejects(second.commit());
 const snap=await sdk.getDocs(sdk.query(sdk.collection(db,'payments'),sdk.where('importBatchId','==','PARTIAL')));assert.equal(snap.size,400);
 assert.equal((await sdk.getDoc(sdk.doc(db,'payments/partial-later'))).exists(),false);
 const undo=writer.writeBatch(db);for(const d of snap.docs)undo.delete(d.ref);await undo.commit();
 assert.equal((await sdk.getDocs(sdk.query(sdk.collection(db,'payments'),sdk.where('importBatchId','==','PARTIAL')))).size,0);
 assert.equal((await sdk.getDoc(sdk.doc(db,'payments/p0'))).exists(),true);
 evidence.cases.push({name:'second chunk failure and owned undo',firstChunkRows:400,failedChunkRows:0,unrelatedRowsPreserved:true,pass:true});
});
