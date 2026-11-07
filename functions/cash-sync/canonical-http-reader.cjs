'use strict';
/*
 * Authenticated TEST → PRODUCTION canonical source reader.
 * Source endpoint must be IAM PRIVATE on the production Firebase project.
 * This adapter NEVER supplies a Firebase user token, client secret, or
 * service-account JSON key, and cannot fetch any arbitrary URL.
 */
const {validRow}=require('./three-way.cjs');
const PROJECT='PHU HUNG';
const PROD='cscecmep-payment';
const STAGE='cash-control-staging';
const MAX_ROWS=10000;
function sourceGate(env){
  if((env?.GCLOUD_PROJECT||env?.GCP_PROJECT)!==STAGE||
     env?.CASH_SHEETS_SOURCE_READ_ENABLED!=='YES')
    throw Error('Authorized staging canonical source access is OFF.');
  if(env?.CASH_SHEETS_SOURCE_PROJECT!==PROD)
    throw Error('Unapproved Firebase source project.');
  const target=String(env?.CASH_SHEETS_PRODUCTION_SOURCE_URL||'');
  let url;
  try{url=new URL(target)}catch{throw Error('Invalid approved private source URL.')}
  if(url.protocol!=='https:'||url.username||url.password||
     url.port||url.hash||url.search||
     !(/\.a\.run\.app$/.test(url.hostname)||
       /\.cloudfunctions\.net$/.test(url.hostname))||
     !['/','/readPhuHungCanonicalSource'].includes(url.pathname))
    throw Error('Source must be a direct IAM-private Google Cloud endpoint.');
  return url.href;
}
function assertCanonical(response,requestedMonth){
  if(response?.schemaVersion!==1||response.project!==PROJECT||
     response.month!==requestedMonth||
     response.sourceComplete!==true||
     response.authoritative!==true||
     response.sourceProofKind!=='consistent-production-transaction'||
     !/^[0-9a-f]{64}$/.test(String(response.sourceProof||''))||
     !Array.isArray(response.rows)||response.rows.length>MAX_ROWS||
     response.sourceRowCount!==response.rows.length)
    throw Error('Canonical production source lacks verified completeness.');
  const ids=new Set();
  const rows=response.rows.map(item=>{
    const row=validRow(item);
    if(row.month!==requestedMonth||ids.has(row.id))
      throw Error('Invalid source month or repeated source identity.');
    ids.add(row.id);
    return row;
  });
  return {project:PROJECT,month:requestedMonth,rows,
    proof:response.sourceProof,sourceComplete:true,authoritative:true};
}
function createCanonicalHttpReader({env,post}={}){
  const target=sourceGate(env);
  if(typeof post!=='function')throw Error('IAM-authenticated production request missing.');
  return async (month)=>{
    if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(String(month||''))||month<'2026-10')
      throw Error('Unapproved PHU HUNG month.');
    const data=await post(target,{project:PROJECT,month});
    // GoogleAuth client.request() returns {data}; tests may supply raw data.
    const result=data?.data??data;
    return assertCanonical(result,month);
  };
}
async function createAdcCanonicalReader(env=process.env){
  const target=sourceGate(env);
  const {GoogleAuth}=require('google-auth-library');
  const auth=new GoogleAuth();
  const client=await auth.getIdTokenClient(target);
  return createCanonicalHttpReader({env,post:async(url,payload)=>{
    const r=await client.request({url,method:'POST',data:payload,
      headers:{'Content-Type':'application/json'},timeout:15000});
    return r.data;
  }});
}
module.exports={PROJECT,PROD,STAGE,MAX_ROWS,sourceGate,
  assertCanonical,createCanonicalHttpReader,createAdcCanonicalReader};
