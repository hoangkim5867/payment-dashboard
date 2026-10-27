'use strict';
/*
  Private migration tool. NO financial records are bundled with the public site.
  Uses the operator's ORIGINAL PRIVATE HTML file as input; does not output rows.
  Dry run by default. --apply can write only to a Firestore Emulator unless
  explicit production approval plus application default credentials are supplied.
  Never overwrite an existing history document if its checksum differs.
*/
const fs=require('fs');
const crypto=require('crypto');
const path=require('path');
const args=process.argv.slice(2);
function opt(prefix){const val=args.find(a=>a.startsWith(prefix+'='));return val?val.slice(prefix.length+1):null;}
const source=opt('--source');
if(!source)throw new Error('Usage: node history-import.cjs --source=/PRIVATE/path/payment.html [--apply --project=demo-payment-index]');
const projectId=opt('--project') || process.env.GOOGLE_CLOUD_PROJECT || '';
const write=args.includes('--apply');
const productionApproved=args.includes('--production-approved') && process.env.PAYMENT_PRODUCTION_APPROVED==='YES';
const emulator=!!process.env.FIRESTORE_EMULATOR_HOST;
if(emulator && !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST))throw new Error('Only a local Firestore Emulator is accepted.');
if(write && !emulator && !productionApproved)throw new Error('Production writes forbidden: requires --production-approved + PAYMENT_PRODUCTION_APPROVED=YES');
if(write && !projectId)throw new Error('Specify --project.');
if(write && projectId.startsWith('demo-') && !emulator)throw new Error('demo-* requires a Firestore emulator.');
if(write && emulator && !projectId.startsWith('demo-'))throw new Error('Use a demo-* project ID with the emulator to avoid confusion with production.');
const sourceText=fs.readFileSync(path.resolve(source),'utf8');
function readRows(symbol){
 const match=sourceText.match(new RegExp('^window\\.'+symbol+'\\s*=\\s*(\\[.*?\\]);','m'));
 if(!match)throw new Error('Original source missing '+symbol);
 const rows=JSON.parse(match[1]);
 if(!Array.isArray(rows)||rows.length!==812)throw new Error('Invalid historical record count');
 return rows;
}
const docs={raw:readRows('HISTORY_2026_EMBEDDED'),clean:readRows('HISTORY_2026_CLEAN_SOURCE')};
const expected=require('../security/history2026_metadata.json').documents;
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
function hash(rows){return crypto.createHash('sha256').update(JSON.stringify(canonical(rows))).digest('hex');}
for(const [id,rows] of Object.entries(docs)){
 if(hash(rows)!==expected[id].sha256)throw new Error('Checksum mismatch with audited source '+id);
}
async function run(){
 const metadata={projectId:projectId || '(none)',write,emulator,historyDocumentCount:2,rawRows:812,cleanRows:812,
   checksumsValid:true};
 if(!write){console.log(JSON.stringify(metadata,null,2));return;}
 const {initializeApp,applicationDefault}=require('firebase-admin/app');
 const {getFirestore}=require('firebase-admin/firestore');
 initializeApp(emulator?{projectId}:{projectId,credential:applicationDefault()});
 const db=getFirestore();
 const col=db.collection('paymentHistorySources2026');
 const batch=db.batch(); let createCount=0;
 for(const [id,rows] of Object.entries(docs)){
  const ref=col.doc(id),snap=await ref.get();
  if(snap.exists){
   const data=snap.data();
   if(data.schemaVersion!==1 || data.sha256!==expected[id].sha256 || data.rowCount!==812 || !Array.isArray(data.rows) || data.rows.length!==812 || hash(data.rows)!==data.sha256){
    throw new Error('ABORT: existing '+id+' document differs. No overwrite performed.');
   }
   continue;
  }
  batch.create(ref,{schemaVersion:1,rowCount:812,sha256:expected[id].sha256,rows}); createCount++;
 }
 if(createCount)await batch.commit();
 for(const [id] of Object.entries(docs)){
  const snap=await col.doc(id).get(); if(!snap.exists || snap.data().schemaVersion!==1 || snap.data().rowCount!==812 || !Array.isArray(snap.data().rows) || snap.data().rows.length!==812 || snap.data().sha256!==expected[id].sha256 || hash(snap.data().rows)!==expected[id].sha256 || JSON.stringify(canonical(snap.data().rows))!==JSON.stringify(canonical(docs[id])))
   throw new Error('Readback verification failed: '+id);
 }
 console.log(JSON.stringify({...metadata,created:createCount,verified:true},null,2));
}
run().catch(e=>{console.error('HISTORY MIGRATION ERROR: '+e.message); process.exitCode=1;});
