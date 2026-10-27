const fs=require('node:fs'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app');const {getFirestore}=require('firebase-admin/firestore');
(async()=>{
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Local Emulator required');
 const app=initializeApp({projectId:'demo-payment-security'}),db=getFirestore(app);
 const p=(await db.doc('payments/unc-e2e-payment').get()).data(),a=(await db.doc('paymentArchives/2026-10').get()).data(),d=(await db.doc('paymentArchiveDetails/2026-10').get()).data();
 assert(p.uncDriveFileId);assert(p.archived);assert(a.excelDriveFileId);assert.equal(d.rows.length,1);
 const result={testedAt:new Date().toISOString(),environment:'demo-payment-security Emulator',payment:p,archive:a,details:d};
 const file='UNC_APP_E2E_'+(process.argv[2]||'before')+'.json';fs.writeFileSync(file,JSON.stringify(result,null,2));
 if(process.argv[2]==='after'){const old=JSON.parse(fs.readFileSync('UNC_APP_E2E_before.json'));assert.equal(p.uncDriveFileId,old.payment.uncDriveFileId);assert.equal(a.excelDriveFileId,old.archive.excelDriveFileId);assert.notDeepEqual(p.uncUploadedAt,old.payment.uncUploadedAt);assert.notDeepEqual(a.updatedAt,old.archive.updatedAt);assert.equal(d.rows[0].uncFileId,p.uncDriveFileId);console.log('PASS same UNC ID and archive workbook ID after replacement; one archived row preserved');}
 console.log(JSON.stringify({file,unc:p.uncDriveFileId,workbook:a.excelDriveFileId,rows:d.rows.length,detailUNC:d.rows[0].uncUrl||d.rows[0].uncDriveFileId}));await deleteApp(app);
})().catch(e=>{console.error(e);process.exitCode=1});
