// Christmas Tree 2026 — local-only Admin preview; no Firebase, no network data calls.
const styles=new URL("../css/payment-noel-tree-preview.css",import.meta.url).href;
const items=[["bear","🧸"],["snow","⛄"],["gift","🎁"],["bow","🎀"],["star","⭐"],["bell","🔔"],["candy","🍬"],["heart","💗"],["deer","🦌"],["cookie","🍪"],["sock","🧦"],["moon","🌙"],["flake","❄️"],["penguin","🐧"],["ball","🔴"],["candle","🕯️"]];
const dict={vi:["Cây thông Noel","Cây của tôi","Cây mẫu đồng nghiệp","Chọn đồ trang trí","Chạm vào cây để treo món đồ","Lời chúc (không bắt buộc)","Gửi đồ trang trí","Quà đã nhận","Mở vào 25/12","Thử mở quà","Đổi kiểu cây","Xóa đồ cuối","Sao chép link mẫu","Bản thử Admin · chỉ lưu trên máy này","Tên người gửi","Đóng","Link thử đã sao chép","Chọn màu cây"],en:["Christmas Tree","My tree","Sample colleague","Pick an ornament","Tap the tree to place it","Wish (optional)","Hang ornament","Received gifts","Opens on Dec 25","Preview opening","Tree style","Undo last ornament","Copy preview link","Admin preview · saved on this device only","Sender name","Close","Preview link copied","Tree color"],zh:["圣诞树","我的圣诞树","同事示例","选择挂饰","点击树上位置","祝福语（选填）","挂上装饰","收到的礼物","12月25日开启","预览拆礼物","圣诞树风格","撤销最后一个挂饰","复制预览链接","管理员预览 · 仅保存在本机","赠送人","关闭","已复制预览链接","树的颜色"]};
const colors={pink:["#e99ab6","#f9bdd0","#d97fa4"],green:["#397a58","#6fa682","#286447"],snow:["#8cb9d7","#c6e1ed","#779fca"],cream:["#d6b47e","#f4e5c2","#bf9667"]};
const slots=[[50,23],[39,37],[61,38],[31,51],[49,49],[68,52],[23,65],[41,64],[59,65],[77,65],[33,77],[51,77],[68,77]];
const safe=(v,n)=>String(v??"").slice(0,n);
function node(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function button(text,fn,cls=""){const b=node("button",cls,text);b.type="button";b.addEventListener("click",fn);return b}
function svg(tag,attrs){const el=document.createElementNS("http://www.w3.org/2000/svg",tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);return el}
export function createNoelTreePreview(){
 let host=null,root=null,dialog=null,trigger=null,dock=null,session=null,model=null,tab="own",selected="gift",point=null,opened=false,langListener=null,collapsed=false;
 const allowed=()=>!!session?.allowed?.();
 const tr=()=>dict[document.getElementById("languageSelect")?.value]||dict.vi;
 const key=()=> "payment.noelTree.preview.2026."+session.uid;
 const defaults=()=>({own:{style:"pastel",color:"pink",gifts:[]},sample:{style:"chalet",color:"green",gifts:[{kind:"bear",x:40,y:37,sender:"Demo",message:"Merry Christmas!"},{kind:"gift",x:62,y:60,sender:"Demo",message:"Chúc một mùa Noel ấm áp!"}]}});
 function load(){let m=defaults();try{const v=JSON.parse(localStorage.getItem(key())||"null");for(const k of ["own","sample"]){const q=v?.[k];if(!q)continue;m[k]={style:q.style==="chalet"?"chalet":"pastel",color:colors[q.color]?q.color:"pink",gifts:Array.isArray(q.gifts)?q.gifts.filter(g=>items.some(i=>i[0]===g.kind)&&Number.isFinite(g.x)&&Number.isFinite(g.y)&&g.x>=0&&g.x<=100&&g.y>=0&&g.y<=100).slice(0,60).map(g=>({...g,sender:safe(g.sender,60),message:safe(g.message,160)})):[]}}}catch{}return m}
 function save(){if(!allowed())return;try{localStorage.setItem(key(),JSON.stringify(model))}catch{}renderMini()}
 function treeArt(color,style,id="nt-paint"){
 const [a,b,c]=colors[color];const s=svg("svg",{viewBox:"0 0 300 360","aria-hidden":"true",class:"nt-tree-svg"});
 const defs=svg("defs",{}),grad=svg("linearGradient",{id,x1:"0",y1:"0",x2:"1",y2:"1"});grad.append(svg("stop",{offset:"0%","stop-color":b}),svg("stop",{offset:"100%","stop-color":a}));defs.append(grad);s.append(defs);
 s.append(svg("ellipse",{cx:150,cy:331,rx:121,ry:14,fill:"#e8edf5",opacity:".7",class:"nt-ground"}),svg("rect",{x:132,y:264,width:36,height:61,rx:12,fill:style==="chalet"?"#815032":"#a37765"}));
 const paths=["M150 36 Q126 86 84 119 Q72 136 92 142 Q101 145 113 139 Q118 155 134 147 Q150 165 166 147 Q182 155 187 139 Q199 145 208 142 Q228 136 216 119 Q174 86 150 36Z","M150 88 Q112 159 53 195 Q39 214 62 219 Q78 221 92 212 Q98 235 119 224 Q130 243 150 228 Q170 243 181 224 Q202 235 208 212 Q222 221 238 219 Q261 214 247 195 Q188 159 150 88Z","M150 145 Q107 220 24 266 Q10 287 36 291 Q51 294 70 283 Q76 306 103 294 Q117 317 150 300 Q183 317 197 294 Q224 306 230 283 Q249 294 264 291 Q290 287 276 266 Q193 220 150 145Z"];
 for(let i=2;i>=0;i--)s.append(svg("path",{d:paths[i],fill:i===1?b:"url(#"+id+")",stroke:c,"stroke-width":style==="chalet"?1.5:.6,"stroke-linejoin":"round"}));
 for(let i=0;i<45;i++){const y=80+(i*47%205),w=(y-40)*.46,x=150+Math.sin(i*2.4)*w;s.append(svg("circle",{cx:x,cy:y,r:i%4===0?2.1:1.1,fill:i%3===0?"#fff4b0":"#fff",opacity:".52"}))}
 if(style==="chalet")for(const d of ["M105 115 Q150 148 195 115","M72 188 Q150 235 228 188","M44 258 Q150 315 256 258"])s.append(svg("path",{d,fill:"none",stroke:"#e9bc60","stroke-width":2.5,"stroke-dasharray":"2 7","stroke-linecap":"round"}));
 if(id==="nt-mini-paint"){
 const lights=svg("g",{class:"nt-fairy-lights"});
 const wires=[[111,116,189,116,150,145],[77,178,223,178,150,224],[43,244,257,244,150,310]];
 for(let j=0;j<wires.length;j++){const [x1,y1,x2,y2,cx,cy]=wires[j];lights.append(svg("path",{d:"M"+x1+" "+y1+" Q"+cx+" "+cy+" "+x2+" "+y2,fill:"none",stroke:"#ffe9a7","stroke-opacity":".78","stroke-width":"1.5"}));for(let k=0;k<10+j*3;k++){const t=k/(9+j*3),u=1-t,x=u*u*x1+2*u*t*cx+t*t*x2,y=u*u*y1+2*u*t*cy+t*t*y2;const bulb=svg("circle",{cx:x,cy:y,r:3.2,fill:k%4===0?"#fff":k%4===1?"#ffda69":k%4===2?"#ffb8bd":"#fff2b6",class:"nt-light",style:"--delay:"+(-((k+j*3)%7)*.36)+"s"});lights.append(bulb)}}s.append(lights);
 const glints=svg("g",{class:"nt-glints"});[[86,92,8],[214,86,6],[46,168,9],[255,186,7],[17,248,8],[280,258,8],[82,293,5],[219,303,7],[196,45,5],[108,45,5]].forEach(([x,y,r],i)=>{glints.append(svg("path",{d:"M"+x+" "+(y-r)+" Q"+(x+1)+" "+(y-1)+" "+(x+r)+" "+y+" Q"+(x+1)+" "+(y+1)+" "+x+" "+(y+r)+" Q"+(x-1)+" "+(y+1)+" "+(x-r)+" "+y+" Q"+(x-1)+" "+(y-1)+" "+x+" "+(y-r),fill:"#fff7ca",class:"nt-glint",style:"--delay:"+(-i*.43)+"s"}))});s.append(glints);
 }
 s.append(svg("path",{d:"M150 6 158 25 180 27 164 41 169 63 150 51 131 63 136 41 120 27 142 25Z",fill:"#ffdb7d",stroke:"#ffeab0","stroke-width":2,class:"nt-star-top"}));return s;
 }
 function openEditor(){if(!allowed()||!dialog)return;tab="own";point=null;opened=false;render();if(!dialog.open)dialog.showModal()}
 function renderMini(){
  if(!allowed()||!dock||!model)return;
  const t=tr(),m=model.own,lang=document.getElementById("languageSelect")?.value;
  const labels=lang==="zh"?["收起圣诞树","展开圣诞树"]:lang==="en"?["Minimize tree","Show tree"]:["Thu gọn cây","Hiện cây thông"];
  dock.className="nt-dock "+(collapsed?"nt-collapsed":"nt-expanded");
  dock.replaceChildren();
  trigger=button(collapsed?"🎄 "+t[0]:"",openEditor,collapsed?"nt-trigger":"nt-mini-button");
  trigger.title=t[0];trigger.setAttribute("aria-label",t[0]);
  if(!collapsed){
   const picture=node("span","nt-mini-art");picture.append(treeArt(m.color,m.style,"nt-mini-paint"));
   for(const g of m.gifts){const item=items.find(i=>i[0]===g.kind);if(!item)continue;const icon=node("span","nt-mini-ornament",item[1]);icon.style.left=g.x+"%";icon.style.top=Math.min(g.y,82)+"%";icon.setAttribute("aria-hidden","true");picture.append(icon)}
   trigger.append(picture);
   const caption=node("span","nt-mini-caption",t[1]+(m.gifts.length?" · "+m.gifts.length:""));trigger.append(caption);
  }
  const toggle=button(collapsed?"+":"−",()=>{if(!allowed())return;collapsed=!collapsed;try{localStorage.setItem(key()+".collapsed",collapsed?"1":"0")}catch{}renderMini()},"nt-mini-toggle");
  toggle.title=labels[collapsed?1:0];toggle.setAttribute("aria-label",toggle.title);toggle.setAttribute("aria-expanded",String(!collapsed));
  dock.append(trigger,toggle);
 }
 function render(){
 if(!allowed()||!dialog)return;const t=tr(),m=model[tab];dialog.className="nt-dialog "+m.style;dialog.replaceChildren();
 const head=node("div","nt-head");const title=node("div","nt-title",t[0]);head.append(title,button("×",()=>dialog.close(),"nt-close"));dialog.append(head,node("div","nt-preview",t[13]));
 const tabs=node("div","nt-tabs");for(const [k,label] of [["own",t[1]],["sample",t[2]]]){const b=button(label,()=>{tab=k;point=null;opened=false;render()},tab===k?"active":"");b.setAttribute("aria-pressed",String(tab===k));tabs.append(b)}dialog.append(tabs);
 const body=node("div","nt-body"),scene=node("div","nt-scene"),side=node("div","nt-side");scene.append(node("h2","nt-name",(tab==="own"?session.name:"Demo")+" · "+(document.getElementById("languageSelect")?.value==="zh"?"的圣诞树":"’s tree")),node("div","nt-count",m.gifts.length+" · "+t[7]));
 const canvas=node("div","nt-canvas");canvas.append(treeArt(m.color,m.style));const place=(x,y)=>{if(y<17||y>82||Math.abs(x-50)>Math.min(44,(y-12)*.62))return;point={x,y};render()};canvas.addEventListener("click",e=>{if(e.target.closest("button"))return;const r=canvas.getBoundingClientRect();place((e.clientX-r.left)*100/r.width,(e.clientY-r.top)*100/r.height)});
 for(const g of m.gifts){const i=items.find(i=>i[0]===g.kind);const b=button(i[1],()=>{if(opened||Date.now()>=Date.parse("2026-12-25T00:00:00+07:00")){detail.textContent=g.sender+" · "+(g.message||"♡")}else{detail.textContent=t[8]}}, "nt-ornament");b.style.left=g.x+"%";b.style.top=g.y+"%";b.title=g.sender||i[0];canvas.append(b)}
 if(point){const marker=node("div","nt-marker",items.find(i=>i[0]===selected)[1]);marker.style.left=point.x+"%";marker.style.top=point.y+"%";canvas.append(marker)}
 scene.append(canvas,node("p","nt-hint",t[4]));const detail=node("div","nt-detail",opened?"♡":t[8]);scene.append(detail,button(t[9],()=>{opened=!opened;render()},"nt-secondary"));
 side.append(node("label","nt-label",t[10]));const stylesRow=node("div","nt-tabs");for(const k of ["pastel","chalet"])stylesRow.append(button(k==="pastel"?"Cute Pastel":"Classic Chalet",()=>{m.style=k;m.color=k==="pastel"?"pink":"green";save();render()},m.style===k?"active":""));side.append(stylesRow,node("label","nt-label",t[17]));
 const sw=node("div","nt-swatches");for(const k of Object.keys(colors)){const b=button("",()=>{m.color=k;save();render()},m.color===k?"active":"");b.style.background=colors[k][0];b.title=k;b.setAttribute("aria-label",k);sw.append(b)}side.append(sw,node("label","nt-label",t[3]));
 const grid=node("div","nt-grid");for(const [id,icon] of items){const b=button(icon,()=>{selected=id;render()},selected===id?"active":"");b.title=id;grid.append(b)}side.append(grid);
 const sender=node("input","nt-input");sender.placeholder=t[14];sender.maxLength=60;sender.value=session.name;const wish=node("textarea","nt-input");wish.placeholder=t[5];wish.maxLength=160;wish.rows=2;side.append(sender,wish);
 side.append(button(t[6],()=>{if(!allowed()||m.gifts.length>=60)return;const p=point||slots[m.gifts.length%slots.length];m.gifts.push({kind:selected,x:p.x,y:p.y,sender:safe(sender.value,60),message:safe(wish.value,160)});point=null;save();render()},"nt-primary"));
 const actions=node("div","nt-actions");actions.append(button(t[11],()=>{m.gifts.pop();save();render()},"nt-secondary"),button(t[12],async()=>{try{const url=new URL(location.href);url.searchParams.set("noelTree","preview");await navigator.clipboard.writeText(url.href);detail.textContent=t[16]}catch{detail.textContent="Copy unavailable"}},"nt-secondary"));side.append(actions);body.append(scene,side);dialog.append(body);
 }
 function unmount(){if(langListener)document.getElementById("languageSelect")?.removeEventListener("change",langListener);langListener=null;host?.remove();host=root=dialog=trigger=dock=session=model=null;point=null;opened=false;tab="own";collapsed=false}
 function mount(s){unmount();session=s;if(!allowed())return;model=load();host=node("div");host.id="paymentNoelTreePreview";root=host.attachShadow({mode:"open"});const link=node("link");link.rel="stylesheet";link.href=styles;root.append(link);dock=node("div","nt-dock");dialog=node("dialog","nt-dialog");dialog.setAttribute("aria-label",tr()[0]);root.append(dock,dialog);document.body.append(host);try{collapsed=localStorage.getItem(key()+".collapsed")==="1"}catch{}renderMini();langListener=()=>{if(!allowed())return;renderMini();dialog.setAttribute("aria-label",tr()[0]);if(dialog.open)render()};document.getElementById("languageSelect")?.addEventListener("change",langListener);if(new URL(location.href).searchParams.get("noelTree")==="preview"){render();dialog.showModal()}}
 return {mount,unmount};
}