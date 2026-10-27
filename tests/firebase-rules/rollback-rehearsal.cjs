'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore,Timestamp}=require('firebase-admin/firestore');
const canonical=v=>v instanceof Timestamp?{$timestamp:[v.seconds,v.nanoseconds]}:Buffer.isBuffer(v)?{$bytes:v.toString('base64')}:Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const revive=v=>v&&v.$timestamp?new Timestamp(...v.$timestamp):v&&v.$bytes?Buffer.from(v.$bytes,'base64'):Array.isArray(v)?v.map(revive):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,revive(x)])):v;
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
async function readAll(db){const out={};async function walk(ref){const snap=await ref.get();for(const d of snap.docs){out[d.ref.path]=d.data();for(const sub of await d.ref.listCollections())await walk(sub)}}for(const ref of await db.listCollections())await walk(ref);return out;}
async function restore(db,data){const current=await readAll(db);const writes=[...Object.keys(current).filter(p=>!(p in data)).map(p=>['delete',p]),...Object.entries(data).map(([p,v])=>['set',p,v])];for(let i=0;i<writes.length;i+=400){const b=db.batch();for(const[op,p,v]of writes.slice(i,i+400)){if(op==='delete')b.delete(db.doc(p));else b.set(db.doc(p),v)}await b.commit()}}
(async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Local Emulator required');
 const source=initializeApp({projectId:'demo-payment-security'},'backup-source'),target=initializeApp({projectId:'demo-payment-rollback-rehearsal'},'rollback-target'),db=getFirestore(target);
 const data=await readAll(getFirestore(source));assert.equal(data['paymentHistorySources2026/raw'].rows.length,812);assert.equal(data['paymentHistorySources2026/clean'].rows.length,812);
 assert(data['cash_control_private/legacy_seed_20261021_v1'].payload);const original=hash(data);
 const privateDir=process.env.PAYMENT_PRIVATE_BACKUP_DIR;if(!privateDir)throw Error('Private backup directory required');fs.mkdirSync(privateDir,{recursive:true});const backupFile=path.join(privateDir,'emulator-backup.json');fs.writeFileSync(backupFile,JSON.stringify(canonical(data)));
 await restore(db,data);assert.equal(hash(await readAll(db)),original);
 await db.doc('payments/unc-e2e-payment').set({amount:-999,paymentMonth:'2026-10',damaged:true});await db.doc('paymentHistorySources2026/raw').delete();await db.doc('rollbackTest/extra').set({synthetic:true});
 assert.notEqual(hash(await readAll(db)),original);
 const fromDisk=revive(JSON.parse(fs.readFileSync(backupFile,'utf8')));await restore(db,fromDisk);const restored=await readAll(db);assert.equal(hash(restored),original);
 const report={pass:true,testedAt:new Date().toISOString(),environment:'127.0.0.1 Firestore Emulator',sourceProject:'demo-payment-security',restoreProject:'demo-payment-rollback-rehearsal',documents:Object.keys(data).length,collections:[...new Set(Object.keys(data).map(p=>p.split('/')[0]))],beforeSHA256:original,afterSHA256:hash(restored),rawRows:restored['paymentHistorySources2026/raw'].rows.length,cleanRows:restored['paymentHistorySources2026/clean'].rows.length,privateCashPayloadExact:true,timestampsPreserved:true,removedTestOnlyExtra:true,productionTouched:false,backupPayloadPackaged:false};
 fs.writeFileSync(path.join(__dirname,'rollback-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await deleteApp(source);await deleteApp(target);
})().catch(e=>{console.error(e);process.exitCode=1});
