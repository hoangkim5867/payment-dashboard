'use strict';
/* Single-purpose, TEST-only Google Sheets write relay.
 * Never operates on the PHU HUNG historical tab or production spreadsheets.
 * All mutations require verified Firebase ID token + configured Admin UID.
 */
const {TEST_SPREADSHEET_ID,readConfig,verifyFirebaseAdminToken,validateWrite}=
  require('../server/cash-sync-guard.cjs');

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST')return res.status(405).json({error:'Only POST is supported.'});
  const origin=String(req.headers.origin||'');
  const host=String(req.headers.host||'');
  if(!host||origin!=='https://'+host)
    return res.status(403).json({error:'Cross-origin request rejected.'});
  try{
    const config=readConfig(process.env);
    const firebaseJwt=String(req.headers['x-firebase-id-token']||'');
    await verifyFirebaseAdminToken(firebaseJwt,config);
    const bearer=String(req.headers.authorization||'');
    if(!/^Bearer [A-Za-z0-9._~-]{20,4096}$/.test(bearer))
      return res.status(401).json({error:'Google OAuth token required.'});
    let payload=req.body;
    if(typeof payload==='string')payload=JSON.parse(payload);
    if(!payload||Array.isArray(payload)||typeof payload!=='object'||
       JSON.stringify(payload).length>600000)
      return res.status(413).json({error:'Request is too large or invalid.'});
    const {method,path,body}=payload;
    validateWrite(method,path,body,config.project);
    const googleAuth={Authorization:bearer};
    // Independent server-side check of spreadsheet ID/title and historical tab.
    // The ID is a constant, never taken from client input.
    const base='https://sheets.googleapis.com/v4/spreadsheets/'+TEST_SPREADSHEET_ID;
    const metadata=await fetch(base+'?fields=spreadsheetId,properties(title),sheets(properties(title))',{
      headers:googleAuth,signal:AbortSignal.timeout(9000)
    });
    if(!metadata.ok)
      return res.status(502).json({error:'Cannot verify TEST spreadsheet access.'});
    const info=await metadata.json();
    if(info.spreadsheetId!==TEST_SPREADSHEET_ID||
       !/TEST/i.test(info.properties?.title||'')||
       !info.sheets?.some(x=>x.properties?.title==='PHU HUNG'))
      return res.status(403).json({error:'Not the allowlisted PHU HUNG TEST copy.'});
    const response=await fetch(base+path,{
      method,headers:{...googleAuth,'Content-Type':'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
    });
    const json=await response.json().catch(()=>({}));
    // Never echo credentials. Existing UI handles Sheets-specific status.
    return res.status(response.status).json(json);
  }catch(error){
    const code=Number(error?.statusCode)||500;
    if(code===403||code===503)
      return res.status(code).json({error:error.message});
    if(error?.name==='AbortError'||error?.name==='TimeoutError')
      return res.status(504).json({error:'Google authorization/write request timed out.'});
    // Reject malformed requests and unexpected upstream failures without logs
    // containing tokens, spreadsheet content, or personal finance data.
    return res.status(500).json({error:'Cash Sync server authorization or write failed.'});
  }
};
