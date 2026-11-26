// Isolated, on-demand Christmas storage. No realtime listeners or Payment reads.
export const REVEAL_AT=Date.parse("2026-12-23T00:00:00+07:00");
import {safeColor,itemById} from "./payment-noel-tree-catalog.mjs";
import {fields,MAX_LOCAL,MAX_PAGES,capacity,validPoint,safeZone,safePage} from "./payment-noel-garden.mjs";
const trim=(v,n)=>String(v??"").trim().slice(0,n);
const metadata=g=>{const f=fields(g);return {...(Number.isInteger(g.page)&&g.page!==0?{page:f.page}:{}),...(f.zone!=="tree"?{zone:f.zone}:{}),...(f.scale!==1?{scale:f.scale}:{}),...(f.rotation!==0?{rotation:f.rotation}:{})}};
export const NOEL_CACHE_MS=5*60*1000;
export const NOEL_REFRESH_MIN_MS=15000;
// Auth-session memory only. Coalesce in-flight requests; no timers or background refresh.
export function createNoelReadCache(now=Date.now){const values=new Map(),pending=new Map(),revisions=new Map();const rev=k=>revisions.get(k)||0;const set=(k,value,at=now())=>{revisions.set(k,rev(k)+1);values.set(k,{value,at})};return {peek:k=>values.get(k)?.value,has:k=>values.has(k),set,patch(k,fn){const old=values.get(k);if(old)set(k,fn(old.value),old.at);else revisions.set(k,rev(k)+1)},async read(k,load,force=false){const old=values.get(k),age=old?now()-old.at:Infinity;if(old&&age<(force?NOEL_REFRESH_MIN_MS:NOEL_CACHE_MS))return old.value;if(pending.has(k))return pending.get(k);const start=rev(k);const p=Promise.resolve().then(load).then(value=>{if(rev(k)===start){set(k,value);return value}return values.has(k)?values.get(k).value:value}).finally(()=>{if(pending.get(k)===p)pending.delete(k)});pending.set(k,p);return p}}}
const safeStyle=v=>["pastel","chalet","celestial","kawaii","forest","doodle"].includes(v)?v:"pastel";
const validUid=v=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
export function createNoelShared({db,doc,collection,getDoc,getDocs,query,limit,setDoc,updateDoc,writeBatch,serverTimestamp,uid,allowed}){
 const tree=u=>{if(!validUid(u))throw Error("Invalid tree");return doc(db,"noelTrees2026",u)};
 const config=()=>doc(db,"noelTreeConfig2026","settings");
 const check=()=>{if(!allowed()||!validUid(uid))throw Error("Session changed")};
 const cache=createNoelReadCache(),tk=u=>"tree:"+u,gk=u=>"gifts:"+u,dir="directory",wk="wishes";const options=o=>o?.force===true;
 const updateDirectory=(u,value)=>cache.patch(dir,rows=>rows.some(t=>t.uid===u)?rows.map(t=>t.uid===u?value:t):[...rows,value]);
 const patchGifts=(u,fn)=>cache.patch(gk(u),fn);
 async function staffEnabled(){check();const s=await getDoc(config());check();return s.exists()&&s.data().enabled===true}
 async function publish(m){check();const name=trim(m.name,32);if(!name)throw Error("TREE_NAME_REQUIRED");const payload={name,style:safeStyle(m.style),representative:safePage(m.representative),...((m.gardenStyles||[]).length?{gardenStyles:m.gardenStyles.slice(0,MAX_PAGES).map(safeStyle)}:{}),color:safeColor(m.color),decorations:(Array.isArray(m.gifts)?m.gifts:[]).filter(g=>g&&itemById(g.kind)&&Number.isFinite(g.x)&&Number.isFinite(g.y)&&g.x>=0&&g.x<=100&&g.y>=0&&g.y<=100).slice(0,MAX_LOCAL).map(g=>({kind:g.kind,x:g.x,y:Math.min(g.y,fields(g).zone==="ground"?97:82),...metadata(g),...(Number.isInteger(g.page)?{page:fields(g).page}:{})})),...((m.gardenColors||[]).length?{gardenColors:m.gardenColors.slice(0,MAX_PAGES).map(safeColor)}:{}),updatedAt:serverTimestamp()};await setDoc(tree(uid),payload);check();const published={uid,...payload};cache.set(tk(uid),published);updateDirectory(uid,published)}
 async function setRepresentative(page){check();const representative=safePage(page),patch={representative,updatedAt:serverTimestamp()};await updateDoc(tree(uid),patch);check();cache.patch(tk(uid),v=>v?{...v,...patch}:v);cache.patch(dir,rows=>rows.map(t=>t.uid===uid?{...t,...patch}:t))}
 async function listTrees(opts){check();const result=await cache.read(dir,async()=>{const snap=await getDocs(query(collection(db,"noelTrees2026"),limit(100)));check();const rows=snap.docs.map(d=>({uid:d.id,...d.data()})).filter(d=>validUid(d.uid)&&typeof d.name==="string");for(const t of rows)cache.set(tk(t.uid),t);return rows},options(opts));check();return result}
 async function getTree(u,opts){check();if(!validUid(u))throw Error("Invalid tree");const value=await cache.read(tk(u),async()=>{const snap=await getDoc(tree(u));check();return snap.exists()?{uid:snap.id,...snap.data()}:null},options(opts));check();return value}
 async function gifts(u,opts){check();if(!validUid(u))throw Error("Invalid tree");const value=await cache.read(gk(u),async()=>{const snap=await getDocs(collection(tree(u),"gifts"));check();return snap.docs.map(d=>({id:d.id,...d.data()}))},options(opts));check();return value}
 async function wishes(opts){check();if(Date.now()<REVEAL_AT)return {};const value=await cache.read(wk,async()=>{const snap=await getDocs(collection(tree(uid),"wishes"));check();return Object.fromEntries(snap.docs.map(d=>[d.id,d.data().message]))},options(opts));check();return value}
 async function send(u,g){check();if(!itemById(g.kind)||!validPoint(g.x,g.y,safeZone(g.zone)))throw Error("INVALID_ORNAMENT");const ref=doc(collection(tree(u),"gifts")),wish=doc(collection(tree(u),"wishes"),ref.id);const batch=writeBatch(db);const data={kind:trim(g.kind,20),senderUid:uid,sender:trim(g.sender,32)||"Secret Santa",x:g.x,y:g.y,...metadata(g)};const message=trim(g.message,160);batch.set(ref,{...data,createdAt:serverTimestamp()});batch.set(wish,{senderUid:uid,message,createdAt:serverTimestamp()});await batch.commit();check();const saved={id:ref.id,...data,createdAt:{seconds:Math.floor(Date.now()/1000)}};patchGifts(u,rows=>rows.some(r=>r.id===saved.id)?rows:[...rows,saved]);if(u===uid&&Date.now()>=REVEAL_AT)cache.patch(wk,rows=>({...rows,[saved.id]:message}));return saved}
 async function editReceivedGift(giftId,patch){
  check();if(!validUid(giftId))throw Error("INVALID_GIFT");
  const keys=Object.keys(patch||{});
  if(!keys.length||keys.some(k=>!["x","y","hidden","page","zone","scale","rotation"].includes(k)))throw Error("INVALID_GIFT_EDIT");
  if(("x" in patch)!==("y" in patch))throw Error("INVALID_GIFT_POSITION");
  if("x" in patch&&(!Number.isFinite(patch.x)||!Number.isFinite(patch.y)||patch.x<0||patch.x>100||patch.y<0||patch.y>(patch.zone==="ground"?97:82)))throw Error("INVALID_GIFT_POSITION");
  if("page" in patch&&(!Number.isInteger(patch.page)||patch.page<0||patch.page>=MAX_PAGES))throw Error("INVALID_PAGE");
  if("zone" in patch&&!["tree","ground"].includes(patch.zone))throw Error("INVALID_ZONE");
  if("scale" in patch&&(!Number.isFinite(patch.scale)||patch.scale<.55||patch.scale>1.45))throw Error("INVALID_SCALE");
  if("rotation" in patch&&(!Number.isFinite(patch.rotation)||Math.abs(patch.rotation)>180))throw Error("INVALID_ROTATION");
  if("hidden" in patch&&typeof patch.hidden!=="boolean")throw Error("INVALID_GIFT_VISIBILITY");
  const known=cache.peek(gk(uid))?.find(g=>g.id===giftId);if(known&&keys.every(k=>known[k]===patch[k]))return;await updateDoc(doc(collection(tree(uid),"gifts"),giftId),{...patch,updatedAt:serverTimestamp()});check();patchGifts(uid,rows=>rows.map(g=>g.id===giftId?{...g,...patch}:g));
 }
 async function arrangeReceivedGifts(entries){check();if(!Array.isArray(entries)||entries.length>capacity("tree")+capacity("ground"))throw Error("INVALID_BATCH");const batch=writeBatch(db),changed=[];const known=cache.peek(gk(uid))||[];for(const {id,patch:p} of entries){if(!validUid(id)||!validPoint(p.x,p.y,p.zone)||!Number.isInteger(p.page)||p.page<0||p.page>=MAX_PAGES||Object.keys(p).some(k=>!["x","y","page","zone","scale","rotation"].includes(k)))throw Error("INVALID_ARRANGEMENT");const old=known.find(g=>g.id===id);if(old&&Object.keys(p).every(k=>old[k]===p[k]))continue;changed.push({id,patch:p});batch.update(doc(collection(tree(uid),"gifts"),id),{...p,updatedAt:serverTimestamp()})}if(changed.length){await batch.commit();check();const byId=new Map(changed.map(e=>[e.id,e.patch]));patchGifts(uid,rows=>rows.map(g=>byId.has(g.id)?{...g,...byId.get(g.id)}:g))}check()}
 async function enableStaff(){check();await setDoc(config(),{enabled:true,updatedAt:serverTimestamp()});check()}
 return {staffEnabled,publish,setRepresentative,listTrees,getTree,gifts,wishes,send,editReceivedGift,arrangeReceivedGifts,enableStaff};
}
