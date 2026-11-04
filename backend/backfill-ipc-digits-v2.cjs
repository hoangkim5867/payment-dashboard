'use strict';
// V2-only, bounded, READ-ONLY by default. Never run from the website.
// Does not activate systemConfig/paymentLookupV2 or alter business fields.
const {initializeApp,applicationDefault}=require('firebase-admin/app');
const {getFirestore,FieldPath}=require('firebase-admin/firestore');
const {readOptions}=require('./index-migration-core.cjs');
const {ipcDigitsV2}=require('./payment-index-v2-core.cjs');
const cfg=readOptions(process.argv.slice(2),process.env);
initializeApp(cfg.emulator?{projectId:cfg.projectId}:{credential:applicationDefault(),projectId:cfg.projectId});
function inspect(row){
 const value=row?.ipcNo;
 // Ensure the production Rules can reproduce every indexed field exactly.
 if(value!==undefined&&value!==null&&typeof value!=='string')
   return {ok:false,reason:'non_text_ipc'};
 const expected=ipcDigitsV2(value);
 return {ok:true,expected,needsRepair:row?.ipcDigitsV2!==expected};
}
(async()=>{
 const col=getFirestore().collection('payments');
 let inspected=0,mismatch=0,updated=0,invalid=0,errors=0;
 let cursor=cfg.startAfter;
 const report=reachedEnd=>{
   console.log(JSON.stringify({projectId:cfg.projectId,mode:cfg.write?'WRITE':'AUDIT',
     inspected,mismatch,updated,invalid,errors,reachedEnd,nextAfter:reachedEnd?null:cursor,
     onlyFieldChanged:'ipcDigitsV2',markerActivated:false},null,2));
   if(invalid||errors)process.exitCode=2;
 };
 while(inspected<cfg.maxDocs){
  const requested=Math.min(50,cfg.maxDocs-inspected);
  let q=col.orderBy(FieldPath.documentId()).limit(requested);
  if(cursor)q=q.startAfter(cursor);
  const snap=await q.get();
  if(snap.empty){report(true);return;}
  for(const document of snap.docs){
   const checked=inspect(document.data());inspected++;
   if(!checked.ok){invalid++;cursor=document.id;continue;}
   if(checked.needsRepair){
    mismatch++;
    if(cfg.write)try{
     const changed=await getFirestore().runTransaction(async tx=>{
      const current=await tx.get(document.ref);
      if(!current.exists)return false;
      const validated=inspect(current.data());
      if(!validated.ok)throw Error('Invalid current IPC data');
      if(!validated.needsRepair)return false;
      tx.update(document.ref,{ipcDigitsV2:validated.expected});
      return true;
     },{maxAttempts:3});
     if(changed)updated++;
    }catch(e){errors++;throw Error('Stopped before cursor advancement: '+String(e.code||e.message||'error'));}
   }
   cursor=document.id;
   if(cfg.write&&updated>=cfg.maxWrites)break;
  }
  if(cfg.write&&updated>=cfg.maxWrites)break;
  if(snap.size<requested){report(true);return;}
 }
 report(false);
})().catch(e=>{console.error('V2_MIGRATION_STOPPED',e.message);process.exitCode=1;});
