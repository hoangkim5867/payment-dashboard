// Isolated, on-demand Christmas storage. No realtime listeners or Payment reads.
export const REVEAL_AT=Date.parse("2026-12-23T00:00:00+07:00");
import {safeColor,itemById} from "./payment-noel-tree-catalog.mjs";
import {fields,MAX_LOCAL,MAX_PAGES,capacity,validPoint,safeZone} from "./payment-noel-garden.mjs";
const trim=(v,n)=>String(v??"").trim().slice(0,n);
const metadata=g=>{const f=fields(g);return {...(Number.isInteger(g.page)&&g.page!==0?{page:f.page}:{}),...(f.zone!=="tree"?{zone:f.zone}:{}),...(f.scale!==1?{scale:f.scale}:{}),...(f.rotation!==0?{rotation:f.rotation}:{})}};
const validUid=v=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
export function createNoelShared({db,doc,collection,getDoc,getDocs,query,limit,setDoc,updateDoc,writeBatch,serverTimestamp,uid,allowed}){
 const tree=u=>{if(!validUid(u))throw Error("Invalid tree");return doc(db,"noelTrees2026",u)};
 const config=()=>doc(db,"noelTreeConfig2026","settings");
 const check=()=>{if(!allowed()||!validUid(uid))throw Error("Session changed")};
 async function staffEnabled(){check();const s=await getDoc(config());check();return s.exists()&&s.data().enabled===true}
 async function publish(m){check();const name=trim(m.name,32);if(!name)throw Error("TREE_NAME_REQUIRED");await setDoc(tree(uid),{name,style:m.style==="chalet"?"chalet":"pastel",color:safeColor(m.color),decorations:(Array.isArray(m.gifts)?m.gifts:[]).filter(g=>g&&itemById(g.kind)&&Number.isFinite(g.x)&&Number.isFinite(g.y)&&g.x>=0&&g.x<=100&&g.y>=0&&g.y<=100).slice(0,MAX_LOCAL).map(g=>({kind:g.kind,x:g.x,y:Math.min(g.y,fields(g).zone==="ground"?97:82),...metadata(g),...(Number.isInteger(g.page)?{page:fields(g).page}:{})})),...((m.gardenColors||[]).length?{gardenColors:m.gardenColors.slice(0,MAX_PAGES).map(safeColor)}:{}),updatedAt:serverTimestamp()});check()}
 async function listTrees(){check();const snap=await getDocs(query(collection(db,"noelTrees2026"),limit(100)));check();return snap.docs.map(d=>({uid:d.id,...d.data()})).filter(d=>validUid(d.uid)&&typeof d.name==="string")}
 async function getTree(u){check();const s=await getDoc(tree(u));check();return s.exists()?{uid:s.id,...s.data()}:null}
 async function gifts(u){check();const s=await getDocs(collection(tree(u),"gifts"));check();return s.docs.map(d=>({id:d.id,...d.data()}))}
 async function wishes(){check();if(Date.now()<REVEAL_AT)return {};const s=await getDocs(collection(tree(uid),"wishes"));check();return Object.fromEntries(s.docs.map(d=>[d.id,d.data().message]))}
 async function send(u,g){check();if(!itemById(g.kind)||!validPoint(g.x,g.y,safeZone(g.zone)))throw Error("INVALID_ORNAMENT");const ref=doc(collection(tree(u),"gifts")),wish=doc(collection(tree(u),"wishes"),ref.id);const batch=writeBatch(db);batch.set(ref,{kind:trim(g.kind,20),senderUid:uid,sender:trim(g.sender,32)||"Secret Santa",x:g.x,y:g.y,...metadata(g),createdAt:serverTimestamp()});batch.set(wish,{senderUid:uid,message:trim(g.message,160),createdAt:serverTimestamp()});await batch.commit();check()}
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
  await updateDoc(doc(collection(tree(uid),"gifts"),giftId),{...patch,updatedAt:serverTimestamp()});check();
 }
 async function arrangeReceivedGifts(entries){check();if(!Array.isArray(entries)||entries.length>capacity("tree")+capacity("ground"))throw Error("INVALID_BATCH");const batch=writeBatch(db);for(const {id,patch:p} of entries){if(!validUid(id)||!validPoint(p.x,p.y,p.zone)||!Number.isInteger(p.page)||p.page<0||p.page>=MAX_PAGES||Object.keys(p).some(k=>!["x","y","page","zone","scale","rotation"].includes(k)))throw Error("INVALID_ARRANGEMENT");batch.update(doc(collection(tree(uid),"gifts"),id),{...p,updatedAt:serverTimestamp()})}if(entries.length)await batch.commit();check()}
 async function enableStaff(){check();await setDoc(config(),{enabled:true,updatedAt:serverTimestamp()});check()}
 return {staffEnabled,publish,listTrees,getTree,gifts,wishes,send,editReceivedGift,arrangeReceivedGifts,enableStaff};
}
