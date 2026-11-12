'use strict';
// Configuration-only TEST readiness. Does not inspect documents, contact Google,
// acquire locks, perform writes or disclose configured IDs and secrets.
const {readTargets}=require('../server/cash-shared-test-targets.cjs');
function inspect(env={}){
  const checks={
    previewOnly:env.VERCEL_ENV==='preview',
    stagingFirebase:/staging/.test(String(env.CASH_SYNC_FIREBASE_PROJECT_ID||''))&&
      env.CASH_SYNC_FIREBASE_PROJECT_ID!=='cscecmep-payment',
    adminConfigured:/^[A-Za-z0-9_-]{4,128}$/.test(String(env.CASH_SYNC_ADMIN_UID||'')),
    googleTestTargets:false,
    lockRulesConfirmed:env.CASH_SYNC_MULTI_TEST_LOCK_RULES_VERIFIED==='YES',
    trustedSourceLoader:false
  };
  let projects=0;
  if(checks.previewOnly&&checks.stagingFirebase){
    try{projects=readTargets(env).size;checks.googleTestTargets=projects>0}
    catch{/* no configuration info is returned */}
  }
  // Important: trusted loader is not implemented, so no env flag can claim it.
  const required=Object.entries(checks).filter(([,value])=>!value).map(([name])=>name);
  return Object.freeze({mode:'TEST_CONFIGURATION_ONLY',canWrite:false,
    googleReads:0,firestoreReads:0,writes:0,checkedProjects:projects,
    checks,missing:required});
}
module.exports={inspect};
