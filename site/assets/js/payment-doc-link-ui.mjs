// IPC document hyperlinks. Explicit user click only; never auto-query Firestore.
import {getApps,getApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {getFirestore,doc,getDoc,updateDoc,deleteField,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
const OWNER_ADMIN_UID="HTx2QuATHxh8zgAawwreg88w65M2";
const $=(s,p=document)=>p.querySelector(s);
const clean=s=>String(s??"").trim();
const driveUrl=raw=>{
 try{
  const u=new URL(clean(raw));
  if(u.protocol!=="https:"||u.username||u.password||!["drive.google.com","docs.google.com"].includes(u.hostname))return "";
  const id=u.pathname.match(/\/(?:folders|file\/d|document\/d|spreadsheets\/d|presentation\/d|forms\/d)\/([A-Za-z0-9_-]{8,})(?:\/|$)/)?.[1]||(u.pathname==="/open"?u.searchParams.get("id"):"");
  if(!id||!(/^[A-Za-z0-9_-]{8,}$/).test(id)||u.href.length>2048)return "";
  return u.href;
 }catch{return "";}
};
const style=document.createElement("style");
style.textContent=".payment-doc-link-btn{display:inline-flex;align-items:center;justify-content:center;min-width:29px;height:29px;padding:0 5px;border:1px solid var(--theme-border,#d5dce5);border-radius:7px;background:var(--theme-surface,#fff);color:var(--theme-primary,#2457a7);cursor:pointer;margin-left:3px;font-size:15px;vertical-align:middle}.payment-doc-link-btn:hover{background:var(--theme-surface-alt,#eef4ff)}.payment-doc-link-btn.has-linked{color:#087142;border-color:#b8dbc9;background:#edf8f1}.payment-doc-archive-btn{min-width:unset;height:auto;padding:5px 7px;font-size:11px;margin:0}#docLinkOverlay[hidden],#docLinkOverlay [hidden]{display:none!important}#docLinkOverlay{position:fixed;inset:0;z-index:169999;background:#0008;display:flex;align-items:center;justify-content:center;padding:16px}#docLinkDialog{box-sizing:border-box;max-width:570px;width:100%;max-height:94vh;overflow:auto;border:1px solid #d7e1ed;border-radius:14px;padding:22px;background:#fff;color:#19324e;box-shadow:0 18px 52px #0004;font:14px system-ui,-apple-system,Segoe UI,sans-serif}#docLinkDialog h2{font-size:20px;margin:0 0 10px}#docLinkDialog p{line-height:1.5;margin:6px 0 12px}#docLinkDialog label{font-weight:650;font-size:13px;display:block;margin:12px 0 5px}#docLinkDialog input{box-sizing:border-box;display:block;width:100%;border:1px solid #bbc8d6;padding:10px;font:inherit;border-radius:8px;background:white;color:#19324e}#docLinkDialog .buttons{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-top:16px}#docLinkDialog button,#docLinkDialog a{border:1px solid #bdccdb;background:white;color:#1d4c79;border-radius:8px;padding:9px 12px;cursor:pointer;text-decoration:none;font:600 13px system-ui}#docLinkDialog button.primary{background:#1f5280;border-color:#1f5280;color:white}#docLinkDialog button.danger{color:#aa2929}#docLinkDialog button:disabled{opacity:.5;cursor:default}#docLinkDialog .msg{margin:12px 0 0;font-size:12px;white-space:pre-line;color:#5f7183}#docLinkDialog .msg.error{color:#bd2424}";
document.head.appendChild(style);
const wrapper=document.createElement("div");wrapper.id="docLinkOverlay";wrapper.hidden=true;
wrapper.innerHTML='<div id="docLinkDialog" role="dialog" aria-modal="true" aria-labelledby="docLinkTitle"><h2 id="docLinkTitle">📁 Hồ sơ thanh toán</h2><p id="docLinkItem"></p><p style="font-size:12px">Link nằm trên Google Drive. Người mở vẫn cần quyền xem do chủ sở hữu cấp.</p><div id="docLinkEditor" hidden><label for="docLinkInput">Link PDF hoặc thư mục Google Drive</label><input id="docLinkInput" type="url" autocomplete="off" spellcheck="false" placeholder="https://drive.google.com/..."></div><div class="buttons"><a id="docLinkOpen" target="_blank" rel="noopener noreferrer" hidden>Mở hồ sơ</a><button id="docLinkSave" class="primary" hidden>Lưu link</button><button id="docLinkRemove" class="danger" hidden>Gỡ link</button><button id="docLinkClose">Đóng</button></div><div id="docLinkMessage" class="msg" aria-live="polite"></div></div>';
document.body.appendChild(wrapper);
const input=$("#docLinkInput"),openBtn=$("#docLinkOpen"),save=$("#docLinkSave"),remove=$("#docLinkRemove"),msg=$("#docLinkMessage");
const notice=(v,error=false)=>{msg.textContent=v;msg.className="msg"+(error?" error":"");};
let auth,db,rolePromise=null,activeId="",activeUrl="",busy=false,generation=0,canWrite=false;
const init=()=>{
 if(db)return true;
 if(!getApps().length)return false;
 const app=getApp();auth=getAuth(app);db=getFirestore(app);
 onAuthStateChanged(auth,()=>{rolePromise=null;});
 return true;
};
const role=async()=>{
 if(!auth?.currentUser)return {admin:false};
 if(!rolePromise){
  const uid=auth.currentUser.uid;
  rolePromise=getDoc(doc(db,"authUsers",uid)).then(s=>{
   const d=s.exists()?s.data():{};
   return {admin:uid===OWNER_ADMIN_UID&&String(d.role||"").toLowerCase()==="admin"&&d.disabled!==true&&d.active!==false,uid};
  }).catch(e=>{rolePromise=null;throw e;});
 }
 return rolePromise;
};
const setEditor=allowed=>{
 canWrite=allowed;
 $("#docLinkEditor").hidden=!allowed;save.hidden=!allowed;remove.hidden=!allowed;
};
const setLink=value=>{
 activeUrl=driveUrl(value);openBtn.hidden=!activeUrl;
 if(activeUrl)openBtn.href=activeUrl;else openBtn.removeAttribute("href");
 remove.disabled=!activeUrl;
};
const setBusy=value=>{busy=value;save.disabled=input.disabled=value;remove.disabled=value||!activeUrl;};
const mark=(id,linked)=>{
 for(const b of document.querySelectorAll(".payment-doc-link-btn")){
  if(b.dataset.paymentId===id){b.classList.toggle("has-linked",linked);b.title=linked?"Mở hồ sơ thanh toán":"Hồ sơ thanh toán";}
 }
};
async function showLink(id){
 if(!id||!init())return;
 if(!auth.currentUser){alert("Cần đăng nhập Payment trước.");return;}
 activeId=id;const token=++generation;
 setEditor(false);setBusy(false);setLink("");input.value="";
 $("#docLinkItem").textContent="Mã khoản: "+id;
 wrapper.hidden=false;notice("Đang đọc liên kết của khoản này…");
 try{
  const [paymentSnap,user]=await Promise.all([getDoc(doc(db,"payments",id)),role()]);
  if(token!==generation||wrapper.hidden)return;
  if(!paymentSnap.exists()){notice("Không tìm thấy khoản này trong Firebase. Không thể gắn link.",true);return;}
  const p=paymentSnap.data();
  $("#docLinkItem").textContent=[p.project,p.contractNo,p.ipcNo].filter(Boolean).join(" · ")||"Mã khoản: "+id;
  setLink(p.ipcDocumentUrl);input.value=activeUrl;setEditor(user.admin);
  notice(activeUrl?"Đã có link hồ sơ. Chỉ Admin có thể sửa.":"Chưa gắn hồ sơ cho khoản này.");
  mark(id,!!activeUrl);
 }catch(e){if(token===generation)notice("Không đọc được hồ sơ: "+(e?.message||e),true);}
}
const close=()=>{if(busy)return;generation++;wrapper.hidden=true;activeId="";setLink("");};
$("#docLinkClose").addEventListener("click",close);
wrapper.addEventListener("click",e=>{if(e.target===wrapper)close();});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!wrapper.hidden)close();});
save.addEventListener("click",async()=>{
 if(busy||!activeId||!canWrite)return;
 const url=driveUrl(input.value);
 if(!url){notice("Chỉ nhận link Google Drive hoặc Docs hợp lệ.",true);return;}
 setBusy(true);notice("Đang lưu link…");
 try{
  const u=await role();
  if(!u.admin||u.uid!==auth.currentUser?.uid)throw Error("Chỉ Admin có quyền sửa.");
  await updateDoc(doc(db,"payments",activeId),{ipcDocumentUrl:url,ipcDocumentUpdatedAt:serverTimestamp(),ipcDocumentUpdatedByUid:u.uid});
  setLink(url);mark(activeId,true);notice("Đã lưu link trên đúng khoản. Payment và Kho cùng sử dụng liên kết này.");
 }catch(e){notice("Không lưu được: "+(e?.message||e)+". Kiểm tra quyền Firebase.",true);}
 finally{setBusy(false);}
});
remove.addEventListener("click",async()=>{
 if(busy||!activeId||!activeUrl||!canWrite)return;
 if(!confirm("Gỡ link khỏi khoản này? File Drive và UNC sẽ được giữ nguyên."))return;
 setBusy(true);notice("Đang gỡ link…");
 try{
  const u=await role();
  if(!u.admin||u.uid!==auth.currentUser?.uid)throw Error("Chỉ Admin có quyền gỡ.");
  await updateDoc(doc(db,"payments",activeId),{ipcDocumentUrl:deleteField(),ipcDocumentUpdatedAt:deleteField(),ipcDocumentUpdatedByUid:deleteField()});
  setLink("");input.value="";mark(activeId,false);notice("Đã gỡ link. Không xóa bất kỳ file nào.");
 }catch(e){notice("Không gỡ được: "+(e?.message||e),true);}
 finally{setBusy(false);}
});
const button=(id,archive=false)=>{
 const b=document.createElement("button");b.type="button";
 b.className="payment-doc-link-btn"+(archive?" payment-doc-archive-btn":"");
 b.dataset.paymentId=id;b.textContent=archive?"📁 Hồ sơ":"📁";b.title="Hồ sơ thanh toán";b.setAttribute("aria-label","Hồ sơ thanh toán");
 return b;
};
const payment=$("#paymentBody");
if(payment){
 const decorate=()=>{
  for(const row of payment.querySelectorAll("tr")){
   const at=$(".timeline-detail-btn[data-id]",row);
   if(at&&!$(".payment-doc-link-btn",row)&&at.dataset.id)at.before(button(at.dataset.id));
  }
 };
 new MutationObserver(decorate).observe(payment,{childList:true,subtree:true});decorate();
 payment.addEventListener("click",e=>{
  const b=e.target.closest(".payment-doc-link-btn");
  if(b&&payment.contains(b)){e.preventDefault();showLink(b.dataset.paymentId);}
 });
}
const archive=$("#archiveViewer");
if(archive){
 const decorate=()=>{
  const table=$(".viewer-table",archive);if(!table)return;
  const head=$("thead tr",table);
  if(head&&!$("th[data-ipc-doc-head]",head)){
   const th=document.createElement("th");th.dataset.ipcDocHead="1";th.textContent="Hồ sơ";head.append(th);
  }
  for(const row of table.tBodies[0]?.rows||[]){
   if(row.classList.contains("project-detail-row")){
    if($("td[data-ipc-doc-cell]",row))continue;
    const cell=document.createElement("td");cell.dataset.ipcDocCell="1";cell.className="center";
    const id=clean(row.dataset.paymentId);
    if(id)cell.append(button(id,true));else cell.textContent="—";
    row.append(cell);
   }else for(const cell of row.cells)if(cell.colSpan===9)cell.colSpan=10;
  }
 };
 new MutationObserver(decorate).observe(archive,{childList:true,subtree:true});decorate();
 archive.addEventListener("click",e=>{
  const b=e.target.closest(".payment-doc-link-btn");
  if(b&&archive.contains(b)){e.preventDefault();showLink(b.dataset.paymentId);}
 });
}
