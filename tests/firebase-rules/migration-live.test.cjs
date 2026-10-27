'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
let app,db,source,expectedRows;
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const sha=v=>crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const evidence={projectId:'demo-payment-migration-verification',localEmulatorOnly:true,documents:{}};
function migrate(){return spawnSync(process.execPath,[path.join(__dirname,'../../migration/history-import.cjs'),'--source='+source,'--project=demo-payment-migration-verification','--apply'],{encoding:'utf8',env:{...process.env,NODE_PATH:path.join(__dirname,'node_modules')},timeout:45000});}
test.before(async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Local Emulator required');
 source=process.env.PAYMENT_PRIVATE_SOURCE;if(!source)throw Error('Set PAYMENT_PRIVATE_SOURCE to original private HTML');
 const text=fs.readFileSync(source,'utf8');expectedRows={};
 for(const [id,symbol] of [['raw','HISTORY_2026_EMBEDDED'],['clean','HISTORY_2026_CLEAN_SOURCE']])expectedRows[id]=JSON.parse(text.match(new RegExp('^window\\.'+symbol+'\\s*=\\s*(\\[.*?\\]);','m'))[1]);
 app=initializeApp({projectId:evidence.projectId},'migration-verification');db=getFirestore(app);await db.recursiveDelete(db.collection('paymentHistorySources2026'));
});
test.after(async()=>{fs.writeFileSync(path.join(__dirname,'migration-live-results.json'),JSON.stringify(evidence,null,2));if(app)await deleteApp(app)});
test('write both 812-row sources; independently compare readback rows and SHA-256',async()=>{
 const out=migrate();assert.equal(out.status,0,out.stderr);assert.equal(JSON.parse(out.stdout).created,2);
 const metadata=require('../../security/history2026_metadata.json').documents;
 for(const id of ['raw','clean']){
  const row=(await db.collection('paymentHistorySources2026').doc(id).get()).data();
  assert.equal(row.rowCount,812);assert.equal(row.rows.length,812);assert.equal(row.schemaVersion,1);
  assert.deepEqual(canonical(row.rows),canonical(expectedRows[id]));assert.equal(sha(row.rows),metadata[id].sha256);assert.equal(row.sha256,sha(row.rows));
  evidence.documents[id]={sourceRows:expectedRows[id].length,readbackRows:row.rows.length,sha256:sha(row.rows),contentEqual:true,pass:true};
 }
});
test('rerunning migration is idempotent',()=>{const out=migrate();assert.equal(out.status,0,out.stderr);assert.equal(JSON.parse(out.stdout).created,0);evidence.idempotent=true});
test('tampered existing document aborts without changing either source',async()=>{
 const ref=db.collection('paymentHistorySources2026').doc('raw');await ref.update({rowCount:811});
 const before=(await db.collection('paymentHistorySources2026').get()).docs.map(x=>[x.id,x.data()]);
 const out=migrate();assert.notEqual(out.status,0);assert.match(out.stderr,/No overwrite performed/);
 const after=(await db.collection('paymentHistorySources2026').get()).docs.map(x=>[x.id,x.data()]);assert.deepEqual(after,before);
 await ref.update({rowCount:812});evidence.noOverwriteOnConflict=true;
});
