// Isolated, on-demand Christmas storage. No realtime listeners or Payment reads.
export const REVEAL_AT=Date.parse("2026-12-23T00:00:00+07:00");
import {safeColor,itemById} from "./payment-noel-tree-catalog.mjs";
const trim=(v,n)=>String(v??"").trim().slice(0,n);
const validUid=v=>typeof v==="string"&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
export function createNoelShared({db,doc,collection,getDoc,getDocs,query,limit,setDoc,writeBatch,serverTimestamp,uid,allowed}){
 const tree=u=>{if(!validUid(u))throw Error("Invalid tree");return doc(db,"noelTrees2026",u)};
 const config=()=>doc(db,"noelTreeConfig2026","settings");
 const check=()=>{if(!allowed()||!validUid(uid))throw Error("Session changed")};
 async function staffEnabled(){check();const s=await getDoc(config());check();return s.exists()&&s.data().enabled===true}
 async function publish(m){check();const name=trim(m.name,32);if(!name)throw Error("TREE_NAME_REQUIRED");await setDoc(tree(uid),{name,style:m.style==="chalet"?"chalet":"pastel",color:safeColor(m.color),decorations:(Array.isArray(m.gifts)?m.gifts:[]).filter(g=>g&&itemById(g.kind)&&Number.isFinite(g.x)&&Number.isFinite(g.y)&&g.x>=0&&g.x<=100&&g.y>=0&&g.y<=100).slice(0,60).map(g=>({kind:g.kind,x:g.x,y:Math.min(g.y,82)})),updatedAt:serverTimestamp()});check()}
 async function listTrees(){check();const snap=await getDocs(query(collection(db,"noelTrees2026"),limit(100)));check();return snap.docs.map(d=>({uid:d.id,...d.data()})).filter(d=>validUid(d.uid)&&typeof d.name==="string")}
 async function getTree(u){check();const s=await getDoc(tree(u));check();return s.exists()?{uid:s.id,...s.data()}:null}
 async function gifts(u){check();const s=await getDocs(query(collection(tree(u),"gifts"),limit(100)));check();return s.docs.map(d=>({id:d.id,...d.data()}))}
 async function wishes(){check();if(Date.now()<REVEAL_AT)return {};const s=await getDocs(query(collection(tree(uid),"wishes"),limit(100)));check();return Object.fromEntries(s.docs.map(d=>[d.id,d.data().message]))}
 async function send(u,g){check();if(!itemById(g.kind))throw Error("INVALID_ORNAMENT");const ref=doc(collection(tree(u),"gifts")),wish=doc(collection(tree(u),"wishes"),ref.id);const batch=writeBatch(db);batch.set(ref,{kind:trim(g.kind,20),senderUid:uid,sender:trim(g.sender,32)||"Secret Santa",x:g.x,y:g.y,createdAt:serverTimestamp()});batch.set(wish,{senderUid:uid,message:trim(g.message,160),createdAt:serverTimestamp()});await batch.commit();check()}
 async function enableStaff(){check();await setDoc(config(),{enabled:true,updatedAt:serverTimestamp()});check()}
 return {staffEnabled,publish,listTrees,getTree,gifts,wishes,send,enableStaff};
}
