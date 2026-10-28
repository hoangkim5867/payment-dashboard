// Encrypted, user-controlled recovery drafts for Payment Add/Edit.
// Never sends a draft to Firestore or automatically replays a write.
// The original Save handler remains the only route through business validation,
// duplicate checks, optimistic concurrency and Security Rules.
const DB_NAME='payment-master-emergency-drafts-v1';
const STORE='drafts';
const ITERATIONS=310000;
const encoder=new TextEncoder(),decoder=new TextDecoder();
const random=n=>crypto.getRandomValues(new Uint8Array(n));
const b64=b=>btoa(String.fromCharCode(...b));
const from64=s=>Uint8Array.from(atob(s),ch=>ch.charCodeAt(0));
const stamp=x=>x?.toMillis?.() ?? (x?.seconds!=null ? x.seconds*1000+Math.floor((x.nanoseconds||0)/1e6) : (x??null));
async function keyFor(passphrase,salt){
  if(typeof passphrase!=='string'||passphrase.length<12)throw Error('Mật khẩu bảo vệ nháp phải có ít nhất 12 ký tự.');
  const raw=await crypto.subtle.importKey('raw',encoder.encode(passphrase),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function seal(value,key,salt){
  const iv=random(12);
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(JSON.stringify(value)));
  return {version:1,salt:b64(salt),iv:b64(iv),cipher:b64(new Uint8Array(cipher))};
}
export async function encryptDraft(value,passphrase){
  const salt=random(16),key=await keyFor(passphrase,salt);
  return seal(value,key,salt);
}
export async function decryptDraft(envelope,passphrase){
  if(envelope?.version!==1)throw Error('Phiên bản nháp không hỗ trợ.');
  try{
    const salt=from64(envelope.salt);
    const key=await keyFor(passphrase,salt);
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(envelope.iv)},key,from64(envelope.cipher));
    return JSON.parse(decoder.decode(plain));
  }catch{
    throw Error('Không thể mở nháp: mật khẩu sai hoặc dữ liệu bị hỏng.');
  }
}
function openStore(){
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined')return reject(Error('Trình duyệt không hỗ trợ lưu nháp bảo mật.'));
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'});};
    req.onerror=()=>reject(req.error||Error('Không mở được bộ nhớ nháp.'));
    req.onsuccess=()=>resolve(req.result);
  });
}
async function databaseTask(mode,action){
  const db=await openStore();
  try{
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);
      let result;try{const request=action(store);request.onsuccess=()=>{result=request.result;};request.onerror=()=>reject(request.error);}catch(e){reject(e);return;}
      tx.oncomplete=()=>resolve(result);
      tx.onerror=()=>reject(tx.error||Error('Lỗi lưu nháp'));
      tx.onabort=()=>reject(tx.error||Error('Lưu nháp bị hủy'));
    });
  }finally{db.close();}
}
const storeRow=row=>databaseTask('readwrite',s=>s.put(row));
const listRows=()=>databaseTask('readonly',s=>s.getAll());
const removeRow=id=>databaseTask('readwrite',s=>s.delete(id));
function readFields(modal){
  const data={};
  for(const el of modal.querySelectorAll('input[id],select[id],textarea[id]')){
    if(!el.id||['file','password','hidden','submit','button'].includes(el.type))continue;
    data[el.id]=el.type==='checkbox'||el.type==='radio'?{checked:el.checked}:{value:el.value};
  }
  return data;
}
function restoreFields(modal,values){
  const misses=[];
  for(const [id,entry] of Object.entries(values||{})){
    const el=Array.from(modal.querySelectorAll('input[id],select[id],textarea[id]')).find(x=>x.id===id);
    if(!el) {misses.push(id);continue;}
    if('checked' in entry){if(!el.disabled)el.checked=Boolean(entry.checked);else misses.push(id);continue;}
    if(el.disabled){misses.push(id);continue;}
    const old=el.value;
    el.value=String(entry.value??'');
    if(el.value!==String(entry.value??'')){el.value=old;misses.push(id);}
  }
  return misses;
}
export function createPaymentEmergencyDrafts({modal,saveButton,getContext,setEntryType}){
  if(!modal||!saveButton)throw Error('Payment draft controls not available');
  const footer=saveButton.parentElement;
  const status=document.createElement('span');
  status.setAttribute('role','status');
  status.style.cssText='font-size:12px;max-width:360px;line-height:1.3;color:#744d13;';
  const save=document.createElement('button'),restore=document.createElement('button'),remove=document.createElement('button');
  for(const [el,txt] of [[save,'🔒 Lưu nháp mã hóa'],[restore,'Phục hồi nháp'],[remove,'Xóa nháp']]){
    el.type='button';el.textContent=txt;el.className='btn-gray';el.style.fontSize='12px';
    footer.insertBefore(el,saveButton);
  }
  footer.insertBefore(status,saveButton);
  let active=null,debounce=null,persisting=Promise.resolve();
  const context=()=>{const x=getContext();return {uid:x?.uid||'',editingId:x?.editingId||null,editVersion:stamp(x?.editVersion),entryType:x?.entryType||'contract'};};
  const sameContext=(a,b)=>a.uid===b.uid&&a.editingId===b.editingId&&a.editVersion===b.editVersion;
  const snapshot=()=>({context:context(),fields:readFields(modal),capturedAt:Date.now()});
  function say(message){status.textContent=message;}
  async function persist(){
    if(!active || !sameContext(active.context,context()) || !modal.classList.contains('show'))return;
    const payload=snapshot();
    const envelope=await seal(payload,active.key,active.salt);
    await storeRow({id:active.id,uid:payload.context.uid,at:Date.now(),...envelope});
    say('🔒 Nháp đã lưu trên thiết bị (CHƯA gửi lên Firestore).');
  }
  function schedule(){
    if(!active||!sameContext(active.context,context()))return;
    clearTimeout(debounce);
    debounce=setTimeout(()=>{persisting=persisting.then(persist).catch(err=>say('⚠ Không cập nhật được nháp: '+err.message));},800);
  }
  modal.addEventListener('input',schedule);
  modal.addEventListener('change',schedule);
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'&&active){
      clearTimeout(debounce);
      persisting=persisting.then(persist).catch(()=>{});
    }
  });
  async function available(){
    const user=context().uid;
    if(!user)throw Error('Cần đăng nhập để sử dụng nháp.');
    return (await listRows()).filter(x=>x.uid===user).sort((a,b)=>b.at-a.at);
  }
  function choose(rows){
    if(!rows.length){alert('Chưa có nháp bảo mật trên thiết bị này.');return null;}
    const answer=prompt('Chọn số thứ tự nháp cần xử lý:\\n'+rows.slice(0,15).map((x,i)=>(i+1)+'. '+new Date(x.at).toLocaleString('vi-VN')).join('\\n')+'\\nChỉ hiện tối đa 15 nháp gần nhất.');
    if(answer===null)return null;
    const i=Number(answer)-1;
    if(!Number.isInteger(i)||i<0||i>=Math.min(rows.length,15))throw Error('Số thứ tự nháp không hợp lệ.');
    return rows[i];
  }
  save.onclick=async()=>{
    try{
      const ctx=context();
      if(!ctx.uid||!modal.classList.contains('show'))throw Error('Hãy đăng nhập và mở biểu mẫu Add/Edit trước.');
      const pass=prompt('Đặt mật khẩu riêng cho nháp (ít nhất 12 ký tự). KHÔNG dùng mật khẩu tài khoản. Không thể khôi phục nếu quên:');
      if(pass===null)return;
      if(pass.length<12)throw Error('Mật khẩu cần ít nhất 12 ký tự.');
      if(prompt('Nhập lại mật khẩu nháp để xác nhận:')!==pass)throw Error('Mật khẩu xác nhận không khớp.');
      const salt=random(16),key=await keyFor(pass,salt);
      const id=crypto.randomUUID();
      const record={id,uid:ctx.uid,at:Date.now(),...await seal(snapshot(),key,salt)};
      await storeRow(record);
      active={id,key,salt,context:ctx};
      say('🔒 Đã tạo nháp mã hóa; các thay đổi sẽ tự cập nhật trên thiết bị. CHƯA lưu server.');
      alert('🔒 Đã lưu nháp mã hóa trên thiết bị này. Chưa lưu vào Firestore. Nhớ mật khẩu nháp để khôi phục.');
    }catch(e){say('⚠ '+e.message);alert('Không lưu được nháp: '+e.message);}
  };
  restore.onclick=async()=>{
    try{
      const row=choose(await available());if(!row)return;
      const pass=prompt('Nhập mật khẩu của nháp đã chọn:');if(pass===null)return;
      const payload=await decryptDraft(row,pass);
      const ctx=context();
      if(!modal.classList.contains('show'))throw Error('Hãy mở biểu mẫu Add/Edit trước khi phục hồi.');
      if(payload.context.uid!==ctx.uid)throw Error('Nháp thuộc tài khoản khác.');
      if(payload.context.editingId!==ctx.editingId)throw Error('Nháp sửa phải được mở từ đúng bản ghi Payment cũ. Không được phục hồi vào một khoản mới hoặc khoản khác.');
      if(ctx.editingId && payload.context.editVersion!==ctx.editVersion)throw Error('Bản ghi đã thay đổi từ khi lưu nháp. Không tự ghi đè: cần đối chiếu nội dung trước.');
      setEntryType(payload.context.entryType);
      const misses=restoreFields(modal,payload.fields);
      const salt=from64(row.salt),key=await keyFor(pass,salt);
      active={id:row.id,key,salt,context:context()};
      say('⚠ Đã phục hồi vào biểu mẫu; CHƯA gửi server. Phải rà soát dữ liệu, rồi bấm Lưu thanh toán để kiểm tra lại.');
      alert('Đã phục hồi '+(Object.keys(payload.fields).length-misses.length)+' trường. CHƯA lưu lên Firestore.'+(misses.length?'\\nCần nhập lại các trường không khôi phục được: '+misses.join(', '):'')+'\\nKiểm tra lại hợp đồng, IPC, số tiền và ngày trước khi lưu.');
    }catch(e){say('⚠ '+e.message);alert('Không phục hồi được nháp: '+e.message);}
  };
  remove.onclick=async()=>{
    try{
      const row=choose(await available());if(!row)return;
      if(!confirm('Xóa vĩnh viễn nháp mã hóa trên thiết bị? Chỉ làm sau khi chắc chắn Payment đã được server xác nhận.'))return;
      await removeRow(row.id);
      if(active?.id===row.id)active=null;
      say('Đã xóa nháp đã chọn khỏi thiết bị.');
    }catch(e){say('⚠ '+e.message);alert(e.message);}
  };
  return {
    notifyWriteFailure(){
      say('⚠ Firestore chưa xác nhận lưu. Biểu mẫu vẫn mở. Chọn “Lưu nháp mã hóa” để tránh mất dữ liệu.');
    }
  };
}
