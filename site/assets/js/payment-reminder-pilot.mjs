// Payment reminders: a read-only projection of the existing authenticated Payment snapshot.
// No Firebase imports, network requests, extra listeners, or writes.
export function reminderClock(now=new Date()){
 const p=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(now).map(x=>[x.type,x.value]));
 const day=Number(p.day),hour=Number(p.hour);
 return {month:p.year+"-"+p.month,date:p.year+"-"+p.month+"-"+p.day,phase:day>=15&&day<=20?"paper":day>=21&&day<=25?"both":null,slot:hour>=14?"14":hour>=9?"09":null};
}
export function collectReminders(rows,{clock,owner,eligible,ownerKey,done,paperDone,notApplicable}){
 if(!clock.phase||!owner)return [];
 return rows.filter(r=>r.paymentMonth===clock.month&&eligible(r)&&ownerKey(r.personInCharge)===owner).map(r=>{
  const paper=!paperDone(r.processPaper)&&!notApplicable(r.processPaper);
  const system=clock.phase==="both"?["processPlatformPlan","processSettlement","processPlatformPayment"].filter(k=>!done(r[k])&&!notApplicable(r[k])):[];
  return {id:r.id,project:String(r.project||"—"),contract:String(r.contractNo||"—"),ipc:String(r.ipcNo||"—"),paper,system};
 }).filter(r=>r.paper||r.system.length);
}
const labels={
 vi:{title:"Công việc cần xử lý",paper:"Bản giấy",system:"Hệ thống",details:"Hồ sơ cần cập nhật",allow:"Bật thông báo Windows",blocked:"Thông báo Windows đang bị chặn",hide:"Thu gọn",show:"Xem chi tiết",notice:"Bạn còn hồ sơ cần cập nhật. Mở Payment để xem chi tiết."},
 en:{title:"Pending work",paper:"Paper documents",system:"Platform",details:"Documents to update",allow:"Enable Windows notifications",blocked:"Windows notifications are blocked",hide:"Collapse",show:"View details",notice:"You have pending documents. Open Payment for details."},
 zh:{title:"待处理工作",paper:"纸版资料",system:"平台流程",details:"待更新资料",allow:"启用 Windows 通知",blocked:"Windows 通知已被阻止",hide:"收起",show:"查看详情",notice:"您还有资料待更新，请打开 Payment 查看。"}
};
export function createPaymentReminder(){
 let host=null,root=null,data=null,expanded=false,timer=null,notification=null;
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e};
 function closeNotice(){try{notification?.close()}catch{}notification=null}
 function clear(){data=null;expanded=false;closeNotice();if(timer!==null)clearInterval(timer);timer=null;host?.remove();host=root=null}
 function button(text,fn){const b=el("button",text);b.type="button";b.addEventListener("click",fn);return b}
 function paint(){
  if(!data)return;
  const clock=reminderClock(),l=labels[data.language]||labels.vi,items=collectReminders(data.rows,{...data,clock});
  if(!items.length){host?.remove();host=root=null;closeNotice();return}
  if(!host){host=el("div");host.id="paymentReminderPilot";root=host.attachShadow({mode:"open"});document.body.append(host)}
  const style=el("style",":host{position:fixed;right:16px;bottom:90px;z-index:900;max-width:calc(100vw - 32px);font:13px/1.45 system-ui;color:#17263c}section{box-sizing:border-box;width:min(340px,calc(100vw - 32px));background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:12px;box-shadow:0 6px 22px #0f172a22}h3,p{margin:0 0 6px}h3{font-size:14px}button{font:inherit;border:1px solid #cbd5e1;border-radius:7px;background:#f1f5f9;color:#17263c;padding:6px 9px;margin:3px 5px 0 0;cursor:pointer}ul{max-height:190px;overflow:auto;padding-left:18px;margin:6px 0}li{margin:4px 0;overflow-wrap:anywhere}.muted{font-size:11px;color:#64748b}");
  const box=el("section");box.setAttribute("aria-label",l.title);
  const paper=items.filter(x=>x.paper).length,system=items.filter(x=>x.system.length).length;
  box.append(el("h3","🔔 "+l.title),el("p",l.paper+": "+paper+(clock.phase==="both"?" · "+l.system+": "+system:"")));
  box.append(button(expanded?l.hide:l.show,()=>{expanded=!expanded;paint()}));
  if(expanded){const list=el("ul");for(const item of items){list.append(el("li",item.project+" · "+item.contract+" · "+item.ipc+" — "+[item.paper?l.paper:"",item.system.length?l.system:""].filter(Boolean).join(" + ")))}box.append(list)}
  if("Notification" in window){if(Notification.permission==="default")box.append(button(l.allow,async()=>{try{await Notification.requestPermission()}catch{}paint()}));else if(Notification.permission==="denied")box.append(el("p",l.blocked,"muted"))}
  root.replaceChildren(style,box);
  // Native desktop notification only while this authenticated page is alive.
  // Never request permission automatically or include project names, counts or financial data.
  if(!clock.slot||!("Notification" in window)||Notification.permission!=="granted"||!data.fresh)return;
  const key="payment.reminder.v1."+data.uid+"."+clock.date+"."+clock.slot;
  try{if(localStorage.getItem(key))return;localStorage.setItem(key,"1");closeNotice();notification=new Notification("Payment",{body:l.notice,tag:"payment-reminder-"+clock.date+"-"+clock.slot});notification.onclick=()=>{window.focus();expanded=true;paint();closeNotice()}}catch{}
 }
 return {clear,update(next){if(data?.uid!==next.uid){clear()}data=next;paint();if(timer===null)timer=setInterval(()=>{if(data)paint()},60000)}};
}
