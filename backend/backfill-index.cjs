'use strict';
// Manual, one-off index migration. NEVER invoked by the Payment website.
// No production reads/writes occur just by deploying this source file.
// Default is a bounded, read-only audit of 120 docs. Never activates marker.
const {initializeApp,applicationDefault}=require('firebase-admin/app');
const {getFirestore,FieldPath}=require('firebase-admin/firestore');
const {readOptions,inspectPayment}=require('./index-migration-core.cjs');
const cfg=readOptions(process.argv.slice(2),process.env);
initializeApp(cfg.emulator?{projectId:cfg.projectId}:{credential:applicationDefault(),projectId:cfg.projectId});
(async()=>{
  const db=getFirestore(),col=db.collection('payments');
  let inspected=0,mismatch=0,updated=0,alreadyFixed=0,invalid=0,errors=0;
  let cursor=cfg.startAfter;
  // A page of IDs is read only once. Every WRITE re-reads the *current*
  // document in a transaction, preventing stale derived keys when people
  // update Payment at the same time. Only index fields can be modified.
  while(inspected<cfg.maxDocs){
    let q=col.orderBy(FieldPath.documentId()).limit(Math.min(50,cfg.maxDocs-inspected));
    if(cursor)q=q.startAfter(cursor);
    const snap=await q.get();
    if(snap.empty){
      const result={projectId:cfg.projectId,mode:cfg.write?'WRITE':'AUDIT',
        inspected,mismatch,updated,alreadyFixed,invalid,errors,
        reachedEnd:true,nextAfter:null,markerActivated:false};
      console.log(JSON.stringify(result,null,2));return;
    }
    for(const doc of snap.docs){
      const current=inspectPayment(doc.data());
      inspected++;
      if(!current.ok){invalid++;errors++;cursor=doc.id;continue;}
      if(current.needsRepair){
        mismatch++;
        if(cfg.write){
          try{
            const result=await db.runTransaction(async tx=>{
              const fresh=await tx.get(doc.ref);
              if(!fresh.exists())return 'missing';
              const now=inspectPayment(fresh.data());
              if(!now.ok)throw new Error('Invalid lookup key in concurrent Payment document');
              if(!now.needsRepair)return 'already';
              tx.update(doc.ref,now.fields);return 'updated';
            },{maxAttempts:3});
            if(result==='updated')updated++;
            if(result==='already')alreadyFixed++;
          }catch(e){
            errors++;
            // A failed write must not silently advance the cursor past
            // an unprocessed document. Caller retries this ID safely.
            throw new Error('Index migration stopped before Payment '+doc.id+
              '. Re-run with --start-after='+JSON.stringify(cursor||'')+
              '. '+(e?.code||e?.message||'transaction failed'));
          }
        }
      }
      cursor=doc.id;
      if(cfg.write && updated>=cfg.maxWrites)break;
    }
    if(cfg.write && updated>=cfg.maxWrites)break;
    if(snap.size<Math.min(50,cfg.maxDocs-inspected+snap.size))break;
  }
  // A cursor is emitted even if this was the last page. The next bounded
  // invocation will confirm an empty final page. No unbounded reads.
  console.log(JSON.stringify({projectId:cfg.projectId,mode:cfg.write?'WRITE':'AUDIT',
    inspected,mismatch,updated,alreadyFixed,invalid,errors,
    reachedEnd:false,nextAfter:cursor,markerActivated:false},null,2));
  if(invalid||errors)process.exitCode=2;
})().catch(e=>{console.error('INDEX_MIGRATION_STOPPED',e.message);process.exitCode=1;});
