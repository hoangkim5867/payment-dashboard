// Explicit, Admin-only Web Push preview. Does not store tokens or register staff.
const workerPath="/payment-reminder-push/sw.js",scope="/payment-reminder-push/";
function decodeKey(s){const raw=atob(s.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-s.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0))}
async function readyWorker(reg){
 if(reg.active?.state==="activated")return reg.active;
 const worker=reg.installing||reg.waiting||reg.active;
 if(!worker)throw Error("Service worker is unavailable");
 await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{worker.removeEventListener("statechange",check);reject(Error("Service worker not ready"))},10000);
  function check(){if(worker.state==="activated"||worker.state==="redundant"){clearTimeout(timeout);worker.removeEventListener("statechange",check);worker.state==="activated"?resolve():reject(Error("Service worker installation failed"))}}
  worker.addEventListener("statechange",check);check();
 });
 return reg.active||worker;
}
export async function queueBackgroundPreview({getToken,mode,language,onStatus,isActive}){
 if(!("Notification" in window)||!("serviceWorker" in navigator)||!("PushManager" in window))throw Error("Trình duyệt không hỗ trợ Web Push");
 const permission=Notification.permission==="default"?await Notification.requestPermission():Notification.permission;
 if(permission!=="granted")throw Error("Chưa cấp quyền thông báo Windows");
 if(!isActive())throw Error("Phiên đăng nhập đã thay đổi");
 const token=await getToken();
 const response=await fetch("/api/payment-reminder-push",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},body:JSON.stringify({action:"key"}),cache:"no-store"});
 if(!response.ok)throw Error("Web Push chưa được kích hoạt hoặc máy chủ không xác thực được Admin");
 const {publicKey}=await response.json();
 if(typeof publicKey!=="string")throw Error("Thiếu khóa Web Push");
 const reg=await navigator.serviceWorker.register(workerPath,{scope,type:"module",updateViaCache:"none"});
 const worker=await readyWorker(reg),key=decodeKey(publicKey);
 let sub=await reg.pushManager.getSubscription();
 if(sub&&Array.from(new Uint8Array(sub.options.applicationServerKey||[])).join(",")!==Array.from(key).join(",")){await sub.unsubscribe();sub=null}
 if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 if(!isActive())throw Error("Phiên đăng nhập đã thay đổi");
 const channel=new MessageChannel();
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{channel.port1.close();reject(Error("Không thể lên lịch gửi thử"))},10000);
  channel.port1.onmessage=e=>{
   const result=e.data;
   if(result.queued){clearTimeout(timer);onStatus("queued");resolve(true)}
   if(result.accepted){onStatus("accepted");channel.port1.close()}
   if(result.error){clearTimeout(timer);onStatus("error",result.error);channel.port1.close();reject(Error(result.error))}
  };
  worker.postMessage({type:"payment-reminder-preview",token,mode,language,endpoint:sub.endpoint},[channel.port2]);
 });
}
