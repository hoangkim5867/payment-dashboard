'use strict';
// DRY-RUN BY DEFAULT. Never imports user data or logs financial rows.
const {initializeApp,applicationDefault}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {computeIndexV1,needsIndexRepair}=require('./payment-index-core.cjs');
const args=new Set(process.argv.slice(2));
const projectId=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT||'';
if(!projectId)throw new Error('Set GOOGLE_CLOUD_PROJECT explicitly');
const write=args.has('--write');
if(projectId.startsWith('demo-') && !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'')) {
  throw new Error('demo-* requires an explicit local Firestore Emulator');
}
if(write && !projectId.startsWith('demo-') && !(args.has('--production-approved') && process.env.PAYMENT_PRODUCTION_APPROVED==='YES')) {
  throw new Error('Production write blocked. Requires explicit approval and safety preflight.');
}
if(args.has('--mark-ready') && !write)throw new Error('--mark-ready requires --write');
initializeApp(process.env.FIRESTORE_EMULATOR_HOST?{projectId}:{credential:applicationDefault(),projectId});
(async()=>{
  const db=getFirestore(); const col=db.collection('payments');
  let cursor=null; let total=0;let mismatched=0; let written=0;let oversized=0;
  while(true){
    let q=col.orderBy('__name__').limit(150);
    if(cursor)q=q.startAfter(cursor);
    const snap=await q.get();
    if(snap.empty)break;
    let batch=db.batch();let pending=0;
    for(const d of snap.docs){
      total++;
      const row=d.data();
      const fields=computeIndexV1(row);
      if(Buffer.byteLength(fields.duplicateKeyV1,"utf8")>1000)oversized++;
      if(!needsIndexRepair(row))continue;
      mismatched++;
      if(write){batch.update(d.ref,fields);pending++;}
    }
    if(write && pending){await batch.commit();written+=pending;}
    cursor=snap.docs.at(-1);
    if(snap.size<150)break;
  }
  console.log(JSON.stringify({projectId,write,total,mismatched,written,oversized},null,2));
  if(args.has('--mark-ready')){
    if(oversized)throw new Error('Cannot activate: keys over safe size');
    // Backfill alone cannot prove ongoing triggers or other writers safe.
    // Activation is never automatic in this tool.
    throw new Error('NOT ACTIVATED: verify maintenance trigger, competing writer paths, and perform a second clean audit first. Set marker manually after approval.');
  }
})().catch(e=>{console.error('ERROR',e.message);process.exitCode=1;});
