'use strict';
/*
 * Three-way Sheets mutation authorization.
 * Guard against out-of-order/retried Firestore events without extra Firestore
 * lookups. The caller must supply CANONICAL full export rows produced by a
 * separately verified financial projection, not raw Payment documents.
 * It never emits a Sheets request or deletes a record by itself.
 */
const {createHash}=require('node:crypto');
const PROJECT='PHU HUNG';
const FIRST_MONTH='2026-10';
const ID_LIMIT=512;
const num=value=>{
  if(value==null||value==='')return 0;
  if(typeof value==='number'&&Number.isFinite(value))return value;
  if(typeof value==='string'&&value.trim()&&!/[,_\s]/.test(value)&&Number.isFinite(Number(value)))
    return Number(value);
  throw Error('Noncanonical money amount.');
};
const normalize=values=>{
  if(!Array.isArray(values)||values.length!==13)throw Error('Canonical row must contain 13 columns.');
  return values.map((v,i)=>i>=6?num(v):String(v??''));
};
const hashValues=values=>createHash('sha256').update(JSON.stringify(normalize(values))).digest('hex');
const hashOk=h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h);
function validRow(row){
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('Invalid canonical source row.');
  const id=String(row.id||'');
  if(!id||id.length>ID_LIMIT)throw Error('Invalid stable source ID.');
  if(row.project!==PROJECT)throw Error('Only PHU HUNG pilot is allowed.');
  const month=String(row.month||'');
  if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)||month<FIRST_MONTH)
    throw Error('Month is outside the pilot.');
  const values=normalize(row.values);
  if(!/^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(values[0])||
     values[0].slice(0,7)!==month)
    throw Error('Transaction date disagrees with month.');
  const hash=hashValues(values);
  if(row.hash!==hash||!hashOk(row.hash))throw Error('Untrusted source hash.');
  return {id,project:PROJECT,month,values,hash};
}
function validateRemote(remote){
  if(remote==null)return null;
  if(!Array.isArray(remote)||remote.length!==19)throw Error('Existing Sheets row is malformed.');
  const [id,project,month]=remote;
  const row=validRow({id:String(id||''),project,month,values:remote.slice(3,16),
    hash:String(remote[17]||'')});
  if(String(remote[18]||'')!=='synced')throw Error('Existing Sheets row has unverified status.');
  return row;
}
function authorizeMutation({before=null,after=null,remote=null}){
  const old=before==null?null:validRow(before);
  const next=after==null?null:validRow(after);
  if(!old&&!next)throw Error('Change has no canonical source rows.');
  if(old&&next&&old.id!==next.id)throw Error('Source identity changed: manual review required.');
  const saved=validateRemote(remote);
  const id=(next||old).id;
  if(saved&&saved.id!==id)throw Error('Target Sheet row has different stable ID.');
  // Never delete financial history automatically.
  if(!next)return {kind:'review',id,reason:'source-deletion-needs-review'};
  if(saved&&saved.hash===next.hash&&saved.month===next.month)
    return {kind:'noop',id,hash:next.hash};
  if(!saved){
    if(old)return {kind:'review',id,reason:'previously-existing-source-missing-from-sheet'};
    return {kind:'append',id,row:next,expect:null};
  }
  // An append race, out-of-order update, or a human edit must never overwrite
  // the remote value unless it is the EXACT verified prior source version.
  if(!old)return {kind:'review',id,reason:'unexpected-existing-row'};
  if(saved.hash!==old.hash||saved.month!==old.month)
    return {kind:'review',id,reason:'out-of-order-event-or-external-edit'};
  if(old.hash===next.hash&&old.month===next.month)
    return {kind:'noop',id,hash:next.hash};
  return {kind:'update',id,row:next,expect:{hash:old.hash,month:old.month}};
}
function authorizeBatch({events,remoteById}){
  if(!Array.isArray(events)||events.length>1000)throw Error('Invalid event batch.');
  if(!(remoteById instanceof Map))throw Error('Remote rows must be indexed by unique source IDs.');
  const ids=new Set(),plans=[];
  for(const change of events){
    const id=change.after?.id||change.before?.id;
    if(typeof id!=='string'||ids.has(id))throw Error('Duplicate source ID in update batch.');
    ids.add(id);
    plans.push(authorizeMutation({...change,remote:remoteById.get(id)||null}));
  }
  return {plans,blocked:plans.filter(p=>p.kind==='review'),writes:plans.filter(p=>
    p.kind==='append'||p.kind==='update')};
}
function verifyReadback(plans,latestById){
  if(!(latestById instanceof Map))throw Error('Google read-back map is missing.');
  for(const plan of plans){
    if(plan.kind==='review')throw Error('Blocked mutation cannot be declared synchronized.');
    if(plan.kind==='noop')continue;
    const remote=validateRemote(latestById.get(plan.id));
    if(!remote||remote.hash!==plan.row.hash||remote.month!==plan.row.month)
      throw Error('Google read-back did not confirm '+plan.id);
  }
  return {googleReadBackVerified:true};
}
module.exports={PROJECT,FIRST_MONTH,normalize,hashValues,validRow,
  validateRemote,authorizeMutation,authorizeBatch,verifyReadback};
