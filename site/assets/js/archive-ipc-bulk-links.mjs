// Admin-only, explicit bulk linking for payments ALREADY PAID in the opened Archive month.
// Only metadata is read from Google Drive; no PDF files are uploaded/downloaded.
import {getApps,getApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAuth} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {getFirestore,doc,getDoc,runTransaction,serverTimestamp,FieldPath} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {GOOGLE_DRIVE_CLIENT_ID,GOOGLE_DRIVE_SCOPE,folderId,scanDriveFolder,findPaymentPdfCandidates} from "./drive-ipc-lookup.mjs";

const OWNER_UID="HTx2QuATHxh8zgAawwreg88w65M2";
const $=(selector,parent=document)=>parent.querySelector(selector);
const el=(tag,text)=>{const result=document.createElement(tag);if(text!==undefined)result.textContent=text;return result;};
const normalize=value=>String(value??"").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/gi,"d").toUpperCase().replace(/\s+/g,"");
const isPaid=(data,source)=>{
 const rawPaid=Number(data.processActualAmount??data.actualAmount??0);
 return rawPaid>0 && Math.abs(rawPaid-Number(source.actualAmount))<0.01 &&
  String(data.paymentMonth||"")===source.archiveMonth &&
  Boolean(data.processPaymentDate||data.actualPaymentDate||data.paymentDate) &&
  normalize(data.project)===normalize(source.project) &&
  normalize(data.contractNo)===normalize(source.contractNo) &&
  normalize(data.ipcNo)===normalize(source.ipcNo) &&
  data.deleted!==true && data.monthOutcome!=="cancelled" && data.monthOutcome!=="carried_forward";
};
const view=$("#archiveViewer");
if(view){
 const styles=el("style");
 styles.textContent=".archive-ipc-bulk-launch{margin-left:8px;padding:8px 12px;border:1px solid #7896b4;border-radius:8px;color:#154675;background:#e8f3fe;cursor:pointer;font:600 12px system-ui}#archiveIpcOverlay[hidden],#archiveIpcOverlay [hidden]{display:none!important}#archiveIpcOverlay{position:fixed;z-index:179999;inset:0;background:#10293a9e;display:flex;align-items:center;justify-content:center;padding:15px}#archiveIpcPanel{width:min(1050px,98vw);max-height:94vh;overflow:auto;border:1px solid #cbd8e5;background:white;border-radius:14px;box-shadow:0 20px 55px #0005;padding:19px;color:#173650;font:13px system-ui}#archiveIpcPanel h2{margin:0;font-size:19px}#archiveIpcPanel p{line-height:1.5}#archiveIpcPanel label{font-weight:600;display:block;margin:8px 0 5px}#archiveIpcPanel input,#archiveIpcPanel select{box-sizing:border-box;width:100%;border:1px solid #b9c9d9;border-radius:8px;padding:10px;font:inherit;color:#193650;background:white}#archiveIpcPanel button,#archiveIpcPanel .archive-ipc-open{border:1px solid #aebecb;border-radius:8px;padding:8px 11px;background:#fff;color:#17466a;font:600 12px system-ui;cursor:pointer;text-decoration:none}#archiveIpcPanel button.primary{background:#18537d;color:#fff;border-color:#18537d}#archiveIpcPanel button:disabled{opacity:.45;cursor:not-allowed}#archiveIpcPanel .actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:12px 0}#archiveIpcPanel .info{color:#597085;font-size:12px;white-space:pre-line}#archiveIpcPanel .alert{color:#ad2424;font-size:12px}#archiveIpcPanel .scroll{overflow:auto;max-height:48vh;border:1px solid #dce5ee;border-radius:8px}#archiveIpcPanel table{border-collapse:collapse;width:100%;min-width:720px}#archiveIpcPanel th,#archiveIpcPanel td{padding:8px;border-bottom:1px solid #e1e8f0;text-align:left;font-size:12px;vertical-align:middle}#archiveIpcPanel th{background:#e9f2f9;color:#254b6a;position:sticky;top:0}#archiveIpcPanel tr:nth-child(even){background:#f9fbfe}#archiveIpcPanel td select{min-width:220px;padding:7px}#archiveIpcPanel td input[type=checkbox]{width:17px;height:17px}#archiveIpcPanel .status{font-size:11px;color:#5d7184}#archiveIpcPanel .status.error{color:#ae2424}#archiveIpcPanel .status.success{color:#087444}#archiveIpcPanel a{color:#235982}#archiveIpcPanel .row-saved{opacity:.66}";
 document.head.append(styles);
 const overlay=el("div");overlay.id="archiveIpcOverlay";overlay.hidden=true;
 overlay.innerHTML='<section id="archiveIpcPanel" role="dialog" aria-modal="true" aria-labelledby="archiveIpcHeading"><div class="actions" style="justify-content:space-between;margin-top:0"><h2 id="archiveIpcHeading">📁 Đối chiếu Hồ sơ IPC đã thanh toán</h2><button type="button" id="archiveIpcClose">Đóng</button></div><p id="archiveIpcMonth" class="info"></p><label for="archiveIpcFolder">Một link thư mục Google Drive tổng SSIS hoặc thư mục dự án</label><input id="archiveIpcFolder" type="url" placeholder="https://drive.google.com/drive/folders/..." spellcheck="false"><div class="actions"><button type="button" id="archiveIpcConnect">Kết nối Google (chỉ đọc)</button><button class="primary" type="button" id="archiveIpcScan">Quét thư mục & đối chiếu</button></div><p id="archiveIpcStatus" class="info" role="status">Chỉ tìm hồ sơ cho những khoản đã thanh toán trong tháng Kho đang mở. Quét không ghi Firebase.</p><div id="archiveIpcReview" hidden><div class="actions"><b id="archiveIpcSummary"></b><button type="button" id="archiveIpcAllStrong">Chọn các khoản khớp chắc</button><button type="button" id="archiveIpcClear">Bỏ chọn</button></div><p class="info">Kiểm tra PDF trước khi lưu. Khoản có nhiều PDF hoặc thiếu căn cứ sẽ không được chọn tự động. Link đã lưu trước đó không bị ghi đè.</p><div class="scroll"><table><thead><tr><th>Chọn</th><th>Dự án / Hợp đồng / IPC</th><th>PDF được tìm thấy</th><th>Xem</th><th>Kết quả lưu</th></tr></thead><tbody id="archiveIpcRows"></tbody></table></div><div class="actions"><button type="button" class="primary" id="archiveIpcSave">Lưu các link đã duyệt</button><span class="info" id="archiveIpcSelected">Chưa chọn link nào</span></div><p class="info">Mỗi khoản sẽ được kiểm tra lại trên Firebase theo ID thật, tháng, số tiền thực tế, hợp đồng và IPC trước khi ghi. Tối đa 40 link mỗi lần bấm. Không cập nhật UNC, tiền hay tiến trình.</p></div></section>';
 document.body.append(overlay);
 const panel=$("#archiveIpcPanel"),root=$("#archiveIpcFolder"),status=$("#archiveIpcStatus"),review=$("#archiveIpcReview");
 const rowsTarget=$("#archiveIpcRows"),saveButton=$("#archiveIpcSave"),selectedInfo=$("#archiveIpcSelected");
 let db=null,auth=null,googleClient=null,googleToken="",expiry=0,currentMonth="",archiveRows=[],proposals=[],scanning=false,saving=false,scanPartial=false;
 const message=(s,error=false)=>{status.textContent=s;status.className=error?"alert":"info";};
 function init(){
  if(!getApps().length)throw Error("Firebase chưa khởi tạo. Mở lại Kho chứng từ.");
  const app=getApp();db=getFirestore(app);auth=getAuth(app);
 }
 function rowsForCurrentMonth(){
  return typeof window.__archivePaidIpcRows==="function"?window.__archivePaidIpcRows():[];
 }
 const allowed=()=>getApps().length&&getAuth(getApp()).currentUser?.uid===OWNER_UID;
 async function ownerGuard(){
  init();const uid=auth.currentUser?.uid;
  if(uid!==OWNER_UID)throw Error("Chỉ Admin chủ sở hữu được gắn link hồ sơ.");
  const s=await getDoc(doc(db,"authUsers",uid));
  const data=s.exists()?s.data():{};
  if(String(data.role||"").toLowerCase()!=="admin"||data.disabled===true||data.active===false)throw Error("Admin không được cấp quyền.");
  return uid;
 }
 const syncSelected=()=>{
  const checked=proposals.filter(x=>x.checked&&!x.saved);
  selectedInfo.textContent=checked.length+" link được chọn";
  saveButton.disabled=saving||!checked.length;
 };
 function decorate(){
  if(!allowed())return;
  const heading=$(".viewer-heading",view),table=$(".viewer-table:not(.global-search-table)",view);
  if(!heading||!table||$(".archive-ipc-bulk-launch",heading))return;
  if(!rowsForCurrentMonth().length)return;
  const b=el("button","📁 Quét & gắn hồ sơ hàng loạt");
  b.type="button";b.className="archive-ipc-bulk-launch";
  const close=$(".viewer-close",heading);
  if(close)close.before(b);else heading.append(b);
  b.addEventListener("click",async()=>{
   try{
    await ownerGuard();
    const latest=rowsForCurrentMonth();
    if(!latest.length)throw Error("Hãy mở một tháng đã thanh toán trong Kho.");
    archiveRows=latest;currentMonth=String(latest[0].archiveMonth);
    $("#archiveIpcMonth").textContent="Tháng "+currentMonth+" · "+archiveRows.length+" khoản đã trả có ID để đối chiếu. Không quét các khoản tháng hiện tại chưa thanh toán.";
    review.hidden=true;rowsTarget.replaceChildren();proposals=[];
    overlay.hidden=false;message("Dán link SSIS tổng và kết nối tài khoản Google được chia sẻ để quét.");
   }catch(e){alert(e.message||String(e));}
  });
 }
 new MutationObserver(decorate).observe(view,{childList:true,subtree:true});
 // The on-auth Archive rendering creates the table; no extra database calls needed to detect it.
 decorate();
 const close=()=>{if(saving||scanning)return;overlay.hidden=true;proposals=[];rowsTarget.replaceChildren();};
 $("#archiveIpcClose").addEventListener("click",close);
 overlay.addEventListener("click",event=>{if(event.target===overlay)close();});
 document.addEventListener("keydown",event=>{if(event.key==="Escape"&&!overlay.hidden)close();});
 async function ensureGoogle(){
  if(window.google?.accounts?.oauth2)return;
  let script=document.querySelector('script[data-ipc-google-oauth]');
  if(!script){
   script=el("script");script.dataset.ipcGoogleOauth="1";script.src="https://accounts.google.com/gsi/client";
   script.async=true;document.head.append(script);
  }
  await new Promise((resolve,reject)=>{
   if(window.google?.accounts?.oauth2)return resolve();
   const timer=setTimeout(()=>reject(Error("Không tải được Google Identity. Kiểm tra mạng hoặc popup.")),15000);
   script.addEventListener("load",()=>{clearTimeout(timer);resolve();},{once:true});
   script.addEventListener("error",()=>{clearTimeout(timer);reject(Error("Google Identity bị chặn."));},{once:true});
  });
  if(!window.google?.accounts?.oauth2)throw Error("Google Identity chưa sẵn sàng.");
 }
 $("#archiveIpcConnect").addEventListener("click",async()=>{
  const btn=$("#archiveIpcConnect");btn.disabled=true;
  try{
   await ensureGoogle();
   googleClient=window.google.accounts.oauth2.initTokenClient({
    client_id:GOOGLE_DRIVE_CLIENT_ID,scope:GOOGLE_DRIVE_SCOPE,include_granted_scopes:false,
    callback:response=>{
     if(response.error){message("Google từ chối: "+(response.error_description||response.error),true);return;}
     if(!String(response.scope||"").includes("drive.metadata.readonly")){message("Google chưa cho quyền chỉ đọc tên file.",true);return;}
     googleToken=response.access_token;expiry=Date.now()+Math.max(0,Number(response.expires_in||3600)-60)*1000;
     message("Đã kết nối Google. Bấm Quét thư mục & đối chiếu.");
    },
    error_callback:error=>message("Kết nối Google lỗi: "+(error.message||error.type||"không rõ"),true)
   });
   googleClient.requestAccessToken({prompt:"select_account"});
  }catch(e){message(e.message||String(e),true);}
  finally{btn.disabled=false;}
 });
 function makeOptions(item,proposal){
  const candidates=proposal.candidates;
  const input=el("select");
  for(const file of candidates){
   const prefix=file.confidence==="strong"?"Khớp: ":"Kiểm tra: ";
   input.add(new Option(prefix+file.name+" · "+file.path,file.id));
  }
  input.value=candidates[0].id;
  const open=el("a","Mở PDF");open.className="archive-ipc-open";
  open.target="_blank";open.rel="noopener noreferrer";
  const update=()=>{const file=candidates.find(x=>x.id===input.value);if(file)open.href=file.url;};
  input.addEventListener("change",()=>{
   proposal.checked=false;proposal.selectedId=input.value;
   proposal.checkbox.checked=false;update();syncSelected();
  });
  update();proposal.selectedId=input.value;
  return {input,open};
 }
 function render(scan){
  proposals=[];rowsTarget.replaceChildren();
  let noCandidates=0,ambiguous=0,strong=0;
  for(const data of archiveRows){
   if(!data.id||!data.contractNo||!data.ipcNo){noCandidates++;continue;}
   const candidates=findPaymentPdfCandidates(data,scan);
   if(!candidates.length){noCandidates++;continue;}
   const unique=candidates.length===1&&candidates[0].confidence==="strong";
   if(unique)strong++;else ambiguous++;
   const tr=el("tr");const selectCell=el("td"),description=el("td");
   const selector=el("input");selector.type="checkbox";selector.setAttribute("aria-label","Chọn hồ sơ "+data.project+" "+data.ipcNo);
   const proposal={data,candidates,checked:false,saved:false,selectedId:"",checkbox:selector};
   selector.addEventListener("change",()=>{proposal.checked=selector.checked;syncSelected();});
   selectCell.append(selector);
   description.append(el("b",data.project+" · "+data.ipcNo),el("div",data.contractNo));
   const cells=makeOptions(data,proposal);
   const selectTd=el("td");selectTd.append(cells.input);
   const openTd=el("td");openTd.append(cells.open);
   const result=el("td","Chưa lưu");result.className="status";proposal.result=result;proposal.row=tr;
   tr.append(selectCell,description,selectTd,openTd,result);rowsTarget.append(tr);
   proposals.push(proposal);
  }
  review.hidden=false;
  $("#archiveIpcSummary").textContent=strong+" khớp chắc · "+ambiguous+" cần chọn · "+noCandidates+" chưa tìm thấy (trong "+archiveRows.length+" khoản)";
  if(!proposals.length){const tr=el("tr"),td=el("td","Không có PDF khớp. Kiểm tra tên hợp đồng/IPC hoặc thư mục Drive.");td.colSpan=5;tr.append(td);rowsTarget.append(tr);}
  syncSelected();
 }
 $("#archiveIpcScan").addEventListener("click",async()=>{
  if(scanning)return;
  const id=folderId(root.value);
  if(!id){message("Dán link thư mục Drive tổng, không phải link PDF.",true);return;}
  if(!googleToken||Date.now()>=expiry){message("Bấm Kết nối Google trước bằng tài khoản được chia sẻ thư mục.",true);return;}
  if(!archiveRows.length){message("Không tìm thấy khoản đã trả trong tháng được chọn.",true);return;}
  scanning=true;$("#archiveIpcScan").disabled=true;review.hidden=true;rowsTarget.replaceChildren();proposals=[];
  try{
   const result=await scanDriveFolder({folderId:id,token:googleToken,onProgress:p=>message("Đang quét "+p.readFolders+" thư mục · "+p.items+" mục · "+p.pdfs+" PDF")});
   scanPartial=!!result.partial;
   if(result.partial)message("CẢNH BÁO: Quét chưa hết thư mục Drive. Chọn thư mục nhỏ hơn rồi quét lại trước khi lưu để không gắn nhầm.",true);
   else message("Quét xong "+result.readFolders+" thư mục · "+result.files.length+" PDF. Chỉ duyệt/lưu sau khi kiểm tra.");
   render(result);
  }catch(e){message("Không quét được: "+(e.message||e),true);}
  finally{scanning=false;$("#archiveIpcScan").disabled=false;}
 });
 $("#archiveIpcAllStrong").addEventListener("click",()=>{
  if(scanPartial){message("Chưa thể chọn hàng loạt: thư mục Drive chưa được quét hết. Hãy chọn thư mục nhỏ hơn.",true);return;}
  for(const p of proposals){
   if(!p.saved&&p.candidates.length===1&&p.candidates[0].confidence==="strong"){p.checked=true;p.checkbox.checked=true;}
  }
  syncSelected();
 });
 $("#archiveIpcClear").addEventListener("click",()=>{
  for(const p of proposals){p.checked=false;p.checkbox.checked=false;}
  syncSelected();
 });
 $("#archiveIpcSave").addEventListener("click",async()=>{
  if(saving)return;
  let pending=proposals.filter(p=>p.checked&&!p.saved);
  if(!pending.length)return;
  if(scanPartial){message("Chưa thể lưu: kết quả quét Drive chưa đầy đủ. Hãy quét thư mục hẹp hơn.",true);return;}
  if(pending.length>40){message("Tối đa 40 khoản mỗi lượt. Bỏ chọn bớt rồi lưu tiếp.",true);return;}
  const label="Lưu "+pending.length+" link PDF vào khoản thanh toán đã trả của tháng "+currentMonth+"? Chỉ cập nhật trường hồ sơ, KHÔNG ghi đè link cũ, tiền, UNC hay tiến trình.";
  if(!confirm(label))return;
  saving=true;saveButton.disabled=true;let saved=0,skipped=0,failed=0;const savedLinks=[];
  try{
   const uid=await ownerGuard();
   for(const p of pending){
    const file=p.candidates.find(f=>f.id===p.selectedId);
    if(!file||!/^[A-Za-z0-9_-]{8,}$/.test(String(file.id||""))||!(file.mimeType==="application/pdf"||/\.pdf$/i.test(file.name||""))){
     p.result.textContent="Không chọn được PDF chuẩn";p.result.className="status error";failed++;continue;
    }
    if(auth.currentUser?.uid!==uid||currentMonth!==p.data.archiveMonth){
     p.result.textContent="Quyền hoặc tháng đã thay đổi";p.result.className="status error";failed++;continue;
    }
    try{
     const pdfUrl="https://drive.google.com/file/d/"+encodeURIComponent(file.id)+"/view";
     const outcome=await runTransaction(db,async transaction=>{
      const ref=doc(db,"payments",p.data.id);
      const latest=await transaction.get(ref);
      if(!latest.exists())return "missing";
      const data=latest.data();
      if(!isPaid(data,p.data))return "mismatch";
      if(data.ipcDocumentUrl)return "existing";
      transaction.update(ref,{ipcDocumentUrl:pdfUrl,ipcDocumentUpdatedAt:serverTimestamp(),ipcDocumentUpdatedByUid:uid});
       transaction.update(doc(db,"paymentArchiveDetails",currentMonth),new FieldPath("ipcDocumentLinks",p.data.id),pdfUrl);
      return "saved";
     });
     if(outcome==="saved"){
      window.dispatchEvent(new CustomEvent("payment-ipc-link-status-changed",{detail:{paymentId:p.data.id,linked:true}}));
      p.saved=true;p.checked=false;p.checkbox.checked=false;p.checkbox.disabled=true;
      p.row.classList.add("row-saved");p.result.textContent="✓ Đã lưu";p.result.className="status success";saved++;savedLinks.push([p.data.id,pdfUrl]);
     }else{
      p.checked=false;p.checkbox.checked=false;p.checkbox.disabled=true;
      p.result.textContent=outcome==="existing"?"Đã có link, không ghi đè":outcome==="missing"?"Không có khoản gốc trong Payment":"Dữ liệu khoản đã thay đổi hoặc không còn đã trả";
      p.result.className="status error";skipped++;
     }
    }catch(e){p.result.textContent="Lưu lỗi: "+(e.message||e);p.result.className="status error";failed++;}
   }
   if(savedLinks.length)window.__archiveDossierUpdateLocal?.(currentMonth,Object.fromEntries(savedLinks));
   message("Đã lưu "+saved+" link · bỏ qua "+skipped+" · lỗi "+failed+". Payment và Kho cập nhật cùng một giao dịch.");
  }catch(e){message("Không xác thực được Admin: "+(e.message||e),true);}
  finally{saving=false;syncSelected();}
 });
}
