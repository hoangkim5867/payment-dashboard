// Admin-only on-demand status filter for archived IPC dossier links.
// No reads on page load, month change, filter toggle or re-render.
import {getApps,getApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAuth} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {getFirestore,doc,getDoc} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
const OWNER_UID="HTx2QuATHxh8zgAawwreg88w65M2";
const viewer=document.getElementById("archiveViewer");
const snapshots=new Map();
let currentMonth="",onlyMissing=false,checking=false;
const owner=()=>getApps().length>0&&getAuth(getApp()).currentUser?.uid===OWNER_UID;
const paidRows=()=>typeof window.__archivePaidIpcRows==="function"?window.__archivePaidIpcRows():[];
const dossierLink=value=>typeof value==="string"&&/^https:\/\/(drive|docs)\.google\.com\//i.test(value.trim());
const stateFor=month=>{
 if(!snapshots.has(month))snapshots.set(month,{complete:false,items:new Map()});
 return snapshots.get(month);
};
if(viewer){
 const style=document.createElement("style");
 style.textContent=".archive-ipc-missing-toggle{border:1px solid #b5c9d8;border-radius:7px;color:#275375;background:#fff;font:600 12px system-ui;padding:8px 10px;margin-left:8px;cursor:pointer}.archive-ipc-missing-toggle.active{background:#e9f6ed;border-color:#9bc8a7;color:#176943}.archive-ipc-missing-toggle:disabled{opacity:.65;cursor:wait}.archive-ipc-status-summary{font:12px system-ui;color:#63758a;margin-left:8px}.payment-doc-archive-btn.ipc-linked{background:#eff9f1;border-color:#a8d2b4;color:#176b43}.payment-doc-archive-btn.ipc-missing{background:#fff;border-color:#bfcbd7;color:#52677b}body.archive-ipc-only-missing .viewer-table .project-detail-row:not([data-ipc-link-state='no']),body.archive-ipc-only-missing .viewer-table .project-row[data-ipc-has-missing='0'],body.archive-ipc-only-missing .viewer-table .section-row[data-ipc-has-missing='0']{display:none!important}";
 document.head.append(style);
 const filter=value=>{
  onlyMissing=value;
  document.body.classList.toggle("archive-ipc-only-missing",onlyMissing);
 };
 function refresh(){
  const rows=paidRows();
  const month=rows.length?String(rows[0].archiveMonth||""):"";
  const table=viewer.querySelector(".viewer-table:not(.global-search-table)");
  const heading=viewer.querySelector(".viewer-heading");
  if(!owner()||!month||!table||!heading){
   if(currentMonth){currentMonth="";filter(false);}
   return;
  }
  if(month!==currentMonth){currentMonth=month;filter(false);}
  const state=stateFor(month);
  const ids=new Set(rows.map(row=>row.id));
  const counts={yes:0,no:0,unknown:0,unavailable:0};
  const projectHasMissing=new Set(),sectionHasMissing=new Set();
  for(const row of table.querySelectorAll(".project-detail-row")){
   const id=String(row.dataset.paymentId||"");
   if(!ids.has(id))continue;
   const value=state.items.get(id)||"unknown";
   counts[value]++;
   row.dataset.ipcLinkState=value;
   if(value==="no")projectHasMissing.add(row.dataset.projectParent);
   const button=row.querySelector(".payment-doc-archive-btn");
   if(button){
    const label=value==="yes"?"📁 Đã có":value==="no"?"📁 Chưa có":value==="unavailable"?"📁 Không rõ":"📁 Hồ sơ";
    if(button.textContent!==label)button.textContent=label;
    button.classList.toggle("ipc-linked",value==="yes");
    button.classList.toggle("ipc-missing",value==="no");
    button.classList.toggle("has-linked",value==="yes");
    button.title=value==="yes"?"Đã có link hồ sơ":value==="no"?"Chưa có link — bấm để dán thủ công":"Chưa kiểm tra link";
   }
  }
  for(const project of table.querySelectorAll(".project-row[data-project-group]")){
   const has=projectHasMissing.has(project.dataset.projectGroup);
   project.dataset.ipcHasMissing=has?"1":"0";
   if(has)sectionHasMissing.add(project.dataset.sectionParent);
  }
  for(const section of table.querySelectorAll(".section-row[data-section-group]")){
   section.dataset.ipcHasMissing=sectionHasMissing.has(section.dataset.sectionGroup)?"1":"0";
  }
  let button=heading.querySelector(".archive-ipc-missing-toggle");
  if(!button){
   button=document.createElement("button");
   button.type="button";button.className="archive-ipc-missing-toggle";
   const close=heading.querySelector(".viewer-close");
   if(close)close.before(button);else heading.append(button);
   button.addEventListener("click",async()=>{
    if(checking||!owner())return;
    const selectedMonth=currentMonth,cache=stateFor(selectedMonth);
    if(cache.complete){filter(!onlyMissing);refresh();return;}
    const target=paidRows().filter(row=>row.archiveMonth===selectedMonth);
    if(!target.length)return;
    checking=true;button.disabled=true;
    try{
     const db=getFirestore(getApp());
     for(let i=0;i<target.length;i+=12){
      const portion=target.slice(i,i+12);
      const results=await Promise.all(portion.map(async payment=>{
       try{
        const result=await getDoc(doc(db,"payments",payment.id));
        if(!result.exists())return {id:payment.id,state:"unavailable"};
        const data=result.data();
        if(String(data.paymentMonth||"")!==selectedMonth)return {id:payment.id,state:"unavailable"};
        return {id:payment.id,state:dossierLink(data.ipcDocumentUrl)?"yes":"no"};
       }catch{return {id:payment.id,state:"unavailable"};}
      }));
      for(const result of results){
       // A link saved in this tab after the scan started takes precedence.
       if(!cache.items.has(result.id))cache.items.set(result.id,result.state);
      }
      if(currentMonth===selectedMonth){
       const label="Đang kiểm tra "+Math.min(i+12,target.length)+"/"+target.length+"…";
       if(button.textContent!==label)button.textContent=label;
      }
     }
     cache.complete=true;
     if(currentMonth===selectedMonth){filter(true);refresh();}
    }finally{checking=false;button.disabled=false;if(currentMonth===selectedMonth)refresh();}
   });
  }
  let summary=heading.querySelector(".archive-ipc-status-summary");
  if(!summary){summary=document.createElement("span");summary.className="archive-ipc-status-summary";button.after(summary);}
  if(!checking){
   const label=state.complete?"Chưa có hồ sơ ("+counts.no+")":"Chưa có hồ sơ";
   if(button.textContent!==label)button.textContent=label;
  }
  button.classList.toggle("active",onlyMissing);
  summary.textContent=state.complete?
   counts.yes+" đã có · "+counts.no+" chưa có"+(counts.unavailable?" · "+counts.unavailable+" chưa xác minh":""):
   "Kiểm tra khi bấm · không tự đọc Firebase";
  button.title=state.complete?"Bấm để bật/tắt bộ lọc chưa có hồ sơ":
   "Kiểm tra một lần cho "+rows.length+" khoản (khoảng "+rows.length+" Firestore reads, cộng kiểm tra Rules nếu có)";
 }
 window.addEventListener("payment-ipc-link-status-changed",event=>{
  const id=String(event.detail?.paymentId||"");
  if(!id||!currentMonth||!owner()||!paidRows().some(r=>r.id===id))return;
  stateFor(currentMonth).items.set(id,event.detail.linked?"yes":"no");
  refresh();
 });
 new MutationObserver(refresh).observe(viewer,{childList:true,subtree:true});
 refresh();
}
