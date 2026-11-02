// In-Payment Google Drive picker: metadata-only scan, explicit user approval per link.
import {GOOGLE_DRIVE_CLIENT_ID,GOOGLE_DRIVE_SCOPE,folderId,scanDriveFolder,findPaymentPdfCandidates} from "./drive-ipc-lookup.mjs";
const el=(tag,txt)=>{const node=document.createElement(tag);if(txt!=null)node.textContent=txt;return node;};
export function createIpcDrivePicker({editor,linkInput,getBatchRows,saveBatchLink}){
 const panel=el("section");panel.id="ipcDrivePicker";
 panel.innerHTML='<h3>🔍 Tự tìm PDF đúng hợp đồng + IPC</h3><p style="font-size:12px;margin:2px 0 10px">Dán <b>một link thư mục</b> (SSIS tổng, dự án, SUPL-024 hoặc IPC). Hệ thống dò PDF bên trong, m xem và chọn đúng file trước khi lưu. Không tự gắn link.</p><label for="ipcDriveRoot">Link thư mục Google Drive được chia sẻ</label><input id="ipcDriveRoot" type="url" placeholder="https://drive.google.com/drive/folders/..." spellcheck="false"><div class="ipc-picker-actions"><button type="button" id="ipcDriveConnect">Kết nối Google (chỉ đọc)</button><button type="button" id="ipcDriveScan" class="primary">Quét thư mục</button><button type="button" id="ipcDriveBatch" hidden>Đối chiếu các khoản đang hiển thị</button></div><p id="ipcDriveStatus" class="ipc-picker-status" role="status">Chưa quét. Sau lần quét đầu, có thể dùng lại kết quả cho các khoản khác trong tab này.</p><div id="ipcDriveSingle" hidden><label for="ipcDriveResults">PDF tìm được cho khoản này</label><select id="ipcDriveResults"></select><div class="ipc-picker-actions"><a id="ipcDrivePreview" target="_blank" rel="noopener noreferrer">Xem PDF trước</a><button type="button" id="ipcDriveChoose" class="primary">Chọn PDF này</button></div><p id="ipcDriveMatchNote" class="ipc-picker-status"></p></div><div id="ipcDriveBatchResults" hidden><div class="ipc-picker-actions"><b id="ipcDriveBatchTitle"></b><button type="button" id="ipcDriveCloseBatch">Thu gọn</button></div><div id="ipcDriveBatchRows" class="ipc-batch-list"></div></div>';
 const st=el("style");st.textContent="#ipcDrivePicker{margin-top:14px;padding:12px;border:1px solid #cbdbe8;border-radius:10px;background:#f6f9fd}#ipcDrivePicker h3{font:650 14px system-ui;margin:0 0 7px}#ipcDrivePicker .ipc-picker-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:9px 0}#ipcDrivePicker select{width:100%;padding:9px;font:13px system-ui;border:1px solid #bbc8d6;border-radius:7px}#ipcDrivePicker .ipc-picker-status{font:12px system-ui;color:#5d7184;line-height:1.45;white-space:pre-line}#ipcDrivePicker button:disabled{opacity:.5}#ipcDrivePicker .ipc-picker-actions a{display:inline-block;border:1px solid #bacbd9;padding:9px;border-radius:8px;text-decoration:none;color:#1f5280;font:600 13px system-ui}.ipc-batch-list{max-height:270px;overflow-y:auto;border-top:1px solid #d7e1eb}.ipc-batch-row{border-bottom:1px solid #d7e1eb;padding:9px 0;font:12px system-ui}.ipc-batch-row .ipc-picker-actions{margin-bottom:0}.ipc-batch-row select{max-width:100%}#docLinkDialog:has(#ipcDriveBatchResults:not([hidden])){max-width:900px}";
 document.head.append(st);editor.append(panel);
 const $=selector=>panel.querySelector(selector);
 const root=$("#ipcDriveRoot"),connect=$("#ipcDriveConnect"),scan=$("#ipcDriveScan"),batch=$("#ipcDriveBatch");
 const status=$("#ipcDriveStatus"),single=$("#ipcDriveSingle"),options=$("#ipcDriveResults");
 const preview=$("#ipcDrivePreview"),choose=$("#ipcDriveChoose"),note=$("#ipcDriveMatchNote");
 const batchBox=$("#ipcDriveBatchResults"),batchRows=$("#ipcDriveBatchRows");
 let googleToken="",expiry=0,googleClient=null,lastScan=null,lastId="",activePayment=null;
 let activeCandidates=[],generation=0,scanning=false;
 const message=value=>{status.textContent=value;};
 const connected=()=>Boolean(googleToken)&&Date.now()<expiry;
 async function loadGoogle(){
  if(window.google?.accounts?.oauth2)return;
  let script=document.querySelector('script[data-ipc-google-oauth]');
  if(!script){
   script=el("script");script.dataset.ipcGoogleOauth="1";script.src="https://accounts.google.com/gsi/client";
   script.async=true;document.head.append(script);
  }
  await new Promise((resolve,reject)=>{
   if(window.google?.accounts?.oauth2)return resolve();
   const timeout=setTimeout(()=>reject(Error("Google Identity không phản hồi. Kiểm tra mạng hoặc chặn popup.")),15000);
   script.addEventListener("load",()=>{clearTimeout(timeout);resolve();},{once:true});
   script.addEventListener("error",()=>{clearTimeout(timeout);reject(Error("Không tải được Google Identity."));},{once:true});
  });
  if(!window.google?.accounts?.oauth2)throw Error("Google Identity chưa sẵn sàng.");
 }
 connect.addEventListener("click",async()=>{
  connect.disabled=true;message("Đang mở tài khoản Google có quyền xem thư mục…");
  try{
   await loadGoogle();
   googleClient=google.accounts.oauth2.initTokenClient({
    client_id:GOOGLE_DRIVE_CLIENT_ID,scope:GOOGLE_DRIVE_SCOPE,include_granted_scopes:false,
    callback:response=>{
     if(response.error){message("Google từ chối: "+(response.error_description||response.error));return;}
     if(!String(response.scope||"").includes("drive.metadata.readonly")){message("Chưa được cấp quyền chỉ đọc danh sách file.");return;}
     googleToken=response.access_token;expiry=Date.now()+Math.max(0,Number(response.expires_in||3600)-60)*1000;
     message("Đã kết nối Google. Bấm Quét thư mục để tìm file, không tự lưu link.");
    },
    error_callback:error=>message("Không kết nối được: "+(error.message||error.type||"không rõ"))
   });
   googleClient.requestAccessToken({prompt:"select_account"});
  }catch(e){message(e.message||String(e));}
  finally{connect.disabled=false;}
 });
 function singleMatches(){
  single.hidden=true;activeCandidates=[];options.replaceChildren();
  if(!lastScan||!activePayment)return;
  activeCandidates=findPaymentPdfCandidates(activePayment,lastScan);
  if(!activeCandidates.length){message("Đã quét Drive nhưng chưa tìm được PDF có đúng số hợp đồng và IPC cho khoản này. Có thể dùng link PDF dán tay.");return;}
  for(const f of activeCandidates){
   const tag=f.confidence==="strong"?"[Khớp HĐ + IPC] ":"[Cần kiểm tra dự án] ";
   options.add(new Option(tag+f.name+" · "+f.path,f.id));
  }
  single.hidden=false;
  options.selectedIndex=0;updateChoice();
  message("Có "+activeCandidates.length+" PDF ứng viên. Hãy mở kiểm tra và chọn đúng kỳ IPC trước khi lưu.");
 }
 function updateChoice(){
  const found=activeCandidates.find(f=>f.id===options.value);
  if(found){preview.href=found.url;preview.hidden=false;choose.disabled=false;
   note.textContent=found.confidence==="review"?"Chưa xác định chắc tên dự án vì link bắt đầu từ thư mục con; bắt buộc mở PDF kiểm tra.":"Khớp mã HĐ và IPC trong tên/đường dẫn. Vẫn cần xem nội dung PDF.";}
  else{preview.hidden=true;choose.disabled=true;}
 }
 options.addEventListener("change",updateChoice);
 choose.addEventListener("click",()=>{
  const found=activeCandidates.find(f=>f.id===options.value);
  if(!found)return;
  linkInput.value=found.url;
  message("Đã chọn file: "+found.name+". Bấm «Lưu link» bên trên để ghi đúng khoản thanh toán. Chưa tự lưu.");
  linkInput.dispatchEvent(new Event("input",{bubbles:true}));
 });
 scan.addEventListener("click",async()=>{
  const id=folderId(root.value);
  if(!id){message("Hãy dán link thư mục Drive, không phải link PDF.");return;}
  if(scanning)return;
  if(lastScan&&id===lastId){message("Đang dùng kết quả quét đã có trong tab (không gọi Drive lần nữa).");singleMatches();return;}
  if(!connected()){message("Cần bấm Kết nối Google trước; dùng tài khoản đã được chia sẻ thư mục.");return;}
  scanning=true;scan.disabled=true;batchBox.hidden=true;single.hidden=true;const current=++generation;
  message("Đang quét thư mục và các thư mục con…");
  try{
   const result=await scanDriveFolder({folderId:id,token:googleToken,onProgress:p=>{if(current===generation)message("Đã đọc "+p.readFolders+" thư mục, "+p.items+" mục, "+p.pdfs+" PDF…");}});
   if(current!==generation)return;
   lastScan=result;lastId=id;
   message("Đã quét "+result.readFolders+" thư mục, "+result.files.length+" PDF."+(result.partial?" CẢNH BÁO: chưa quét hết; hãy chọn thư mục nhỏ hơn.":""));
   singleMatches();
  }catch(e){if(current===generation)message("Không quét được: "+(e?.message||e));}
  finally{scanning=false;scan.disabled=false;}
 });
 async function renderBatch(){
  batchBox.hidden=false;batchRows.replaceChildren();
  const rows=(getBatchRows?.()||[]).slice(0,150);
  const valid=rows.filter(p=>p.id&&p.contractNo&&p.ipcNo&&p.project);
  let matches=0;
  for(const p of valid){
   const files=findPaymentPdfCandidates(p,lastScan);
   if(!files.length)continue;
   matches++;
   const row=el("div");row.className="ipc-batch-row";
   row.append(el("b",[p.project,p.contractNo,p.ipcNo].join(" · ")));
   const controls=el("div");controls.className="ipc-picker-actions";
   const select=el("select");
   for(const f of files)select.add(new Option((f.confidence==="strong"?"Khớp: ":"Kiểm tra: ")+f.name,f.id));
   const a=el("a","Xem PDF");a.target="_blank";a.rel="noopener noreferrer";
   const save=el("button","Duyệt & lưu link");save.type="button";
   const label=el("span");label.style.color="#637589";
   const chosen=()=>files.find(f=>f.id===select.value);
   const setPreview=()=>{const f=chosen();if(f)a.href=f.url;};
   select.addEventListener("change",setPreview);setPreview();
   save.addEventListener("click",async()=>{
    const f=chosen();if(!f)return;
    save.disabled=true;label.textContent="Đang kiểm tra khoản và lưu…";
    try{
     await saveBatchLink(p,f.url);
     label.textContent="✓ Đã lưu đúng PDF";label.style.color="#087142";
     if(activePayment?.id===p.id)linkInput.value=f.url;
    }catch(e){label.textContent="Chưa lưu: "+(e?.message||e);label.style.color="#b42318";save.disabled=false;}
   });
   controls.append(select,a,save,label);row.append(controls);batchRows.append(row);
  }
  $("#ipcDriveBatchTitle").textContent=matches+"/"+valid.length+" khoản có ứng viên · duyệt từng khoản";
  if(rows.length>=150)batchRows.prepend(el("p","Giới hạn hiển thị 150 khoản: lọc dự án hoặc tháng để xem phần còn lại."));
  if(!matches)batchRows.append(el("p","Chưa tìm thấy khoản khớp HĐ + IPC. Chọn thư mục khác hoặc kiểm tra cách đặt tên."));
 }
 batch.addEventListener("click",()=>{
  if(!lastScan){message("Hãy kết nối và quét một thư mục trước khi đối chiếu hàng loạt.");return;}
  renderBatch().catch(e=>message("Lỗi đối chiếu: "+e.message));
 });
 $("#ipcDriveCloseBatch").addEventListener("click",()=>{batchBox.hidden=true;});
 return {
  onOpen(payment,isAdmin){
   activePayment={id:payment?.id,project:payment?.project,contractNo:payment?.contractNo,ipcNo:payment?.ipcNo};
   panel.hidden=!isAdmin;
   batch.hidden=!isAdmin||typeof getBatchRows!=="function"||!getBatchRows()?.length;
   batchBox.hidden=true;
   singleMatches();
  },
  onClose(){activePayment=null;single.hidden=true;batchBox.hidden=true;},
  hide(){panel.hidden=true;activePayment=null;},
  getScanInfo(){return {root:lastId,files:lastScan?.files.length||0,partial:!!lastScan?.partial};}
 };
}
