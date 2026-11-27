// Local SVG lighting and garland art. No network, timers, or database calls.
export const blingOptions={gardenLights:["original","warmclassic","royalgold","candytwinkle","crystalfrost","pearlglow","retromulti","candlelight","stardust","off"],gardenGarlands:["none","pearl","tinsel","velvet","crystaldrops","cranberry","lace"],gardenLightMode:["twinkle","static","wave","pulse","sparkle"],gardenLightStrength:["medium","soft","bright"]};
export const blingLabels={original:["Đèn gốc","Original","原版灯饰"],warmclassic:["Vàng ấm","Warm Classic","暖金灯"],royalgold:["Royal Gold","Royal Gold","皇家金光"],candytwinkle:["Candy Twinkle","Candy Twinkle","糖果闪灯"],crystalfrost:["Crystal Frost","Crystal Frost","冰晶灯"],pearlglow:["Pearl Glow","Pearl Glow","珍珠柔光"],retromulti:["Retro Multicolor","Retro Multicolor","复古彩灯"],candlelight:["Nến cổ","Candlelight","复古烛光"],stardust:["Bụi sao","Stardust","星尘"],off:["Tắt đèn","Lights off","关闭灯饰"],pearl:["Ngọc trai","Pearl","珍珠链"],tinsel:["Kim tuyến vàng","Gold tinsel","金色彩带"],velvet:["Nhung đỏ","Velvet ribbon","红丝绒"],crystaldrops:["Giọt pha lê","Crystal drops","水晶吊坠"],cranberry:["Hạt châu đỏ","Cranberry beads","红莓珠链"],lace:["Ren cổ","Vintage lace","复古蕾丝"],static:["Tĩnh","Steady","常亮"],twinkle:["Nhấp nháy","Twinkle","闪烁"],wave:["Sóng chạy","Wave","波浪"],pulse:["Nhịp sáng","Pulse","呼吸灯"],sparkle:["Kim cương","Sparkle","星钻闪光"],soft:["Nhẹ","Soft","柔光"],medium:["Vừa","Medium","适中"],bright:["Rực","Bright","明亮"]};
const ns="http://www.w3.org/2000/svg";
const el=(tag,a={})=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(a))n.setAttribute(k,String(v));return n};
const path=(d,fill,stroke="none",width=1)=>el("path",{d,fill,stroke,"stroke-width":width,"stroke-linecap":"round","stroke-linejoin":"round"});
const dot=(x,y,r,fill,attrs={})=>el("circle",{cx:x,cy:y,r,fill,...attrs});
const wires={
 classic:[[111,116,189,116,150,145],[77,178,223,178,150,224],[43,244,257,244,150,310]],
 forest:[[124,96,176,96,150,118],[100,150,200,150,150,181],[72,206,228,206,150,239],[42,267,258,267,150,299]],
 watercolor:[[120,98,180,98,150,119],[94,155,206,155,150,188],[62,216,238,216,150,252],[38,270,262,270,150,303]],
 knitted:[[126,94,174,94,150,111],[101,154,199,154,150,177],[77,214,223,214,150,237],[52,274,248,274,150,298]],
 crystal:[[126,111,174,111,150,141],[102,173,198,173,150,206],[76,235,224,235,150,271]]
};
const palettes={warmclassic:["#fff6d8","#ffd17b","#ffe4a0"],royalgold:["#fff4c1","#f7bf51","#fffdf2"],candytwinkle:["#ffadc8","#ffdbac","#ff7f9d","#fff5e9"],crystalfrost:["#f5ffff","#a6e8ff","#a7baff"],pearlglow:["#fffaf2","#e8d7c6","#fff1da"],retromulti:["#ed6677","#74d5a2","#ffd56b","#80b8ff"],candlelight:["#ffe6a3","#fff7d2"],stardust:["#fff9db","#fbd688","#fff"]};
const curve=(w,offset=0)=>"M"+w[0]+" "+(w[1]+offset)+" Q"+w[4]+" "+(w[5]+offset)+" "+w[2]+" "+(w[3]+offset);
const at=(w,t,offset=0)=>{const u=1-t;return [u*u*w[0]+2*u*t*w[4]+t*t*w[2],u*u*w[1]+2*u*t*w[5]+t*t*w[3]+offset]};
const star=(x,y,r,col)=>path("M"+x+" "+(y-r)+" Q"+(x+1)+" "+(y-1)+" "+(x+r)+" "+y+" Q"+(x+1)+" "+(y+1)+" "+x+" "+(y+r)+" Q"+(x-1)+" "+(y+1)+" "+(x-r)+" "+y+" Q"+(x-1)+" "+(y-1)+" "+x+" "+(y-r)+"Z",col);
function animated(n,i,color){n.setAttribute("class","nt-bling-bulb");n.setAttribute("style","--nt-glow:"+color+";--nt-delay:"+(-i*.19)+"s;--nt-twinkle:"+(-((i*17)%23)*.17)+"s");return n}
export function applyBling(s,style,scene,id="nt-bling"){
 const light=blingOptions.gardenLights.includes(scene.gardenLights)?scene.gardenLights:"original",garland=blingOptions.gardenGarlands.includes(scene.gardenGarlands)?scene.gardenGarlands:"none",mode=blingOptions.gardenLightMode.includes(scene.gardenLightMode)?scene.gardenLightMode:"twinkle",strength=blingOptions.gardenLightStrength.includes(scene.gardenLightStrength)?scene.gardenLightStrength:"medium";
 const rows=wires[style]||wires.classic;
 // Keep original artwork intact for old trees and only replace lighting for an explicit choice.
 if(light!=="original"){for(const n of s.querySelectorAll(".nt-fairy-lights,.nt-glints"))n.remove()}
 s.setAttribute("data-light-mode",mode);s.setAttribute("data-light-strength",strength);s.setAttribute("data-light-kind",light);
 const topper=s.querySelector(".nt-star-top"),insert=g=>s.insertBefore(g,topper||null);
 if(garland!=="none"){
 const g=el("g",{class:"nt-extra-garland","pointer-events":"none"});for(const w of rows){
 const d=curve(w,10);
 if(garland==="velvet"){g.append(path(d,"none","#743042",9),path(d,"none","#b24c60",6),path(curve(w,8),"none","#e4a0a0",1.5))}
 else if(garland==="lace"){g.append(path(d,"none","#f0dfc2",8));for(let k=0;k<=16;k++){const [x,y]=at(w,k/16,13);g.append(dot(x,y,3.2,"#e9d8ba"),dot(x,y,1.3,"#7e776644"))}}
 else if(garland==="tinsel"){g.append(path(d,"none","#b68637",6));for(let k=0;k<=24;k++){const [x,y]=at(w,k/24,10);g.append(path("M"+(x-3)+" "+(y-4)+" l6 8 M"+(x-4)+" "+(y+2)+" l8 -4","none",k%2?"#f6d68b":"#fff0b5",1.5))}}
 else {g.append(path(d,"none",garland==="cranberry"?"#a95055":"#f7ebd9",1));for(let k=0;k<=12;k++){const [x,y]=at(w,k/12,10);if(garland==="crystaldrops"){g.append(dot(x,y,2,"#dff9ff"),path("M"+x+" "+(y+3)+" l3 5 -3 5 -3 -5Z","#c9ecfa","#f8ffff",.8))}else{g.append(dot(x,y,garland==="pearl"?3:2.8,garland==="pearl"?"#f9e9d8":"#ad384b"),dot(x-.8,y-.8,1,"#fff6e6"))}}}
 }insert(g)}
 if(light==="original"||light==="off")return s;
 const g=el("g",{class:"nt-custom-bling","pointer-events":"none"}),palette=palettes[light],defs=el("defs"),halos=el("g",{class:"nt-bulb-halos"});for(const [i,color] of palette.entries()){const grad=el("radialGradient",{id:id+"-bulb-halo-"+i});for(const [offset,opacity] of [["0%",".92"],["20%",".55"],["55%",".18"],["100%","0"]])grad.append(el("stop",{offset,"stop-color":color,"stop-opacity":opacity}));defs.append(grad)}g.append(defs,halos);const halo=(x,y,color,r=13)=>halos.append(dot(x,y,r,"url(#"+id+"-bulb-halo-"+palette.indexOf(color)+")"));
 let seq=0;
 if(light==="stardust"){for(let i=0;i<32;i++){const y=47+(i*37)%244,x=150+Math.sin(i*2.39)*Math.min(136,22+(y-30)*.48),r=1.7+(i%5)*.85,col=palette[i%3];halo(x,y,col,14);g.append(animated(i%3===0?star(x,y,r+3,col):dot(x,y,r,col),seq++,col))}}
 else for(const [j,w] of rows.entries()){
  if(light!=="candlelight"){g.append(path(curve(w),"none",light==="crystalfrost"?"#b9ebff":"#caa253",2),path(curve(w,-.5),"none",light==="crystalfrost"?"#effdff":"#fff0bd",.9))}
  const n=light==="candlelight"?4+j:light==="retromulti"?6+j*2:light==="pearlglow"?15+j*3:13+j*3;
  for(let k=0;k<n;k++){const [x,y]=at(w,k/(n-1)),col=palette[(k+j)%palette.length];let b;
   if(light==="candlelight"){g.append(path("M"+(x-3)+" "+y+" h6 v-10 h-6Z","#f1e3c8","#c5a578",.7),path("M"+(x-5)+" "+(y+1)+" h10","none","#bf9657",2));b=path("M"+x+" "+(y-12)+" q-6 -3 0 -12 q6 9 0 12Z",col)}
   else if(light==="retromulti"){g.append(path("M"+(x-2)+" "+(y-3)+" h4 v4 h-4Z","#9f8f67"));b=path("M"+x+" "+(y+1)+" q-7 5 -3 11 q3 3 6 0 q4 -6 -3 -11Z",col)}
   else if(light==="crystalfrost"){b=k%3===0?star(x,y,5,col):path("M"+x+" "+(y-4)+" l3 4 -3 5 -3 -5Z",col)}
   else if(light==="royalgold"&&k%3===0)b=star(x,y,5.5,col);
   else {b=dot(x,y,light==="pearlglow"?3.7:light==="royalgold"?3.4:2.6,col);if(light==="pearlglow")g.append(dot(x-1,y-1,1.1,"#fff"))}
   halo(x,light==="candlelight"?y-16:light==="retromulti"?y+7:y,col,light==="royalgold"?16:light==="crystalfrost"?14:12);g.append(animated(b,seq++,col));
  }
 }
 if(light!=="stardust"){for(const [i,[x,y]] of [[102,58],[205,74],[65,155],[240,166],[31,238],[272,252],[80,303],[222,300]].entries()){const col=palette[i%palette.length];halo(x,y,col,17);g.append(animated(star(x,y,light==="royalgold"?9:6,col),seq++,col))}}
 insert(g);return s;
}
