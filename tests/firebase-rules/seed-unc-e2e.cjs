const fs=require('node:fs');
const {initializeApp,deleteApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {computeIndexV1}=require('../../backend/payment-index-core.cjs');
(async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Local Emulator required');
 const app=initializeApp({projectId:'demo-payment-security'}),db=getFirestore(app);
 const row={project:'EATON PARK',company:'TEST ONLY COMPANY',contractNo:'UNC-E2E-TEST',ipcNo:'TEST-ONLY',paymentMonth:'2026-10',paymentType:'MEP',amount:1,processActualAmount:1,processPaymentDate:'2026-10-24',contractName:'Synthetic document test only',personInCharge:'Emulator admin',status:'pending',deleted:false};
 await db.collection('payments').doc('unc-e2e-payment').set({...row,...computeIndexV1(row)});
 const html=fs.readFileSync('../../../../work/drive-staging/index.html','utf8');
 const body=html.slice(html.indexOf('function testPdf(version){'),html.indexOf('async function checkBytes'));
 const fn=new Function(body+';return testPdf;')();
 for(const v of [1,2])fs.writeFileSync('../../../../work/UNC_TEST_ONLY_v'+v+'.pdf',Buffer.from(await fn(v).arrayBuffer()));
 await deleteApp(app);console.log('Synthetic UNC fixture only seeded');
})().catch(e=>{console.error(e);process.exitCode=1});
