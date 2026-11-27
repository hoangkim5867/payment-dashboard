// Background artwork only. No remote assets, timers, storage or database calls.
const ns="http://www.w3.org/2000/svg";
const el=(tag,a={})=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(a))n.setAttribute(k,String(v));return n};
const p=(d,fill,stroke="none",w=1)=>el("path",{d,fill,stroke,"stroke-width":w,"stroke-linecap":"round","stroke-linejoin":"round"});
const r=(x,y,width,height,rx,fill)=>el("rect",{x,y,width,height,rx,fill});
const o=(cx,cy,r,fill)=>el("circle",{cx,cy,r,fill});
const e=(cx,cy,rx,ry,fill)=>el("ellipse",{cx,cy,rx,ry,fill});
const url=id=>"url(#"+id+")";
const gradient=(tag,id,a,stops)=>{const n=el(tag,{id,...a});for(const [offset,color,opacity] of stops)n.append(el("stop",{offset,"stop-color":color,"stop-opacity":opacity??1}));return n};
export const backgroundNames={vintagegold:["Vintage Gold","Vintage Gold","复古金夜"],royalvictorian:["Royal Victorian","Royal Victorian","维多利亚宫廷"],midnightforest:["Rừng đêm","Midnight Forest","午夜森林"],rosechampagne:["Rose Champagne","Rose Champagne","香槟玫瑰"],winterwindow:["Cửa sổ mùa đông","Winter Window","冬日窗景"],candleroom:["Phòng ánh nến","Candle Room","烛光暖室"],snowvillage:["Làng tuyết mờ","Snow Village","雪镇夜景"],auroranight:["Đêm cực quang","Aurora Night","极光之夜"]};
export const backgroundLevels={soft:["Nhẹ","Soft","轻"],medium:["Vừa","Medium","中"],focus:["Nổi bật","Focus","突出"]};
const palettes={
 vintagegold:["#261a16","#5d4030","#d4a775","#ffe2a8","gold"],
 royalvictorian:["#24151f","#663443","#ad7780","#ffdfad","curtain"],
 midnightforest:["#12202c","#304b5d","#7eacb6","#fff0c6","forest"],
 rosechampagne:["#30222c","#72515c","#b68c96","#ffe9cf","rose"],
 winterwindow:["#202a38","#47576a","#92b3cb","#ffe6b2","window"],
 candleroom:["#251b17","#5a3e30","#b68657","#ffda96","candle"],
 snowvillage:["#1b2638","#3e5066","#a2b7cb","#ffe5b5","village"],
 auroranight:["#171d35","#344964","#7fbeb7","#e7e9e5","aurora"],
 snowforest:["#26323c","#506570","#b5c8ce","#fff2d4","forest"],
 cabinroom:["#30201a","#644633","#af835b","#ffe1a7","cabin"],
 wintervillage:["#18263c","#40566f","#a6bad2","#ffe4b3","village"],
 pastelstudio:["#40313e","#846373","#c7a9b6","#ffe9da","studio"],
 royal:["#2c1b2a","#6b4451","#bc9868","#ffe3aa","palace"],
 candyland:["#47303d","#85556a","#cb9aaa","#ffe8ce","candy"],
 aurora:["#18283d","#365a67","#70b8ae","#e0f2e5","aurora"],
 window:["#2d2531","#4d5f71","#aac0d2","#ffe4b0","window"],
 market:["#252635","#5e5057","#c7a486","#ffe1a5","market"],
 icepalace:["#23344d","#4d6f8b","#a6ccdf","#e8f7ff","ice"]
};
export function depthBackground(s,kind,id,level="medium"){
 const spec=palettes[kind];if(!spec)return false;
 const [dark,mid,accent,halo,style]=spec,opacity=({soft:.46,medium:.76,focus:.94})[level]??.76;
 const g=el("g",{class:"nt-depth-background","pointer-events":"none","aria-hidden":"true"}),defs=el("defs"),clip=el("clipPath",{id:id+"-bg-clip"});clip.append(r(0,0,300,360,17,"#fff"));defs.append(clip);
 defs.append(gradient("radialGradient",id+"-bg",{cx:"50%",cy:"44%",r:"69%"},[["0%",mid],["62%",mid],["100%",dark]]),gradient("radialGradient",id+"-halo",{cx:"50%",cy:"50%",r:"50%"},[["0%",halo,.68],["32%",halo,.34],["70%",halo,.11],["100%",halo,0]]),gradient("radialGradient",id+"-bokeh",{},[["0%",halo,.75],["32%",halo,.35],["100%",halo,0]]),gradient("radialGradient",id+"-shade",{},[["0%",dark,.8],["100%",dark,0]]),gradient("linearGradient",id+"-floor",{x1:"0",y1:"0",x2:"0",y2:"100%"},[["0%",dark,0],["65%",dark,.63],["100%",dark,.9]]));
 g.append(defs);const layer=el("g",{"clip-path":url(id+"-bg-clip"),opacity});layer.append(r(0,0,300,360,17,url(id+"-bg")));
 const far=el("g",{class:"nt-depth-far",opacity:.48});const fir=(x,y,w,h,c)=>{far.append(p("M"+x+" "+y+" l"+(-w*.38)+" "+(h*.37)+" h"+(w*.17)+" l"+(-w*.43)+" "+(h*.31)+" h"+(w*.24)+" l"+(-w*.41)+" "+(h*.32)+" h"+(w*1.62)+" l"+(-w*.41)+" "+(-h*.32)+" h"+(w*.24)+" l"+(-w*.43)+" "+(-h*.31)+" h"+(w*.17)+"Z",c))};
 if(style==="forest"||style==="aurora"||style==="village"||style==="market"){for(const [x,y,w,h] of [[10,100,27,170],[48,144,25,130],[87,176,19,98],[290,91,28,185],[251,135,24,145],[215,177,19,101]])fir(x,y,w,h,dark);far.append(p("M0 285 Q60 261 118 285 T242 278 T300 276 V360 H0Z",accent))}
 if(style==="aurora"){far.append(p("M-15 75 Q63 8 147 83 T315 38","none",accent,16),p("M-10 96 Q73 29 159 98 T312 61","none","#8d8db6",8))}
 if(style==="window"){far.append(r(29,20,242,244,66,accent),r(38,29,224,225,57,mid));for(const [x,y,w,h] of [[58,106,22,136],[101,145,16,95],[242,99,22,142],[204,150,18,86]])fir(x,y,w,h,dark);far.append(p("M39 218 Q100 194 154 221 T262 209 V255 H39Z",accent),p("M150 29 V254 M38 132 H262","none",dark,7))}
 if(["curtain","palace","cabin","candle","studio","window"].includes(style)){for(const x of [0,300]){const sign=x===0?1:-1;far.append(p("M"+x+" 0 H"+(x+sign*67)+" Q"+(x+sign*44)+" 77 "+(x+sign*18)+" 146 Q"+(x+sign*30)+" 219 "+(x+sign*53)+" 280 H"+x+"Z",dark));if(style==="curtain"||style==="palace")for(let j=1;j<=4;j++)far.append(p("M"+(x+sign*j*12)+" 0 Q"+(x+sign*j*6)+" 85 "+(x+sign*j*4)+" 146 T"+(x+sign*j*9)+" 278","none",accent,1.1))}}
 if(style==="palace"||style==="ice"){for(const x of [15,246]){far.append(r(x,58,39,220,5,dark),p("M"+x+" 57 Q"+(x+19)+" 11 "+(x+39)+" 57Z",accent),p("M"+(x+8)+" 64 V266 M"+(x+31)+" 64 V266","none",accent,2))}}
 if(style==="cabin"||style==="candle"){for(let y=25;y<277;y+=29)far.append(p("M0 "+y+" H300","none",dark,1.5));for(const x of [29,268]){far.append(r(x-2,200,4,37,1,accent),p("M"+x+" 195 Q"+(x-9)+" 186 "+x+" 175 Q"+(x+9)+" 188 "+x+" 195Z",halo),o(x,184,28,url(id+"-bokeh")))}}
 if(style==="village"||style==="market"||style==="candy"){for(const [x,y,w,h] of [[5,235,33,44],[47,250,26,30],[261,229,35,50],[225,249,26,31]]){far.append(r(x,y,w,h,2,dark),p("M"+(x-4)+" "+y+" L"+(x+w/2)+" "+(y-w*.65)+" L"+(x+w+4)+" "+y+"Z",accent),r(x+6,y+10,6,9,1,halo),r(x+w-12,y+10,6,9,1,halo))}}
 if(style==="studio"||style==="rose"){far.append(p("M9 275 V89 Q9 42 56 42 M291 275 V89 Q291 42 244 42","none",accent,2))}
 layer.append(far,r(0,276,300,84,0,url(id+"-floor")),e(150,166,143,179,url(id+"-halo")),e(150,334,139,23,url(id+"-halo")),e(150,341,113,10,url(id+"-shade")));
 const dust=el("g",{class:"nt-depth-dust",opacity:.58});const count=level==="soft"?8:level==="focus"?18:13;
 for(let i=0;i<count;i++){const x=i%2?278-(i*31)%63:22+(i*31)%63,y=16+(i*47)%282;dust.append(o(x,y,4+(i%4)*3,url(id+"-bokeh")));if(i%3===0)dust.append(o(x,y,.85,halo))}
 layer.append(dust);g.append(layer);s.insertBefore(g,s.firstChild);return true;
}
export function isolateBackgroundForeground(s){
 const background=s.firstChild;if(!background||background.getAttribute("class")!=="nt-depth-background")return;
 const fg=el("g",{class:"nt-depth-foreground"});for(const n of Array.from(s.children)){if(n!==background&&n.localName!=="defs")fg.append(n)}s.append(fg);s.classList.add("nt-depth-tree");
}
