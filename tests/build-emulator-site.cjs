'use strict';
// Generates an isolated local-only copy. Never deploy this directory.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const source=path.resolve(__dirname,'../site'),target=path.resolve(__dirname,'../../emulator-site');
fs.cpSync(source,target,{recursive:true});
const js=path.join(target,'assets/js');fs.mkdirSync(js,{recursive:true});
for(const version of ['10.12.2','12.0.0']){
 const base=`https://www.gstatic.com/firebasejs/${version}/`;
 fs.writeFileSync(path.join(js,`emulator-auth-${version}.mjs`),`export * from '${base}firebase-auth.js';
 import * as sdk from '${base}firebase-auth.js';
 const connected=new WeakSet();
 export function getAuth(app){if(app.options.projectId!=='demo-payment-security')throw Error('Local demo required');const auth=sdk.getAuth(app);if(!connected.has(auth)){sdk.connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});connected.add(auth);}return auth;}`);
 fs.writeFileSync(path.join(js,`emulator-firestore-${version}.mjs`),`export * from '${base}firebase-firestore.js';
 import * as sdk from '${base}firebase-firestore.js';
 const connected=new WeakSet();
 export function getFirestore(app){if(app.options.projectId!=='demo-payment-security')throw Error('Local demo required');const db=sdk.getFirestore(app);if(!connected.has(db)){sdk.connectFirestoreEmulator(db,'127.0.0.1',8080);connected.add(db);}return db;}`);
}
for(const name of fs.readdirSync(target).filter(x=>x.endsWith('.html'))){
 const file=path.join(target,name);let text=fs.readFileSync(file,'utf8');
 text=text.replaceAll('cscecmep-payment','demo-payment-security').replaceAll('AIzaSyCApKWORskui_858na0gqnxh3UPzg0mvgE','demo-api-key');
 // Only the discarded localhost fixture uses an empty synthetic legacy history.
 // Production HTML and its protected seed checksum are NEVER touched.
 if(name==='cash-control.html'){
   const empty={LEGACY_SALARY:[],LEGACY_FINANCE:[],LEGACY_VNB:[],LEGACY_CASH_SPECIAL:[]};
   const digest=createHash('sha256').update(JSON.stringify(empty)).digest('hex');
   text=text.replace(/const CASH_SEED_HASH="[a-f0-9]{64}";/,'const CASH_SEED_HASH="'+digest+'";');
 }
 for(const version of ['10.12.2','12.0.0'])text=text.replaceAll(`https://www.gstatic.com/firebasejs/${version}/firebase-auth.js`,`./assets/js/emulator-auth-${version}.mjs`).replaceAll(`https://www.gstatic.com/firebasejs/${version}/firebase-firestore.js`,`./assets/js/emulator-firestore-${version}.mjs`);
 fs.writeFileSync(file,text);
}
const adapter=path.join(js,'firestore-payment.mjs');fs.writeFileSync(adapter,fs.readFileSync(adapter,'utf8').replaceAll('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js','./emulator-firestore-10.12.2.mjs'));
console.log('Generated local-only emulator site; project demo-payment-security');
