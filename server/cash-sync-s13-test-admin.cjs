'use strict';
/* S13-only TEST Admin authorization: signed staging Firebase JWT +
 * current protected authUsers/{uid}. Separate from production Admin gate.
 * No credentials stored; no Payment collection reads.
 */
const {verifyFirebaseAdminToken}=require('./cash-sync-guard.cjs');
function fail(message,statusCode=403){
 throw Object.assign(new Error(message),{statusCode});
}
function readStagingProject(env){
 if(env.VERCEL_ENV!=='preview')fail('S13 TEST chỉ hoạt động trên Preview.');
 let cfg;
 try{cfg=JSON.parse(env.PAYMENT_FIREBASE_STAGING_CONFIG||'null')}catch{}
 if(!cfg||typeof cfg.projectId!=='string'||
    !/^[a-z0-9-]*staging[a-z0-9-]*$/.test(cfg.projectId)||
    cfg.projectId==='cscecmep-payment'||cfg.authDomain!==cfg.projectId+'.firebaseapp.com')
  fail('Firebase staging chưa được cấu hình an toàn.',503);
 return cfg.projectId;
}
async function verifyTestAdmin(jwt,env,{fetcher=fetch,verifyToken=verifyFirebaseAdminToken}={}){
 const project=readStagingProject(env);
 if(typeof jwt!=='string'||jwt.length<100||jwt.length>8192)fail('Thiếu Firebase Admin session.');
 const parts=jwt.split('.');if(parts.length!==3)fail('Firebase token không hợp lệ.');
 let body;
 try{body=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'))}catch{fail('Firebase token không hợp lệ.')}
 const uid=body?.sub;
 if(typeof uid!=='string'||!/^[A-Za-z0-9_-]{4,128}$/.test(uid))
  fail('Firebase UID không hợp lệ.');
 // verifyToken verifies issuer, audience, expiry AND Google-signed RS256 JWT.
 await verifyToken(jwt,{project,uid});
 const url='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(project)+
  '/databases/(default)/documents/authUsers/'+encodeURIComponent(uid);
 let res;
 try{res=await fetcher(url,{headers:{Authorization:'Bearer '+jwt},signal:AbortSignal.timeout(8000)});}
 catch{fail('Không xác minh được quyền Admin staging.');}
 if(!res.ok)fail('Không đọc được vai trò Admin staging. Không cấp phép ghi.');
 const profile=await res.json().catch(()=>null);
 if(profile?.fields?.role?.stringValue?.toLowerCase()!=='admin')
  fail('Tài khoản staging không có vai trò Admin.');
 return {project,uid,role:'admin'};
}
module.exports={readStagingProject,verifyTestAdmin};
