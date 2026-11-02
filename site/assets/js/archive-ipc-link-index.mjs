// Archive dossier index: the same monthly snapshot already loaded by the Kho.
// Staff: zero additional Firestore reads to render dossier availability and open links.
// Historical months: a deliberate owner-Admin one-time backfill, capped by read budget.
import {getApps,getApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAuth} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {getFirestore,doc,getDoc,updateDoc,runTransaction,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
const OWNER_UID="HTx2QuATHxh8zgAawwreg88w65M2";
const viewer=document.getElementById("archiveViewer");
const $=(s,p=document)=>p.querySelector(s);
const view=()=>window.__archiveDossierView?.()||null;
const months=()=>window.__archiveDossierMonths?.()||[];
const owner=()=>getApps().length&&getAuth(getApp()).currentUser?.uid===OWNER_UID;
const validUrl=value=>{
 try{const u=new URL(String(value||"").trim());return u.protocol==="https:"&&["drive.google.com","docs.google.com"].includes(u.hostname)?u.href:"";}catch{return "";}
};
const norm=v=>String(v??"").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/gi,"d").toUpperCase().replace(/\s+/g,"");
let syncing=false;
if(viewer){
 const css=document.createElement("style");
 css.textContent=".archive-ipc-index-linked{display:inline-block;border:1px solid #a7d0b0;border-radius:6px;background:#eff8f1;color:#17653c;padding:5px 7px;text-decoration:none;font:600 11px system-ui}.archive-ipc-index-empty{color:#8996a4}.archive-ipc-index-admin{border:1px solid #c8d4e1;border-radius:6px;padding:5px 7px;background:white;color:#52677b;font:600 11px system-ui}.archive-ipc-index-admin.ipc-has-link{border-color:#b2d7bb;background:#f0f9f1;color:#176b42}.archive-ipc-index-tools{margin-left:8px;font:600 11px system-ui;padding:7px 9px;border:1px solid #c4d1dd;border-radius:7px;color:#28516d;background:#fff;cursor:pointer}.archive-ipc-index-tools:disabled{opacity:.6}.archive-ipc-index-note{font:11px system-ui;color:#6a7a8b;margin-left:8px}";
 document.head.append(css);
 function refresh(){
  const active=view();
  const heading=$(".viewer-heading",viewer),table=$(".viewer-table:not(.global-search-table)",viewer);
  if(!heading||!table||!active)return;
  const links=active.links||{};
  const unknown=new Set(active.unresolvedIds||[]);
  const complete=active.complete===true;
  const stateOf=id=>{
    const url=validUrl(links[id]);
    return {url,state:url?"yes":complete&&!unknown.has(id)?"no":"unknown"};
  };
  // The entire month snapshot is already in memory. Updating these counters
  // on manual save/backfill is zero Firestore reads.
  const counts={yes:0,no:0,unknown:0};
  for(const p of active.rows||[]){
    const id=String(p.paymentId||"").trim();
    counts[stateOf(id).state]++;
  }
  for(const kind of ["yes","no","unknown"]){
    const counter=heading.parentNode?.querySelector('[data-dossier-count="'+kind+'"] b');
    if(counter&&counter.textContent!==String(counts[kind].toLocaleString("vi-VN")))
      counter.textContent=counts[kind].toLocaleString("vi-VN");
  }
  for(const row of table.querySelectorAll(".project-detail-row[data-payment-id]")){
   const id=String(row.dataset.paymentId||"");
   const cell=row.querySelector("td[data-ipc-doc-cell]");
   if(!id||!cell)continue;
   const {url,state}=stateOf(id);
   const known=state==="no";
   if(row.dataset.ipcLinkState!==state)row.dataset.ipcLinkState=state;
   if(!active.admin){
    if(url){
     let a=cell.querySelector("a.archive-ipc-index-linked");
     if(!a){a=document.createElement("a");a.className="archive-ipc-index-linked";a.textContent="📁 Hồ sơ";a.target="_blank";a.rel="noopener noreferrer";cell.replaceChildren(a);}
     if(a.getAttribute("href")!==url)a.href=url;
    }else if(known){
     if(cell.textContent!=="—")cell.textContent="—";
    }else{
     // Unknown is not equivalent to a linked document. Allow one explicit
     // on-click legacy lookup without showing a misleading dossier folder.
     let b=cell.querySelector("button.payment-doc-archive-btn");
     if(!b){
      b=document.createElement("button");b.type="button";
      b.className="payment-doc-link-btn payment-doc-archive-btn";
      b.dataset.paymentId=id;cell.replaceChildren(b);
     }
     if(b.textContent!=="🔎 Kiểm tra")b.textContent="🔎 Kiểm tra";
     b.title="Chưa xác minh link hồ sơ – bấm để kiểm tra";
    }
   }else{
    const b=$(".payment-doc-archive-btn",cell);
    if(!b)continue;
    const label=url?"📁 Đã có":known?"📁 Chưa có":"🔎 Chưa rõ";
    if(b.textContent!==label)b.textContent=label;
    b.classList.toggle("ipc-has-link",!!url);
    if(b.title!==(url?"Đã có link":known?"Chưa có link — bấm để dán":"Chưa xác minh link cũ — bấm để kiểm tra"))
     b.title=url?"Đã có link":known?"Chưa có link — bấm để dán":"Chưa xác minh link cũ — bấm để kiểm tra";
   }
  }
  // One owner-only maintenance control, never visible to Staff.
  if(active.admin&&owner()){
   let button=heading.querySelector(".archive-ipc-index-tools");
   if(!button){
    button=document.createElement("button");button.type="button";
    button.className="archive-ipc-index-tools";button.textContent="↻ Đồng bộ link hồ sơ cũ";
    const close=heading.querySelector(".viewer-close");if(close)close.before(button);else heading.append(button);
    button.addEventListener("click",syncHistory);
   }
   button.hidden=complete;
   button.disabled=syncing;
   let hint=heading.querySelector(".archive-ipc-index-note");
   if(!hint){hint=document.createElement("span");hint.className="archive-ipc-index-note";button.after(hint);}
   const summary=complete?"": "Chỉ Admin · một lần cho các tháng cũ";
   if(hint.textContent!==summary)hint.textContent=summary;
   hint.hidden=complete;
  }
 }
 async function syncHistory(){
  if(syncing||!owner())return;
  const available=months();
  const plans=available.map(m=>typeof m==="string"?{month:m,complete:false}:m).filter(m=>m?.month&&!m.complete);
  if(!plans.length){alert("Các tháng trong Kho đã được đánh dấu đồng bộ.");return;}
  const budget=1200;
  const estimate=plans.reduce((n,m)=>n+Math.max(0,Number(m.rowCount||0)),0);
  if(!confirm("ĐỒNG BỘ LINK HỒ SƠ CŨ CHO CÁC THÁNG?\n\n"+
     "• Khoảng "+estimate+" khoản từ "+plans.length+" tháng (nếu chỉ mục tháng đầy đủ).\n"+
     "• Chỉ Admin được chạy; đọc mỗi khoản cũ một lần và lưu 1 chỉ mục/tháng.\n"+
     "• TỐI ĐA "+budget+" lượt đọc Payment mỗi lần chạy, không tự lặp.\n"+
     "• Không đổi số tiền, UNC hay nội dung PDF.\n\n"+
     "Khi chưa đồng bộ, Staff vẫn có thể bấm Hồ sơ để tra từng khoản như cũ."))return;
  syncing=true;refresh();
  const db=getFirestore(getApp());
  let visited=0,readCount=0,ok=0,skipped=0,errors=0;
  for(const p of plans){
   if(!owner())break;
   const month=String(p.month||"");if(!/^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month))continue;
   try{
    const ref=doc(db,"paymentArchiveDetails",month),summary=doc(db,"paymentArchives",month);
    const snap=await getDoc(ref);if(!snap.exists())continue;
    if(snap.data()?.ipcDocumentLinksComplete===true){
      try{await updateDoc(summary,{ipcDocumentLinksComplete:true});}catch{}
      window.__archiveDossierMarkMonthDone?.(month);ok++;continue;
    }
    const rows=Array.isArray(snap.data()?.rows)?snap.data().rows:[];
    if(readCount+rows.length>budget){alert("Đã dùng khoảng "+readCount+" reads để đối chiếu; còn tháng "+month+" và các tháng sau. Có thể bấm lại để tiếp tục, không tự đọc vượt "+budget+".");break;}
    const links=Object.create(null),unresolved=[];
    // Preserve already confirmed Archive links when the old Payment record
    // is unavailable: historical backfill must never erase existing evidence.
    for(const [id,url] of Object.entries(snap.data()?.ipcDocumentLinks||{}))
      if(validUrl(url))links[id]=validUrl(url);
    for(let i=0;i<rows.length;i+=10){
     const batch=rows.slice(i,i+10);
     const values=await Promise.all(batch.map(async row=>{
      const id=String(row?.paymentId||"").trim();
      if(!id||!row.paymentDate||!(Number(row.actualAmount)>0))return {id,verified:false};
      try{
       const docSnap=await getDoc(doc(db,"payments",id));
       if(!docSnap.exists())return {id,verified:false};
       const data=docSnap.data();
       if(String(data.paymentMonth||"")!==month
         ||norm(data.project)!==norm(row.project)
         ||norm(data.contractNo)!==norm(row.contractNo)
         ||norm(data.ipcNo)!==norm(row.ipcNo))return {id,verified:false};
       return {id,verified:true,url:validUrl(data.ipcDocumentUrl)};
      }catch{return {id,verified:false};}
     }));
     readCount+=batch.filter(x=>String(x?.paymentId||"").trim()).length;
     for(const item of values){
      if(!item.verified){if(item.id&&!links[item.id])unresolved.push(item.id);}
      else if(item.url)links[item.id]=item.url;
      else if(item.id)delete links[item.id];
     }
    }
    // Re-read both metadata docs inside transaction, so concurrent updates do not
    // overwrite newer manual/bulk link edits or financial Archive data.
    await runTransaction(db,async t=>{
     const latest=await t.get(ref),summarySnap=await t.get(summary);
     if(!latest.exists())throw Error("Tháng Kho đã bị xóa.");
     if(latest.data().ipcDocumentLinksComplete===true)return;
     if(JSON.stringify(latest.data().ipcDocumentLinks||{})!==JSON.stringify(snap.data().ipcDocumentLinks||{}))
      throw Error("Link trong Kho thay đổi trong khi quét; cần đối chiếu lại tháng này.");
     t.update(ref,{ipcDocumentLinks:{...links},ipcDocumentLinksUnresolvedIds:unresolved,
       ipcDocumentLinksComplete:true,ipcDocumentLinksIndexedAt:serverTimestamp()});
     if(summarySnap.exists())t.set(summary,{ipcDocumentLinksComplete:true},{merge:true});
    });
    ok++;
    // Update current view without fetching document again.
    if(view()?.month===month)window.__archiveDossierApplyBackfill?.(month,links,unresolved);
    window.__archiveDossierMarkMonthDone?.(month);
   }catch(err){errors++;console.warn("IPC BACKFILL FAILED",month,err);}
   visited++;
   const activeButton=$(".archive-ipc-index-tools",viewer);
   if(activeButton)activeButton.textContent="Đồng bộ "+visited+"/"+plans.length+" tháng…";
  }
  syncing=false;refresh();
  alert("Đồng bộ link hồ sơ cũ: "+ok+" tháng thành công; "+errors+" tháng lỗi; "+readCount+
    " lượt đọc Payment dự kiến (chưa kể đọc kiểm tra Rules). "+
    (errors?"Tháng lỗi chưa đánh dấu hoàn tất; có thể chạy lại sau.":"Staff mở các tháng đã đồng bộ không cần đọc thêm Payment."));
 }
 window.addEventListener("archive-dossier-index-refresh",refresh);
 window.addEventListener("payment-ipc-link-status-changed",refresh);
 new MutationObserver(refresh).observe(viewer,{childList:true,subtree:true});
 refresh();
}
