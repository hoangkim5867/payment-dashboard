// Jewellery-like Christmas finishes; local SVG only. IDs are scoped to each tree.
const ns="http://www.w3.org/2000/svg";
const el=(tag,a={})=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(a))n.setAttribute(k,String(v));return n};
const p=(d,fill,stroke="none",w=1)=>el("path",{d,fill,stroke,"stroke-width":w,"stroke-linecap":"round","stroke-linejoin":"round"});
const o=(cx,cy,r,fill,opacity=1)=>el("circle",{cx,cy,r,fill,opacity});
const e=(cx,cy,rx,ry,fill,opacity=1)=>el("ellipse",{cx,cy,rx,ry,fill,opacity});
const star=(x,y,r,c)=>p("M"+x+" "+(y-r)+" Q"+(x+1)+" "+(y-1)+" "+(x+r)+" "+y+" Q"+(x+1)+" "+(y+1)+" "+x+" "+(y+r)+" Q"+(x-1)+" "+(y+1)+" "+(x-r)+" "+y+" Q"+(x-1)+" "+(y-1)+" "+x+" "+(y-r)+"Z",c);
const stops=(g,values)=>{for(const [offset,color,opacity] of values)g.append(el("stop",{offset,"stop-color":color,"stop-opacity":opacity??1}));return g};
const grad=(id,values,extra={})=>stops(el("linearGradient",{id,x1:"0%",y1:"0%",x2:"100%",y2:"100%",...extra}),values);
const radial=(id,c)=>stops(el("radialGradient",{id}),[["0%",c,.85],["24%",c,.36],["65%",c,.11],["100%",c,0]]);
const url=id=>"url(#"+id+")";
const strength=scene=>scene.gardenLights==="off"?0:scene.gardenLightStrength==="soft"?.55:scene.gardenLightStrength==="bright"?1.25:.92;
const tint=scene=>({crystalfrost:"#c8f5ff",candytwinkle:"#ffc5df",pearlglow:"#fff4e3",retromulti:"#ffe6b8",candlelight:"#ffc775",stardust:"#f9e7ff"}[scene.gardenLights]||"#ffe4a0");
const pulse=(n,i)=>{n.setAttribute("class","nt-luxe-spark");n.setAttribute("style","--nt-spark-delay:"+(-i*.61)+"s");return n};
const dims=(s)=>s.getAttribute("viewBox")==="0 0 300 360";
function glitterPath(points,r=.75){return points.map(([x,y,k])=>{const a=r*(1+k%3*.45);return "M"+(x-a).toFixed(1)+" "+y.toFixed(1)+"h"+(2*a).toFixed(1)+"m"+(-a).toFixed(1)+" "+(-a).toFixed(1)+"v"+(2*a).toFixed(1)}).join(" ")}
export function finishTree(s,id,style,scene){
 const shapes=Array.from(s.querySelectorAll(".nt-foliage"));if(!shapes.length)return s;
 const defs=el("defs"),clip=el("clipPath",{id:id+"-luxe-clip"});
 for(const sh of shapes)clip.append(p(sh.getAttribute("d"),"#fff"));
 defs.append(clip,grad(id+"-silk",[["0%","#fff8e4",.34],["21%","#fff",.06],["43%","#fff6d9",.31],["53%","#fff",.035],["77%","#41263e",.14],["100%","#fff5d7",.24]],{x1:"0%",y1:"15%",x2:"100%",y2:"85%"}));s.append(defs);
 const g=el("g",{class:"nt-luxe-foliage","clip-path":url(id+"-luxe-clip"),"pointer-events":"none"});
 g.append(el("rect",{x:0,y:15,width:300,height:302,fill:url(id+"-silk"),opacity:style==="watercolor"?.65:1}));
 const light=strength(scene),col=tint(scene),points=[];
 for(let i=0;i<185;i++){const y=42+(i*43)%264,x=150+Math.sin(i*2.39996)*Math.min(146,(y-24)*.57);points.push([x,y,i])}
 g.append(p(glitterPath(points,.6),"none","#fffbea",.9));g.lastChild.setAttribute("opacity",light?.64:.24);
 const seams=el("g",{opacity:style==="watercolor"?.45:.8});for(const sh of shapes){const line=p(sh.getAttribute("d"),"none","#fff8db",2);line.setAttribute("opacity",".63");seams.append(line)}g.append(seams);
 if(light){const accents=el("g",{opacity:Math.min(1,light)});for(const [i,[x,y,r]] of [[141,73,4],[119,121,4],[180,137,5],[92,179,4],[205,191,6],[132,223,4],[70,257,5],[237,264,6],[170,288,4]].entries())accents.append(pulse(star(x,y,r,col),i));g.append(accents)}
 const before=s.querySelector(".nt-fairy-lights,.nt-glints,.nt-extra-garland,.nt-custom-bling,.nt-star-top");s.insertBefore(g,before||null);return s;
}
function glossyColor(hex,k){const v=hex.slice(1);const rgb=[0,2,4].map(i=>parseInt(v.slice(i,i+2),16));return "#"+rgb.map(n=>Math.round(k>=0?n+(255-n)*k:n*(1+k)).toString(16).padStart(2,"0")).join("")}
export function finishAccessories(s,items,id,scene){
 const defs=el("defs"),seen=new Set();for(const n of items){
 if(n.localName==="svg"||n.localName==="text"){n.classList.add("nt-luxe-scene-icon");continue}
 const col=n.getAttribute("fill");if(!/^#[0-9a-f]{6}$/i.test(col||"")||!["path","rect","ellipse","circle"].includes(n.localName))continue;
 const key=id+"-finish-"+col.slice(1);if(!seen.has(key)){seen.add(key);defs.append(grad(key,[["0%",glossyColor(col,.42)],["29%",col],["47%",glossyColor(col,.32)],["57%",col],["100%",glossyColor(col,-.25)]],{x1:"0%",y1:"0%",x2:"100%",y2:"76%"}))}n.setAttribute("fill",url(key));
 }
 if(seen.size)s.append(defs);
 const a=strength(scene);if(!a)return s;const base=scene.gardenBases,side=scene.gardenSides,g=el("g",{class:"nt-luxe-ground","pointer-events":"none",opacity:Math.min(1,a)});
 if(base==="velvet"||base==="fur"||base==="snowmat"){g.append(el("ellipse",{cx:150,cy:333,rx:101,ry:13,fill:"none",stroke:"#fff0b9","stroke-width":1.5,"stroke-dasharray":"1 4"}));for(let i=0;i<20;i++){const angle=i*Math.PI/10;g.append(o(150+Math.cos(angle)*96,333+Math.sin(angle)*12,1.4,"#fff9e6"))}}
 else if(base!=="default"){for(const y of [298,333])g.append(p("M124 "+y+" Q150 "+(y+5)+" 176 "+y,"none","#fff2c4",1.4));g.append(pulse(star(171,301,5,tint(scene)),2),pulse(star(130,326,4,"#fff"),4))}
 if(side!=="none"){for(const [i,[x,y,r]] of [[23,294,5],[66,319,4],[251,291,5],[276,325,4]].entries())g.append(pulse(star(x,y,r,tint(scene)),i+3))}
 const points=Array.from({length:34},(_,i)=>[18+(i*67)%265,320+(i*13)%25,i]);g.append(p(glitterPath(points,.65),"none","#fff4cb",.9));s.append(g);return s;
}
export function finishBackdrop(s,id,scene,background){
 const a=strength(scene);if(!a)return s;const col=tint(scene),cold=["aurora","snowforest","wintervillage","icepalace"].includes(scene.gardenBackgrounds),warm=cold?"#c7f1ff":col;
 const defs=el("defs");defs.append(radial(id+"-halo",warm),radial(id+"-bokeh",warm),radial(id+"-floor",cold?"#e3fcff":"#ffe5ad"));const g=el("g",{class:"nt-luxe-backdrop","pointer-events":"none",opacity:Math.min(1,a)});
 g.append(defs,e(150,160,145,160,url(id+"-halo"),.46),e(150,332,145,25,url(id+"-floor"),.8));
 for(let i=0;i<16;i++){const left=i%2===0,x=left?13+(i*31)%72:287-(i*31)%72,y=19+(i*53)%265;g.append(o(x,y,9+(i%4)*3,url(id+"-bokeh"),.64))}
 for(const [i,[x,y,r]] of [[23,40,5],[277,32,6],[49,85,4],[252,103,6],[15,150,5],[286,185,5],[23,243,4],[277,254,5],[76,25,4],[215,29,4]].entries())g.append(pulse(star(x,y,r,warm),i));
 g.append(p(glitterPath(Array.from({length:45},(_,i)=>[i%2?280-(i*19)%56:20+(i*19)%56,18+(i*41)%278,i]),.55),"none","#fff9e7",.8));if(background)background.append(g);else s.insertBefore(g,s.firstChild);return s;
}
export function luxeTop(s,kind,id,scene){
 if(kind==="none")return s;const a=strength(scene),col=tint(scene),g=el("g",{class:"nt-luxe-topper","pointer-events":"none"}),d=el("defs");
 d.append(grad(id+"-gold",[["0%","#8e5927"],["20%","#fff4bd"],["43%","#d6a44d"],["62%","#fff2c0"],["82%","#9d622c"],["100%","#f6d987"]]),grad(id+"-ice",[["0%","#eaffff"],["27%","#8dc7e5"],["46%","#fff"],["65%","#bad0f6"],["100%","#6ba1c4"]]),grad(id+"-ruby",[["0%","#671d35"],["28%","#e8a1aa"],["49%","#ad3853"],["70%","#f0b0bb"],["100%","#711d3b"]]),grad(id+"-ivory",[["0%","#c7ad87"],["29%","#fffdfa"],["60%","#f3dec0"],["100%","#af8e61"]]),radial(id+"-tophalo",col));g.append(d);
 const gold=url(id+"-gold"),ice=url(id+"-ice"),ruby=url(id+"-ruby"),ivory=url(id+"-ivory");
 if(a)g.append(o(150,33,42,url(id+"-tophalo"),Math.min(1,a)));
 const jewel=(x,y,r,fill=ice)=>{g.append(p("M"+x+" "+(y-r)+" l"+r+" "+r+" "+(-r)+" "+r+" "+(-r)+" "+(-r)+"Z",fill,"#fff9e3",.7),p("M"+x+" "+(y-r)+" V"+(y+r)+" M"+(x-r)+" "+y+" H"+(x+r),"none","#ffffffb0",.65))};
 if(kind==="star"||kind==="crystalstar"){const pts=[];for(let i=0;i<10;i++){const angle=-Math.PI/2+i*Math.PI/5,r=i%2?14:29;pts.push([150+Math.cos(angle)*r,33+Math.sin(angle)*r])}const outline=pts.map((v,i)=>(i?"L":"M")+v.join(" ")).join(" ")+"Z";g.append(p(outline,kind==="star"?gold:ice,"#fff7d2",1.6));for(let i=0;i<10;i+=2)g.append(p("M150 33 L"+pts[i].join(" ")+" L"+pts[(i+1)%10].join(" ")+"Z",i%4?"#fff8de55":"#ffffff90"));jewel(150,33,6,kind==="star"?gold:ice)}

 else if(["bethlehem","moravian","sunburst","pearlstar","filigreestar","rubystar","aurorastar","cometstar","artdecostar","rosettestar"].includes(kind)){
  const center=[150,33],point=(a,r)=>[150+Math.cos(a)*r,33+Math.sin(a)*r],poly=pts=>pts.map((v,i)=>(i?"L":"M")+v.map(x=>x.toFixed(2)).join(" ")).join(" ")+"Z";
  const burst=(count,radius,inner,start=-Math.PI/2)=>Array.from({length:count*2},(_,i)=>point(start+i*Math.PI/count,i%2?inner:radius));
  const facets=(pts,fill,edge="#fff3cf")=>{g.append(p(poly(pts),fill,edge,1.3));for(let i=0;i<pts.length;i++)g.append(p(poly([center,pts[i],pts[(i+1)%pts.length]]),i%2?"#ffffff15":"#ffffff65",edge,.35))};
  const jewelRing=(count,r,sz,fill)=>{for(let i=0;i<count;i++){const [x,y]=point(-Math.PI/2+i*2*Math.PI/count,r);jewel(x,y,sz,fill)}};
  if(kind==="bethlehem"){const pts=[[150,0],[155,25],[177,11],[162,29],[184,33],[161,38],[174,54],[155,43],[150,73],[145,43],[126,54],[139,38],[116,33],[138,29],[123,11],[145,25]];facets(pts,gold);jewel(150,33,7,ice);g.append(p("M150 5 V70 M119 33 H181","none","#fffbe8",1.4))}
  if(kind==="moravian"){const pts=burst(8,31,14);g.append(p(poly(pts),gold,"#ffecc2",1.3));for(let i=0;i<8;i++){const outer=pts[i*2],l=pts[(i*2+15)%16],rr=pts[i*2+1],ridge=point(-Math.PI/2+i*Math.PI/4,9);g.append(p(poly([outer,l,ridge]),"#fff9e4","#bd9f66",.6),p(poly([outer,ridge,rr]),ice,"#fff7dc",.6))}jewel(150,33,10,gold)}
  if(kind==="sunburst"){for(let i=0;i<24;i++){const angle=i*Math.PI/12-Math.PI/2,tip=point(angle,i%2?25:34),l=point(angle-.065,10),rr=point(angle+.065,10);g.append(p(poly([l,tip,rr]),i%3?gold:ivory,"#ffe6ad",.6))}g.append(o(150,33,12,gold));g.append(o(150,33,8,ivory));jewelRing(8,10,2.6,ice);jewel(150,33,5,gold)}
  if(kind==="pearlstar"){const pts=burst(5,30,13);g.append(p(poly(pts),"#d5bd8e55",gold,5));for(let i=0;i<pts.length;i++){const l=pts[i],rr=pts[(i+1)%pts.length],n=Math.ceil(Math.hypot(rr[0]-l[0],rr[1]-l[1])/5);for(let j=0;j<n;j++){const t=j/n,x=l[0]+(rr[0]-l[0])*t,y=l[1]+(rr[1]-l[1])*t;g.append(o(x,y,2.7,ivory),o(x-.65,y-.8,.8,"#fff"))}}jewel(150,33,8,gold);g.append(o(150,33,4,ivory))}
  if(kind==="filigreestar"){const pts=burst(5,31,12);g.append(p(poly(pts),"#b08b4830",gold,3.6));for(let i=0;i<5;i++){const a=-Math.PI/2+i*Math.PI*2/5,[x,y]=point(a,26),[lx,ly]=point(a-.43,12),[rx,ry]=point(a+.43,12);g.append(p("M150 33 Q"+lx+" "+ly+" "+x+" "+y+" Q"+rx+" "+ry+" 150 33","none",gold,1.8),p("M"+lx+" "+ly+" Q"+x+" "+y+" "+rx+" "+ry,"none","#fff1c8",1));jewel(x,y,2.6,ivory)}jewelRing(5,10,3,ice);jewel(150,33,6,ruby)}
  if(kind==="rubystar"){facets(burst(6,29,15),ruby,"#ffe9c8");g.append(p(poly(burst(6,23,10)),"none",gold,1.8));jewelRing(6,16,3.4,ivory);jewel(150,33,9,ruby)}
  if(kind==="aurorastar"){d.append(grad(id+"-aurora-star",[["0%","#f9ffff"],["23%","#91efe0"],["45%","#a7c7ff"],["64%","#f0bbe9"],["80%","#a196e0"],["100%","#e9ffff"]]));facets(burst(7,30,12),url(id+"-aurora-star"),"#eaffff");jewelRing(7,20,2.5,ice);jewel(150,33,7,url(id+"-aurora-star"))}
  if(kind==="cometstar"){g.append(p("M146 31 Q178 47 190 88 Q175 64 151 47 Q170 71 172 91 Q154 58 137 48Z",gold,"#fff4cb",1.2),p("M151 41 Q174 54 187 83 M145 45 Q160 64 169 84","none","#fff8dd",1.7));facets(burst(5,28,12),gold);jewel(150,33,6,ice);g.append(star(185,74,5,"#fff9df"),star(168,88,3,"#fff"))}
  if(kind==="artdecostar"){g.append(p(poly(burst(4,33,11)),gold,"#fff4c7",1.4));g.append(p(poly(burst(4,25,12,0)),ice,gold,1.7));for(let i=0;i<4;i++){const a=-Math.PI/2+i*Math.PI/2;const pts=[point(a-.26,15),point(a,29),point(a+.26,15)];g.append(p(poly(pts),"#fff7db",gold,1));}g.append(p(poly(burst(4,14,9)),gold,"#fff7d7",1));jewel(150,33,6,ruby)}
  if(kind==="rosettestar"){for(let i=0;i<8;i++){const a=-Math.PI/2+i*Math.PI/4,l=point(a-.3,15),rr=point(a+.3,15),tip=point(a,32);g.append(p(poly([center,l,tip,rr]),ice,gold,1.3),p(poly([center,l,tip]),"#ffffff80","#fff",.5))}jewelRing(8,20,3,ivory);g.append(o(150,33,10,gold));jewel(150,33,7,ice)}
 }
 else if(kind==="tiara"){g.append(p("M117 47 Q121 24 133 37 Q137 17 150 7 Q163 17 167 37 Q179 24 183 47Z","none",gold,3),p("M117 47 Q150 59 183 47 M121 51 Q150 64 179 51","none",gold,3));for(const [x,y,r] of [[150,13,8],[135,29,5],[165,29,5],[122,39,4],[178,39,4],[150,35,7]])jewel(x,y,r,ice);for(let i=0;i<9;i++)g.append(o(121+i*7.25,49+Math.sin(i/8*Math.PI)*7,2.2,ivory))}
 else if(kind==="twinbells"){for(const [x,angle] of [[135,-19],[165,19]]){const b=el("g",{transform:"rotate("+angle+" "+x+" 32)"});b.append(p("M"+(x-4)+" 13 Q"+(x-16)+" 16 "+(x-16)+" 35 L"+(x-21)+" 47 Q"+x+" 56 "+(x+21)+" 47 L"+(x+16)+" 35 Q"+(x+16)+" 16 "+(x+4)+" 13Z",gold,"#fff0c1",1.4),e(x,47,20,5,ivory),o(x,51,4,gold),p("M"+(x-10)+" 24 Q"+(x-13)+" 35 "+(x-13)+" 41","none","#fff8dc",2));g.append(b)}g.append(p("M150 15 Q119 -3 126 14 Q130 24 150 17 Q170 24 174 14 Q181 -3 150 15Z",ruby,gold,1.2));jewel(150,15,4,ice)}
 else if(kind==="lotusgem"){for(const [dx,dy] of [[-26,16],[-18,-3],[0,-16],[18,-3],[26,16]]){g.append(p("M150 48 Q"+(150+dx*1.3-10)+" "+(26+dy)+" "+(150+dx)+" "+(15+dy)+" Q"+(150+dx*1.3+10)+" "+(26+dy)+" 150 48Z",dx===0?ice:ruby,gold,1.1));g.append(p("M150 48 L"+(150+dx)+" "+(15+dy),"none","#fff5dd",.8))}g.append(e(150,48,25,7,gold));jewel(150,37,7,ivory)}
 else if(kind==="crown"){g.append(p("M119 19 L131 27 L139 12 L150 24 L161 12 L169 27 L181 19 L174 48 Q150 55 126 48Z",gold,"#fff1c6",1.4),p("M126 42 Q150 47 174 42","none","#fff5d8",3),p("M129 48 Q150 53 171 48","none","#92622e",1.5));for(const [x,y] of [[119,18],[139,11],[161,11],[181,18]])g.append(o(x,y,3.5,ivory));jewel(150,35,8,ruby);jewel(135,36,4);jewel(165,36,4)}
 else if(kind==="bow"||kind==="longbow"){if(kind==="longbow")g.append(p("M145 35 Q124 60 131 89 L141 81 150 94 Q143 65 154 37Z",ruby,"#f5d6b5",1.4),p("M155 35 Q176 60 169 89 L159 81 150 94 Q157 65 146 37Z",ruby,"#f5d6b5",1.4));g.append(p("M148 30 Q118 1 116 25 Q112 49 143 43 L150 37 Q173 54 182 35 Q189 6 158 23Z",ruby,"#ffe1b4",1.5),p("M122 22 Q132 25 146 33 M179 22 Q167 25 154 33","none","#f8c8c8",2),p("M145 31 Q150 25 155 31 L157 42 Q150 46 143 42Z",gold,"#fff2c0",1));jewel(150,36,4)}
 else if(kind==="snowflake"||kind==="diamondflake"){for(let i=0;i<6;i++){const a=i*Math.PI/3,dx=Math.sin(a),dy=-Math.cos(a),x=150+dx*28,y=33+dy*28;g.append(p("M150 33 L"+x+" "+y,"none",gold,kind==="diamondflake"?3.5:2.5));for(const sign of [-1,1]){const bx=150+dx*17,by=33+dy*17;g.append(p("M"+bx+" "+by+" L"+(bx+dx*6+sign*dy*8)+" "+(by+dy*6-sign*dx*8),"none","#e9fbff",2.2))}jewel(x,y,4)}jewel(150,33,8)}
 else if(kind==="crescent"){g.append(p("M167 7 Q136 -2 122 23 Q108 56 145 62 Q169 63 179 43 Q152 52 141 32 Q133 15 167 7Z",gold,"#fff1d1",1.5),p("M139 10 Q121 27 129 43 Q139 58 157 57","none","#fff8de",2));jewel(166,23,7);g.append(star(177,13,5,"#fff9e8"))}
 else if(kind==="angel"){g.append(p("M144 28 Q112 8 115 29 Q119 46 140 46 M156 28 Q188 8 185 29 Q181 46 160 46",ivory,"#e1c281",1.4),p("M143 29 L157 29 Q159 45 171 61 Q150 68 129 61 Q141 45 143 29Z",ivory,"#d3ad68",1.4),o(150,19,10,"#f5d8b9"),p("M141 17 Q141 5 152 8 Q162 9 159 19 Q150 18 146 13Z",gold),e(150,6,12,3,"none"));g.lastChild.setAttribute("stroke","#ffe6a2");g.lastChild.setAttribute("stroke-width","2.5");g.append(p("M144 37 Q147 48 150 58 Q154 48 156 37 M135 60 Q150 65 165 60","none","#d2a860",1.6));jewel(150,35,5,gold)}
 if(a){for(const [i,[x,y,r]] of [[121,14,5],[178,10,5],[184,46,5],[115,47,4],[150,2,3]].entries())g.append(pulse(star(x,y,r,"#fff9e8"),i));}s.append(g);return s;
}
