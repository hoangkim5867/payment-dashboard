'use strict';
// Verify the EXACT V2 STRICT candidate deployed in the console, not the
// older PROPOSED_STAGING_ONLY fixture. Isolated Emulator data only.
const test=require('node:test'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertSucceeds:yes,assertFails:no}=require('@firebase/rules-unit-testing');
const s=require('firebase/firestore');
const owner='HTx2QuATHxh8zgAawwreg88w65M2';
let env;
test.before(async()=>{
  if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Local Emulator required');
  env=await initializeTestEnvironment({
    projectId:'demo-payment-archive-strict',
    firestore:{host:'127.0.0.1',port:8080,
      rules:fs.readFileSync(path.join(__dirname,'../../security/firestore.rules.V2_STRICT_REVIEW_ONLY'),'utf8')}
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx=>{
    const db=ctx.firestore();
    for(const [uid,role,disabled] of [[owner,'admin',false],['non-owner-admin','admin',false],['staff','staff',false],['disabled','admin',true]]){
      await s.setDoc(s.doc(db,'authUsers',uid),{role,disabled,active:true});
    }
    await s.setDoc(s.doc(db,'paymentArchives/2026-10'),{month:'2026-10',companyIndex:[]});
    await s.setDoc(s.doc(db,'paymentArchiveDetails/2026-10'),{month:'2026-10',companyIndex:[]});
  });
});
test.after(async()=>{if(env)await env.cleanup();});
const db=(uid)=>env.authenticatedContext(uid,uid===owner?{email:'lehoangoanh@cscecmep.internal'}:{}).firestore();
test('STRICT Rules allow owner, non-owner Admin and Staff GET/LIST Archive',async()=>{
  for(const uid of [owner,'non-owner-admin','staff']){
    for(const collectionName of ['paymentArchives','paymentArchiveDetails']){
      const d=db(uid),coll=s.collection(d,collectionName);
      await yes(s.getDoc(s.doc(d,collectionName+'/2026-10')));
      await yes(s.getDocs(s.query(coll,s.orderBy('month','desc'))));
      await yes(s.getDocs(s.query(coll,s.limit(1))));
    }
  }
});
test('STRICT Rules deny disabled and anonymous Archive reads',async()=>{
  for(const d of [db('disabled'),env.unauthenticatedContext().firestore()]){
    await no(s.getDoc(s.doc(d,'paymentArchives/2026-10')));
    await no(s.getDocs(s.collection(d,'paymentArchives')));
  }
});
