'use strict';
/* S13-2/2026-10: independent record-identity check against the two protected
 * Firestore source documents. This module never authorizes a Google write.
 * Payment aliases/entire business completeness are intentionally separate. */
const {createHash}=require('node:crypto');
const {compareS13TestSource,IDS}=require('./cash-sync-s13-test-target.cjs');
const SEED_HASH='c1a3fdf298b2b5cbec9dd293fa5a199a3cee086fbe35984b0bebbdc8b9b58f12';
const SOURCE_ID=['manual_salary_payroll_1790835443846_m4hd2',
 'manual_salary_payroll_1790835443852_ihc3a','legacy_salary_672','legacy_salary_680'];
const amount=x=>Math.abs(Number(x?.actualAmount||x?.amount||0));
const bad=code=>{throw Object.assign(Error(code),{statusCode:409})};
function unpack(field,depth=0){
 if(depth>12)bad('S13_SOURCE_DECODE_DEPTH');
 if(!field||typeof field!=='object')bad('S13_SOURCE_DECODE_INVALID');
 if(Object.hasOwn(field,'stringValue'))return String(field.stringValue);
 if(Object.hasOwn(field,'integerValue'))return Number(field.integerValue);
 if(Object.hasOwn(field,'doubleValue'))return Number(field.doubleValue);
 if(Object.hasOwn(field,'booleanValue'))return Boolean(field.booleanValue);
 if(Object.hasOwn(field,'timestampValue'))return String(field.timestampValue);
 if(Object.hasOwn(field,'nullValue'))return null;
 if(Object.hasOwn(field,'arrayValue'))return (field.arrayValue.values||[]).map(x=>unpack(x,depth+1));
 if(Object.hasOwn(field,'mapValue')){
  return Object.fromEntries(Object.entries(field.mapValue.fields||{})
   .map(([k,v])=>[k,unpack(v,depth+1)]));
 }
 bad('S13_SOURCE_DECODE_UNKNOWN_TYPE');
}
function readFields(doc){
 if(!doc||typeof doc.fields!=='object')bad('S13_SOURCE_DOC_MISSING');
 return Object.fromEntries(Object.entries(doc.fields).map(([k,v])=>[k,unpack(v)]));
}
function exactRecords(items,ids){
 if(!Array.isArray(items)||items.length>20000)bad('S13_SOURCE_RECORDS_INVALID');
 const byId=new Map();
 for(const item of items){
  if(!item||typeof item!=='object'||Array.isArray(item))bad('S13_SOURCE_RECORD_INVALID');
  const id=String(item.id||'');
  if(ids.includes(id)){
   if(byId.has(id))bad('S13_SOURCE_DUPLICATE_ID');
   byId.set(id,item);
  }
 }
 if(ids.some(id=>!byId.has(id)))bad('S13_SOURCE_ID_MISSING');
 return byId;
}
function checkRecord(record,day){
 if(record.project!=='S13-2'||record.status!=='paid'||
    record.actualDate!==day||record.direction!=='out'||
    !Number.isSafeInteger(amount(record))||amount(record)<=0)
   bad('S13_SOURCE_RECORD_CHANGED');
}
function inspectS13({cashDocument,legacySeedDocument,revision,sourceRows}={}){
 if(!Number.isSafeInteger(revision)||revision<0)bad('S13_SOURCE_REVISION_INVALID');
 if(!Array.isArray(sourceRows)||sourceRows.length!==3)
  bad('S13_SOURCE_POSTINGS_INVALID');
 const postings=compareS13TestSource(sourceRows);
 if(!postings.identitiesMatch||!postings.postingMatches||!postings.labelsMatch)
  bad('S13_SOURCE_TEST_REFERENCE_MISMATCH');
 const cloud=readFields(cashDocument),seed=readFields(legacySeedDocument);
 if(cloud.revision!==revision)bad('S13_SOURCE_REVISION_CHANGED');
 if(typeof seed.payload!=='string'||seed.schemaVersion!==1||
    seed.sha256!==SEED_HASH||
    createHash('sha256').update(seed.payload).digest('hex')!==SEED_HASH)
  bad('S13_LEGACY_SEED_SIGNATURE_MISMATCH');
 let parsed;
 try{parsed=JSON.parse(seed.payload)}catch{bad('S13_LEGACY_SEED_JSON_INVALID')}
 if(!Array.isArray(parsed.LEGACY_SALARY))bad('S13_LEGACY_SALARY_MISSING');
 if(!Array.isArray(cloud.manualRecords)||!Array.isArray(cloud.deletedLegacy)||
    !cloud.legacyOverrides||typeof cloud.legacyOverrides!=='object')
  bad('S13_CASH_STATE_INCOMPLETE');
 const m=exactRecords(cloud.manualRecords,SOURCE_ID.slice(0,2));
 const l=exactRecords(parsed.LEGACY_SALARY,SOURCE_ID.slice(2));
 if(SOURCE_ID.slice(2).some(id=>cloud.deletedLegacy.includes(id)))
  bad('S13_SOURCE_DELETED_LEGACY');
 const records=[
  m.get(SOURCE_ID[0]),m.get(SOURCE_ID[1]),
  ...SOURCE_ID.slice(2).map(id=>({...l.get(id),...(cloud.legacyOverrides[id]||{})}))
 ];
 records.forEach((r,i)=>checkRecord(r,i<2?'2026-10-02':'2026-10-20'));
 if(amount(records[0])!==81463753||amount(records[1])!==3859500||
    amount(records[2])+amount(records[3])!==52923736)
   bad('S13_SOURCE_AMOUNTS_CHANGED');
 const month='2026-10';
 const active=(x)=>x&&x.project==='S13-2'&&x.status==='paid'&&
   String(x.actualDate||'').startsWith(month+'-')&&
   x.isAllocation!==true&&x.direction!=='adjustment';
 const all=[...cloud.manualRecords,...parsed.LEGACY_SALARY.map(r=>
  cloud.deletedLegacy.includes(r.id)?null:{...r,...(cloud.legacyOverrides[r.id]||{})}),
 ...(parsed.LEGACY_FINANCE||[]).map(r=>({...r,...(cloud.legacyOverrides[r.id]||{})})),
 ...(parsed.LEGACY_CASH_SPECIAL||[]).map(r=>({...r,...(cloud.legacyOverrides[r.id]||{})}))];
 const extra=all.filter(active).filter(x=>!SOURCE_ID.includes(x.id));
 // A 4-record identity proof must not falsely attest a different cash stream.
 return Object.freeze({
  kind:'S13_FOUR_ORIGINAL_IDS_VERIFIED',project:'S13-2',month,
  sourceRevision:revision,verifiedSourceItems:4,groupedGoogleRows:3,
  extraPrivateAndLegacyCashEntries:extra.length,
  pinnedSourceMatched:true,
  scopedCashEntriesMatched:extra.length===0,
  paymentBusinessComplete:false,sourceComplete:false,
  canSync:false,writeAuthorized:false,googleWrites:0
 });
}
module.exports={inspectS13,unpack,readFields,SEED_HASH,SOURCE_ID};
