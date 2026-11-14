'use strict';
/*
 * Production-only, manual, read-only source preflight.
 *
 * Deployment is deliberately NOT enabled in Preview. No Google access,
 * no Payment document list reads and no Firestore writes. One Admin-initiated
 * document GET OR one project-scoped aggregation query per request.
 * This endpoint does not authorize Cash Control -> Google sync.
 */
const {verifyFirebaseAdminToken}=require('../server/cash-sync-guard.cjs');
const FIREBASE='cscecmep-payment';
const HOST='https://firestore.googleapis.com/v1/projects/'+FIREBASE+
  '/databases/(default)/documents';
const DATA_PATH='/cash_control_private/lehoangoanh';
const ACTIONS=new Set(['metadata','project_count']);
function stop(code,statusCode=409){throw Object.assign(new Error(code),{statusCode});}
function checkedConfig(env){
  if(!env||env.VERCEL_ENV!=='production'||
     env.CASH_SYNC_FIREBASE_PROJECT_ID!==FIREBASE)
    stop('PRODUCTION_FIREBASE_AUTH_REQUIRED',403);
  const uid=String(env.CASH_SYNC_ADMIN_UID||'');
  if(!/^[A-Za-z0-9_-]{4,128}$/.test(uid))
    stop('TRUSTED_ADMIN_UID_NOT_CONFIGURED',503);
  return {project:FIREBASE,uid};
}
function validateRequest(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||
    JSON.stringify(payload).length>1000||!ACTIONS.has(payload.action))
    stop('INVALID_SOURCE_ACTION',400);
  if(payload.action==='metadata'){
    if(Object.keys(payload).sort().join(',')!=='action')
      stop('UNEXPECTED_SOURCE_FIELDS',400);
    return {action:'metadata'};
  }
  if(Object.keys(payload).sort().join(',')!=='action,project'||
     typeof payload.project!=='string'||payload.project!==payload.project.trim()||
     !/^[\p{L}\p{N}][\p{L}\p{N} ._+()\-/]{0,119}$/u.test(payload.project))
    stop('INVALID_PROJECT_SCOPE',400);
  return {action:'project_count',project:payload.project};
}
function firestoreArray(field){
  // Firestore REST represents an empty arrayValue as {} (without values).
  // That is a valid empty array, not a missing or broken source field.
  if(!field||typeof field!=='object'||!field.arrayValue||
     typeof field.arrayValue!=='object')return null;
  const value=field.arrayValue.values;
  if(value===undefined)return [];
  return Array.isArray(value)?value:null;
}
function fieldString(field){
  return typeof field?.stringValue==='string'?field.stringValue:null;
}
function fieldNumber(field){
  const value=field?.integerValue??field?.doubleValue;
  const parsed=Number(value);
  return value!==undefined&&Number.isFinite(parsed)?parsed:null;
}
function cashMetadata(record){
  if(!record||!record.fields||typeof record.fields!=='object')
    stop('SOURCE_DOCUMENT_NOT_FOUND',409);
  const fields=record.fields;
  const revision=fieldNumber(fields.revision);
  const projectMasters=firestoreArray(fields.projectMasters);
  const manual=firestoreArray(fields.manualRecords);
  const salary=firestoreArray(fields.salaryRecords);
  const inflow=firestoreArray(fields.inflowRecords);
  const transfer=firestoreArray(fields.transfers);
  const hasCore=[revision,projectMasters,manual,salary].every(x=>x!==null);
  // Return counts and revision only; do not expose raw staff, amounts, names,
  // salaries, receipts, or full Cash Control state to the browser.
  return {
    kind:'CASH_CONTROL_PRIVATE_METADATA_ONLY',firebaseProject:FIREBASE,
    revision,projectMasters:projectMasters?.length??null,
    manualRecords:manual?.length??null,salaryRecords:salary?.length??null,
    inflowRecords:inflow?.length??null,
    transferRecords:transfer?.length??null,
    updatedAt:typeof fields.updatedAt?.timestampValue==='string'?
      fields.updatedAt.timestampValue:fieldString(fields.updatedAt),
    schemaVersion:fieldNumber(fields.schemaVersion),
    metadataPresent:hasCore,
    paymentSourceComplete:false,legacyHistoryComplete:false,
    sourceComplete:false,canSync:false
  };
}
async function parseGoogleResponse(response){
  if(!response?.ok)stop('FIRESTORE_READ_HTTP_'+(response?.status||'ERROR'),502);
  return response.json();
}
function readCount(payload){
  const results=Array.isArray(payload)?payload:[payload];
  const field=results.find(x=>x?.result?.aggregateFields?.paymentCount);
  const raw=field?.result?.aggregateFields?.paymentCount?.integerValue;
  const n=typeof raw==='string'?Number(raw):NaN;
  if(!Number.isSafeInteger(n)||n<0)stop('PAYMENT_COUNT_NOT_VERIFIED',502);
  return n;
}
async function inspect({env,action,project,firebaseJwt,fetcher=fetch,
  verifyAdmin=verifyFirebaseAdminToken}={}){
  const config=checkedConfig(env);
  const input=validateRequest(action==='metadata'?{action}:{action,project});
  await verifyAdmin(firebaseJwt,config);
  const token='Bearer '+firebaseJwt;
  if(input.action==='metadata'){
    const reply=await fetcher(HOST+DATA_PATH+'?mask.fieldPaths=revision'+
      '&mask.fieldPaths=projectMasters&mask.fieldPaths=manualRecords'+
      '&mask.fieldPaths=salaryRecords&mask.fieldPaths=inflowRecords'+
      '&mask.fieldPaths=transfers&mask.fieldPaths=updatedAt'+
      '&mask.fieldPaths=schemaVersion',{
      method:'GET',headers:{Authorization:token},
      signal:AbortSignal.timeout(15000)
    });
    const data=await parseGoogleResponse(reply);
    return Object.freeze({
      ...cashMetadata(data),operation:'metadata',
      firestoreRequests:1,paymentDocumentReads:0,
      googleReads:0,googleWrites:0
    });
  }
  // Aggregate by one exact project. Firestore executes an index-backed count:
  // no Payment document data is returned to this server or to the browser.
  // Count only; never claim complete Cash Control source coverage.
  const body={structuredAggregationQuery:{
    structuredQuery:{from:[{collectionId:'payments'}],where:{
      fieldFilter:{field:{fieldPath:'project'},op:'EQUAL',
        value:{stringValue:input.project}}
    }},
    aggregations:[{alias:'paymentCount',count:{}}]
  }};
  const reply=await fetcher(HOST+':runAggregationQuery',{
    method:'POST',headers:{Authorization:token,
      'Content-Type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
  });
  const data=await parseGoogleResponse(reply);
  return Object.freeze({kind:'SINGLE_PROJECT_COUNT_ONLY',
    project:input.project,paymentDocumentCount:readCount(data),
    firestoreRequests:1,paymentDocumentsReturned:0,
    firebaseProject:FIREBASE,sourceComplete:false,canSync:false,
    googleReads:0,googleWrites:0});
}
async function handler(req,res){
  res.setHeader('Cache-Control','no-store,max-age=0');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST')return res.status(405).json({error:'POST_ONLY'});
  if(!req.headers?.host||req.headers?.origin!=='https://'+req.headers.host)
    return res.status(403).json({error:'CROSS_ORIGIN'});
  try{
    const input=validateRequest(typeof req.body==='string'?
      JSON.parse(req.body):req.body);
    const jwt=String(req.headers['x-firebase-id-token']||'');
    const data=await inspect({env:process.env,...input,firebaseJwt:jwt});
    return res.status(200).json(data);
  }catch(err){
    const code=[400,403,405,409,502,503].includes(err?.statusCode)?
      err.statusCode:500;
    return res.status(code).json({error:
      /^[A-Z0-9_]+$/.test(String(err.message))?err.message:
        'SOURCE_READ_FAILED',writes:0});
  }
}
module.exports=handler;
module.exports._internals={checkedConfig,validateRequest,cashMetadata,
  readCount,inspect};
