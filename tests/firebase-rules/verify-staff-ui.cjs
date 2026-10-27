const fs=require('node:fs'),assert=require('node:assert/strict');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore');
const {computeIndexV1}=require('../../backend/payment-index-core.cjs');
(async()=>{if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')throw Error('Local Emulator required');
 const app=initializeApp({projectId:'demo-payment-security'}),db=getFirestore(app),snap=await db.collection('payments').where('createdByUid','==','ui-staff').get();
 const rows=snap.docs.filter(d=>d.data().contractNo==='MEP999').map(d=>({id:d.id,...d.data()}));
 const file='STAFF_UI_IMPORT_RESULT.json';
 if(process.argv[2]==='undo'){assert.equal(rows.length,0);const prior=JSON.parse(fs.readFileSync(file));prior.undo={pass:true,remainingRows:0,testedAt:new Date().toISOString()};fs.writeFileSync(file,JSON.stringify(prior,null,2));}
 else{assert.equal(rows.length,1);const row=rows[0];assert.equal(row.amount,500);for(const[k,v]of Object.entries(computeIndexV1(row)))assert.equal(row[k],v);assert(row.importBatchId);fs.writeFileSync(file,JSON.stringify({pass:true,testedAt:new Date().toISOString(),environment:'demo-payment-security Emulator',creator:row.createdByUid,rows:1,amount:500,indexCorrect:true,importBatchId:row.importBatchId},null,2));}
 await deleteApp(app);console.log('PASS Staff actual UI '+process.argv[2]+' server readback');
})().catch(e=>{console.error(e);process.exitCode=1});
