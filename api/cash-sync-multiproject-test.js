'use strict';
// Isolated TEST-only multiproject Google Sheets connector.
// This is never a production sync endpoint. Real project Sheets are forbidden.
const {readConfig,verifyFirebaseAdminToken,TEST_SPREADSHEET_ID}=
  require('../server/cash-sync-guard.cjs');
const {planTestSync,viewSignature}=
  require('../server/cash-sync-multiproject-write-plan.cjs');
const {runTestOnlySync}=
  require('../server/cash-sync-multiproject-test-runner.cjs');
const {createGoogleTestAdapter}=
  require('../server/cash-sync-multiproject-google-test-adapter.cjs');
function httpError(code,message){const e=new Error(message);e.statusCode=code;throw e}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST')return res.status(405).json({error:'Only POST is supported.'});
  if(!req.headers.host||req.headers.origin!=='https://'+req.headers.host)
    return res.status(403).json({error:'Cross-origin request rejected.'});
  try{
    // No override flag, no production rollout through this route.
    if(process.env.VERCEL_ENV!=='preview')
      httpError(403,'Multi-project connector is TEST Preview only.');
    const config=readConfig(process.env);
    if(config.project!=='cash-control-staging')
      httpError(403,'Only isolated Firebase staging can call this route.');
    await verifyFirebaseAdminToken(String(req.headers['x-firebase-id-token']||''),config);
    const bearer=String(req.headers.authorization||'');
    if(!/^Bearer [A-Za-z0-9._~-]{20,4096}$/.test(bearer))
      httpError(401,'Google OAuth token required.');
    const raw=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!raw||Array.isArray(raw)||typeof raw!=='object'||
      JSON.stringify(raw).length>600000)
      httpError(413,'Invalid/oversized TEST request.');
    const {action,project,history,source,openingBalance}=raw;
    if(!['preview','commit'].includes(action)||
       typeof project!=='string'||project.trim().length<2||project.length>180||
       !Array.isArray(history)||history.length>5000||
       !Array.isArray(source)||source.length>5000)
      httpError(400,'Project/transaction snapshot invalid.');
    // Real Payment completeness is NOT attested here: only synthetic/supplied
    // staging snapshots are accepted. Production Payment cannot be read in Preview.
    if(raw.testDataOnly!==true)
      httpError(403,'Only explicitly labelled TEST data is permitted.');
    const planInput={project,history,source,
      openingBalance:openingBalance??null,
      sourceComplete:true,destinationConfirmed:true};
    const adapter=createGoogleTestAdapter({
      project,accessToken:bearer.slice(7),adminVerified:true,
      recompare:async()=>{
        const remote=await adapter.readSnapshot();
        return planTestSync({...planInput,mirror:remote.mirror,currentView:remote.view,
          expectedViewSignature:remote.view.length?viewSignature(remote.view):null});
      }
    });
    const snapshot=await adapter.readSnapshot();
    const prepared=planTestSync({...planInput,mirror:snapshot.mirror,
      currentView:snapshot.view,
      expectedViewSignature:snapshot.view.length?viewSignature(snapshot.view):null});
    if(action==='preview'){
      // The fingerprints authorize no mutation by themselves.
      return res.status(200).json({mode:'TEST_ONLY',preview:prepared.preview});
    }
    if(raw.confirmTestWrite!==true||
       typeof raw.beforeFingerprint!=='string'||
       typeof raw.afterFingerprint!=='string'||
       prepared.preview.beforeFingerprint!==raw.beforeFingerprint||
       prepared.preview.afterFingerprint!==raw.afterFingerprint)
      httpError(409,'TEST preview changed or Admin did not confirm.');
    const verified=await runTestOnlySync({
      prepared,adapter,explicitAdminConsent:true,
      expectedTestSpreadsheetId:TEST_SPREADSHEET_ID
    });
    return res.status(200).json(verified);
  }catch(error){
    const code=Number(error?.statusCode)||(
      error?.code?.includes('CONFLICT')||error?.code?.includes('CHANGED')||
      error?.code?.includes('VERIFIED')?409:500);
    if([400,401,403,409,413,503].includes(code))
      return res.status(code).json({error:String(error.message).slice(0,240)});
    if(error?.name==='TimeoutError'||error?.name==='AbortError')
      return res.status(504).json({error:'TEST Google Sheets request timed out.'});
    return res.status(500).json({error:'TEST sync blocked; inspect state before retrying.'});
  }
};
