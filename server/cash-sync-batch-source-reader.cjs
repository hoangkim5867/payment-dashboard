'use strict';
/*
 * ONE Admin-initiated, independently authenticated source examination for
 * up to 35 active projects in one selected paid month. No Google access,
 * no Firebase writes, no whole-collection Payment scan.
 *
 * Do NOT turn a positive narrow Payment-only source examination into a
 * production release: legacy aliases, grouped PIT, transfers and Google
 * history require additional independent evidence and destination allowlist.
 */
const {verifyFirebaseAdminToken}=require('./cash-sync-guard.cjs');

const {attestMonth}=require('./cash-sync-project-source-attestation.cjs');
const {readFields}=require('./cash-sync-s13-source-integrity.cjs');
const HOST='https://firestore.googleapis.com/v1/projects/cscecmep-payment/databases/(default)/documents';
const fail=(code,statusCode=409)=>{throw Object.assign(Error(code),{statusCode})};
const next=m=>{const [y,n]=m.split('-').map(Number);return n===12?
  (y+1)+'-01':y+'-'+String(n+1).padStart(2,'0')};
const validProject=p=>typeof p==='string'&&p===p.normalize('NFKC').trim()&&
  /^[\p{L}\p{N}][\p{L}\p{N} ._+()\-/]{0,119}$/u.test(p);
function validate(payload){
 if(!payload||Array.isArray(payload)||typeof payload!=='object'||
  JSON.stringify(payload).length>820000||
  Object.keys(payload).sort().join(',')!=='action,month,projects,revision'||
  payload.action!=='verify_monthly_projects'||
  !/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(payload.month)||
  payload.month<'2026-10'||!Number.isSafeInteger(payload.revision)||
  payload.revision<0||!Array.isArray(payload.projects)||
  payload.projects.length<1||payload.projects.length>35)
  fail('MONTHLY_SOURCE_BATCH_INVALID',400);
 let total=0;const names=new Set();
 for(const g of payload.projects){
  if(!g||Object.keys(g).sort().join(',')!=='project,records'||
    !validProject(g.project)||names.has(g.project)||
    !Array.isArray(g.records)||g.records.length<1||g.records.length>1000)
   fail('MONTHLY_SOURCE_GROUP_INVALID',400);
  names.add(g.project);total+=g.records.length;
  if(total>3000)fail('MONTHLY_SOURCE_TOO_MANY_ROWS',413);
  const seen=new Set();
  for(const r of g.records){
   if(!r||Object.keys(r).sort().join(',')!=='hash,id,members,month,project,sourceClass,values'||
     r.project!==g.project||r.month!==payload.month||
     typeof r.id!=='string'||r.id.length>500||!r.id||seen.has(r.id)||
     !/^[0-9a-f]{64}$/.test(r.hash)||
     !Array.isArray(r.members)||r.members.length<1||r.members.length>100||
     r.members.some(v=>typeof v!=='string'||v.length>250)||
     !Array.isArray(r.values)||r.values.length!==13||
     r.values.slice(0,6).some(v=>typeof v!=='string'||v.length>3000)||
     r.values.slice(6).some(v=>typeof v!=='number'||!Number.isFinite(v)))
    fail('MONTHLY_SOURCE_ROW_INVALID',400);
   seen.add(r.id);
  }
 }
 return payload;
}
const FIELDS=['project','deleted','processPaymentDate','processActualAmount',
 'amount','costType','contractName','note','remark','description','content',
 'company','contractNo','ipcNo'];
async function inspect({env,input,jwt,verifyAdmin=verifyFirebaseAdminToken,
 fetcher=fetch}={}){
 const {checkedConfig}=require('../api/cash-sync-source-readonly.js')._internals;
 const valid=validate(input),config=checkedConfig(env);
 await verifyAdmin(jwt,config);
 const headers={Authorization:'Bearer '+jwt};
 const fetchJSON=async(url,body)=>{
  const response=await fetcher(url,{
   method:body?'POST':'GET',
   headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),
   signal:AbortSignal.timeout(25000)
  });
  if(!response?.ok)fail('FIRESTORE_SOURCE_READ_FAILED',502);
  return response.json();
 };
 const from=valid.month+'-01',to=next(valid.month);
 const query={
  structuredQuery:{
   select:{fields:FIELDS.map(fieldPath=>({fieldPath}))},
   from:[{collectionId:'payments'}],
   where:{compositeFilter:{op:'AND',filters:[
    {fieldFilter:{field:{fieldPath:'processPaymentDate'},
      op:'GREATER_THAN_OR_EQUAL',value:{stringValue:from}}},
    {fieldFilter:{field:{fieldPath:'processPaymentDate'},
      op:'LESS_THAN',value:{stringValue:to}}}
   ]}},
   limit:1001
  }
 };
 const [cloud,seed,paymentResult]=await Promise.all([
  fetchJSON(HOST+'/cash_control_private/lehoangoanh'),
  fetchJSON(HOST+'/cash_control_private/legacy_seed_20261021_v1'),
  fetchJSON(HOST+':runQuery',query)
 ]);
 if(!Array.isArray(paymentResult)||paymentResult.length>1000)
  fail('MONTH_PAYMENT_QUERY_UNBOUNDED',502);
 const payments=[];
 for(const item of paymentResult){
  if(!item?.document)continue;
  const name=String(item.document.name||'');
  if(!/^projects\/cscecmep-payment\/databases\/\(default\)\/documents\/payments\/[^/]+$/.test(name))
   fail('PAYMENT_DOCUMENT_ID_INVALID',502);
  payments.push({id:decodeURIComponent(name.split('/').pop()),...readFields(item.document)});
 }
 if(payments.length>1000)fail('MONTH_PAYMENT_QUERY_UNBOUNDED',502);
 const results=[];
 for(const group of valid.projects){
  let checked;
  try{
   checked=attestMonth({project:group.project,month:valid.month,
    revision:valid.revision,records:group.records,payments,
    cashDocument:cloud,seedDocument:seed});
  }catch(error){
   checked={kind:'INDEPENDENT_PROJECT_MONTH_SOURCE_CHECK_V1',
    project:group.project,month:valid.month,revision:valid.revision,
    verified:false,blockers:[String(error.message||'SOURCE_CHECK_FAILED').slice(0,100)],
    sourceComplete:false,canWrite:false,googleWrites:0};
  }
  results.push(checked);
 }
 return Object.freeze({
  kind:'INDEPENDENT_MONTHLY_SOURCE_BATCH_READONLY_V1',
  month:valid.month,revision:valid.revision,
  checkedProjects:results.length,
  eligibleForFurtherReview:results.filter(r=>r.verified===true).length,
  paymentDocumentsReturned:payments.length,
  firestoreRequests:3,paymentDocumentReads:payments.length,
  projects:Object.freeze(results),
  // Crucial: exact source IDs without Google or past aliases do not confer
  // permission to write; there is no cross-project commit in this API.
  sourceComplete:false,canWrite:false,writeConfigured:false,
  googleReads:0,googleWrites:0
 });
}
module.exports={validate,inspect};
