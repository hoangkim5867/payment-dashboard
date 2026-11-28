// Isolated scope; no fetch interception or Payment data cache.
import {reminderMessage} from "../assets/js/payment-reminder-pilot.mjs";
const cacheName="payment-reminder-push-preview-v1",previewURL=new URL("./preview",self.location.href).href;
let pending=false;
self.addEventListener("install",e=>e.waitUntil(self.skipWaiting()));
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("message",e=>{
 const input=e.data,port=e.ports[0];
 if(input?.type!=="payment-reminder-preview"||!port||!e.source?.url||new URL(e.source.url).pathname!=="/payment.html")return;
 if(pending){port.postMessage({error:"A test is already pending"});return}
 if(!["18","22","monday"].includes(input.mode)||!["vi","zh"].includes(input.language)||typeof input.token!=="string"||input.token.length>8192||typeof input.endpoint!=="string"||input.endpoint.length>2048)return;
 pending=true;
 e.waitUntil((async()=>{
  const cache=await caches.open(cacheName);
  try{
   await cache.put(previewURL,new Response(JSON.stringify({mode:input.mode,language:input.language,expires:Date.now()+180000})));
   port.postMessage({queued:true});
   await new Promise(resolve=>setTimeout(resolve,12000));
   const response=await fetch("/api/payment-reminder-push",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+input.token},body:JSON.stringify({action:"send",endpoint:input.endpoint}),cache:"no-store",signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error("Push service not available ("+response.status+")");
   port.postMessage({accepted:true});
  }catch(error){await cache.delete(previewURL);port.postMessage({error:String(error?.message||"Push test failed")})}
  finally{pending=false}
 })());
});
self.addEventListener("push",e=>e.waitUntil((async()=>{
 const cache=await caches.open(cacheName),response=await cache.match(previewURL);let preview=null;
 if(response)try{preview=await response.json()}catch{}
 await cache.delete(previewURL);
 // An empty or stale push still produces a generic, non-sensitive notification.
 const valid=preview&&preview.expires>Date.now();
 const message=valid?reminderMessage(preview.language,{paper:preview.mode==="18"||preview.mode==="22",system:preview.mode==="22",weekly:preview.mode==="monday"}):{title:"Payment",body:"Mở Payment để xem công việc. 请登录 Payment 查看待办。"};
 await self.registration.showNotification(message.title,{body:message.body,tag:"payment-reminder-background-preview",data:{path:"/payment.html"}});
})()));
self.addEventListener("notificationclick",e=>{e.notification.close();e.waitUntil((async()=>{
 const url=new URL("/payment.html",self.location.origin).href;
 for(const client of await self.clients.matchAll({type:"window",includeUncontrolled:true}))if(new URL(client.url).pathname==="/payment.html"){await client.focus();return}
 await self.clients.openWindow(url);
})())});
