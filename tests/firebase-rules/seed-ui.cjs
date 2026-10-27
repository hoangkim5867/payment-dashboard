'use strict';
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore'),{getAuth}=require('firebase-admin/auth');
const {computeIndexV1}=require('../../backend/payment-index-core.cjs');
(async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')throw Error('Both local Emulators required');
 const app=initializeApp({projectId:'demo-payment-security'}),db=getFirestore(app),auth=getAuth(app);
 for(const [uid,email,role] of [['HTx2QuATHxh8zgAawwreg88w65M2','lehoangoanh@cscecmep.internal','admin'],['ui-staff','teststaff@cscecmep.internal','staff']]){
  try{await auth.createUser({uid,email,password:'EmulatorOnly123!',displayName:'Emulator '+role,emailVerified:role!=='admin'})}catch(e){if(e.code!=='auth/uid-already-exists'&&e.code!=='auth/email-already-exists')throw e;await auth.updateUser(uid,{email,emailVerified:role!=='admin'})}
  await db.collection('authUsers').doc(uid).set({role,displayName:'Emulator '+role,email,username:role});
 }
 const historyApp=initializeApp({projectId:'demo-payment-migration'},'source');
 for(const id of ['raw','clean']){const snap=await getFirestore(historyApp).collection('paymentHistorySources2026').doc(id).get();if(!snap.exists||snap.data().rows.length!==812)throw Error('Run migration first');await db.collection('paymentHistorySources2026').doc(id).set(snap.data());}
 await db.collection('systemConfig').doc('paymentLookupV1').set({ready:false,schemaVersion:1});
 await db.collection('contracts').doc('emulator-contract').set({project:'EATON PARK',contractNo:'MEP999',company:'EMULATOR COMPANY',contractName:'Emulator import',bankAccount:'123456789',costType:'OTH',contractType:'OTH',personInCharge:'Emulator staff'});
 const archived={project:'EATON PARK',company:'EMULATOR COMPANY',contractNo:'TEST-ARCHIVE',contractName:'Synthetic archive',ipcNo:'ARCHIVE-IPC',actualAmount:1000,paymentDate:'2026-09-23',searchText:'emulator company test-archive archive-ipc 1000'};
 await db.collection('paymentArchives').doc('2026-09').set({month:'2026-09',count:1,totalPaid:1000,companyIndex:[archived],companyIndexVersion:2});
 await db.collection('paymentArchiveDetails').doc('2026-09').set({month:'2026-09',rows:[archived]});
 if(process.env.PAYMENT_PRIVATE_CASH_SEED){
  const seed=JSON.parse(require('node:fs').readFileSync(process.env.PAYMENT_PRIVATE_CASH_SEED,'utf8'));
  const hash=require('node:crypto').createHash('sha256').update(seed.payload).digest('hex');
  if(hash!=='c1a3fdf298b2b5cbec9dd293fa5a199a3cee086fbe35984b0bebbdc8b9b58f12'||seed.sha256!==hash)throw Error('Cash seed mismatch');
  await db.collection('cash_control_private').doc('legacy_seed_20261021_v1').set(seed);
  const back=(await db.collection('cash_control_private').doc('legacy_seed_20261021_v1').get()).data();
  if(back.payload!==seed.payload)throw Error('Cash seed readback mismatch');
 }
 for(let i=0;i<3;i++){
  const row={project:'EATON PARK',company:'EMULATOR COMPANY',contractNo:'TEST-MEP001',ipcNo:'TEST-IPC'+i,paymentMonth:'2026-10',paymentType:'MEP',amount:1000+i,contractName:'Emulator only',personInCharge:'Emulator staff',status:'pending',deleted:false};
  await db.collection('payments').doc('ui-payment-'+i).set({...row,...computeIndexV1(row)});
 }
 await deleteApp(historyApp);await deleteApp(app);console.log('Local UI fixtures seeded; history copied only between Emulator demo projects');
})().catch(e=>{console.error(e.message);process.exitCode=1});
