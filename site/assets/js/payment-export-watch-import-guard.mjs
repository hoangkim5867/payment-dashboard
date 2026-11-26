// Pure Export Watch cleanup: never changes Payment or activity-log documents.
export function isContractIdentifierInProject(value){
 const s=String(value??"").trim().replace(/\s+/g,"");
 return /^CSCECVN[-A-Z0-9._/]+$/i.test(s);
}
const text=v=>String(v??"").trim();
const action=l=>text(l?.action).toUpperCase();
const id=l=>text(l?.paymentId);
function malformedZero(l){
 return isContractIdentifierInProject(l?.project)&&!text(l?.company)&&
  !text(l?.bankAccount)&&Number(l?.amount??0)===0;
}
export function filterExportWatchImportMistakes(logs,{payments=[],scopeComplete=false,acknowledged={}}={}){
 if(!scopeComplete||!Array.isArray(logs))return logs;
 const current=new Map(payments.map(p=>[text(p.id),p]));
 const groups=new Map();
 for(const l of logs){const k=id(l);if(!k)continue;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(l)}
 const hidden=new Set();
 for(const [k,events] of groups){
  // An acknowledged ID or a valid event may belong to a previously exported plan.
  if(Number(acknowledged[k])>0)continue;
  const first=events[0];
  if(action(first)!=="ADD"||!malformedZero(first))continue;
  if(!events.every(e=>malformedZero(e)&&["ADD","EDIT","DELETE","CANCEL","PURGE"].includes(action(e))))continue;
  const p=current.get(k);
  if(p&&p.deleted!==true&&text(p.monthOutcome).toLowerCase()!=="cancelled")continue;
  if(p&&!malformedZero(p))continue;
  hidden.add(k);
 }
 return logs.filter(l=>!hidden.has(id(l)));
}
