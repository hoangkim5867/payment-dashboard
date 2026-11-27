import {luxeTop} from "./payment-noel-luxe.mjs";
import {blingOptions} from "./payment-noel-bling.mjs";
// Static SVG material artwork. No network, external images or Firebase calls.
import {colors,ornamentArt} from "./payment-noel-tree-catalog.mjs";
import {extraOptions,extraBackground,extraAccessories} from "./payment-noel-scene-expansion.mjs";
const ns="http://www.w3.org/2000/svg";
const el=(tag,a={})=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(a))e.setAttribute(k,String(v));return e};
const p=(d,fill,stroke="none",w=1)=>el("path",{d,fill,stroke,"stroke-width":w,"stroke-linejoin":"round","stroke-linecap":"round"});
const ellipse=(cx,cy,rx,ry,fill)=>el("ellipse",{cx,cy,rx,ry,fill});
const circle=(cx,cy,r,fill)=>el("circle",{cx,cy,r,fill});
const rect=(x,y,width,height,rx,fill)=>el("rect",{x,y,width,height,rx,fill});
export const materialStyles=["watercolor","knitted","crystal","forest"];
export const accessoryOptions={gardenBases:["default","basket","pot","snowmat","wood"],gardenSides:["none","gifts","fence","lantern","snowman","tiger","cat","deer"],gardenTops:["star","bow","snowflake","none"],gardenBackgrounds:["none","snowforest","cabinroom","wintervillage","pastelstudio"]};
for(const k of Object.keys(extraOptions))accessoryOptions[k].push(...extraOptions[k]);
Object.assign(accessoryOptions,blingOptions);
export const safeAccessory=(key,v)=>accessoryOptions[key].includes(v)?v:accessoryOptions[key][0];
export const sceneAt=(m,i)=>Object.fromEntries(Object.keys(accessoryOptions).map(k=>[k,safeAccessory(k,m[k]?.[i])]));
// Material-specific garlands follow each silhouette. Reuse the existing CSS
// twinkle classes (including reduced-motion handling); no timers or extra reads.
const garlands={
 forest:[[124,96,176,96,150,118],[100,150,200,150,150,181],[72,206,228,206,150,239],[42,267,258,267,150,299]],
 watercolor:[[120,98,180,98,150,119],[94,155,206,155,150,188],[62,216,238,216,150,252],[38,270,262,270,150,303]],
 knitted:[[126,94,174,94,150,111],[101,154,199,154,150,177],[77,214,223,214,150,237],[52,274,248,274,150,298]],
 crystal:[[126,111,174,111,150,141],[102,173,198,173,150,206],[76,235,224,235,150,271]]
};
const lightPalettes={forest:["#fffdf3","#ffcf70","#fff0b7","#ffdda0"],watercolor:["#fffdf7","#ffd881","#ffc1d6","#fff0bd"],knitted:["#fff9e9","#ffcc77","#ffc2ab","#fff0b2"],crystal:["#ffffff","#c5f5ff","#fff0b8","#d9d3ff"]};
function materialLights(s,style){
 const lights=el("g",{class:"nt-fairy-lights","pointer-events":"none"}),palette=lightPalettes[style];
 for(const [j,[x1,y1,x2,y2,cx,cy]] of garlands[style].entries()){
  const d="M"+x1+" "+y1+" Q"+cx+" "+cy+" "+x2+" "+y2;
  const cord=p(d,"none",style==="crystal"?"#effaff":"#ffe6a1",1.3);cord.setAttribute("opacity",".8");lights.append(cord);
  const n=9+j*2;for(let k=0;k<n;k++){const t=k/(n-1),u=1-t,x=u*u*x1+2*u*t*cx+t*t*x2,y=u*u*y1+2*u*t*cy+t*t*y2;
   lights.append(el("circle",{cx:x,cy:y,r:style==="knitted"?2.7:3,fill:palette[(k+j)%palette.length],class:"nt-light",style:"--delay:"+(-((k+j*3)%7)*.36)+"s"}));
  }
 }
 const glints=el("g",{class:"nt-glints","pointer-events":"none"});
 const points=[[104,49,5],[197,57,6],[90,106,7],[213,112,6],[56,172,8],[248,178,7],[20,240,8],[279,250,8],[63,301,5],[238,309,5]];
 if(style==="crystal")points.push([150,128,5],[114,190,5],[182,239,6]);
 for(const [i,[x,y,r]] of points.entries()){
  const d="M"+x+" "+(y-r)+" Q"+(x+1)+" "+(y-1)+" "+(x+r)+" "+y+" Q"+(x+1)+" "+(y+1)+" "+x+" "+(y+r)+" Q"+(x-1)+" "+(y+1)+" "+(x-r)+" "+y+" Q"+(x-1)+" "+(y-1)+" "+x+" "+(y-r);
  glints.append(el("path",{d,fill:style==="crystal"?"#e5f9ff":"#fff7ca",class:"nt-glint",style:"--delay:"+(-i*.43)+"s"}));
 }
 s.append(lights,glints);
}
export function materialArt(color,style,id){
 const [a,b,c]=colors[color]||colors.green,s=el("svg",{viewBox:"0 0 300 360",class:"nt-tree-svg","aria-hidden":"true"}),defs=el("defs"),g=el("linearGradient",{id:id+"-mat",x1:"0%",y1:"0%",x2:"100%",y2:"100%"});
 for(const [offset,fill] of [["0%",b],["52%",a],["100%",c]])g.append(el("stop",{offset,"stop-color":fill}));defs.append(g);s.append(defs,ellipse(150,332,119,12,"#e7e8e6"),rect(136,264,28,61,5,"#8d664d"));
 const paint="url(#"+id+"-mat)";
 if(style==="watercolor"){
  // Layered irregular brush silhouettes, translucent washes, visible pigment flecks.
  for(let i=0;i<8;i++){const y=49+i*29,w=18+i*15;const shape=p("M150 "+(y-28)+" Q"+(150-w*.38)+" "+(y+8)+" "+(150-w)+" "+(y+25)+" Q"+(150-w*.75)+" "+(y+39)+" 150 "+(y+25)+" Q"+(150+w*.64)+" "+(y+43)+" "+(150+w)+" "+(y+23)+" Q"+(150+w*.28)+" "+(y+4)+" 150 "+(y-28)+"Z",i%3===0?b:a,c,.5);shape.setAttribute("opacity",".75");s.append(shape);for(let j=0;j<9;j++){const x=150+Math.sin(i*21+j*9)*w*.83;const blot=ellipse(x,y+14+Math.cos(j*13+i)*13,8+j%3*4,3+j%2*3,j%3===0?b:c);blot.setAttribute("opacity",".22");s.append(blot)}}
 }else if(style==="knitted"){
  // Sculpted rounded tiers with paired stitches, seams and soft ribbed hem.
  for(let i=3;i>=0;i--){const y=67+i*59,w=43+i*25;const outline="M150 "+(y-36)+" C"+(150-w*.3)+" "+(y+9)+" "+(150-w)+" "+(y+20)+" "+(150-w)+" "+(y+49)+" Q"+(150-w)+" "+(y+66)+" 150 "+(y+65)+" Q"+(150+w)+" "+(y+66)+" "+(150+w)+" "+(y+49)+" C"+(150+w)+" "+(y+20)+" "+(150+w*.3)+" "+(y+9)+" 150 "+(y-36)+"Z";s.append(p(outline,paint,c,2));for(let row=0;row<3;row++){const yy=y+19+row*13,ww=w*(.55+row*.14);for(let x=150-ww+7;x<150+ww-5;x+=12)s.append(p("M"+(x-4)+" "+(yy-4)+" Q"+x+" "+yy+" "+x+" "+(yy+6)+" M"+(x+4)+" "+(yy-4)+" Q"+x+" "+yy+" "+x+" "+(yy+6),"none",b,2.2))}s.append(p("M"+(150-w+8)+" "+(y+53)+" Q150 "+(y+68)+" "+(150+w-8)+" "+(y+53),"none",c,3))}
 }else if(style==="crystal"){
  // Geometric cut-glass facets, clear highlights and a separate glass pedestal.
  for(let i=2;i>=0;i--){const top=35+i*61,y=top+124,w=56+i*33;const outline="M150 "+top+" L"+(150-w)+" "+y+" L150 "+(y+18)+" L"+(150+w)+" "+y+"Z";s.append(p(outline,paint,"#f4ffff",2),p("M150 "+top+" L150 "+(y+18)+" L"+(150-w)+" "+y+"Z",b,"#fff",1.2),p("M150 "+top+" L"+(150+w*.43)+" "+(y-18)+" L150 "+(y+18)+"Z","#ffffff90","#ffffff",1),p("M"+(150-w)+" "+y+" L150 "+(y-35)+" L"+(150+w)+" "+y,"none","#f6ffff",1.3))}
  s.append(p("M132 294 H168 L185 326 H115Z",b,"#edfaff",2),ellipse(150,326,38,7,"#c2d8e6"));
 }else{
  // Natural fir: layered branch tips instead of a scalloped triangle.
  for(let i=8;i>=0;i--){const y=49+i*28,w=13+i*14;const d="M150 "+(y-29)+" Q"+(150-w*.4)+" "+(y+8)+" "+(150-w)+" "+(y+25)+" L"+(150-w*.64)+" "+(y+21)+" L"+(150-w*.82)+" "+(y+34)+" L"+(150-w*.35)+" "+(y+25)+" L150 "+(y+39)+" L"+(150+w*.35)+" "+(y+25)+" L"+(150+w*.82)+" "+(y+34)+" L"+(150+w*.64)+" "+(y+21)+" L"+(150+w)+" "+(y+25)+" Q"+(150+w*.4)+" "+(y+8)+" 150 "+(y-29)+"Z";s.append(p(d,i%2?a:c,c,.7));for(const dir of [-1,1])s.append(p("M150 "+(y-10)+" Q"+(150+dir*w*.3)+" "+(y+10)+" "+(150+dir*w*.83)+" "+(y+23),"none",b,3),p("M"+(150+dir*w*.18)+" "+(y+7)+" Q"+(150+dir*w*.4)+" "+(y+15)+" "+(150+dir*w*.72)+" "+(y+20),"none","#f8fcff",4.5))}
 }
 materialLights(s,style);
 s.append(p("M150 6 158 25 180 27 164 41 169 63 150 51 131 63 136 41 120 27 142 25Z","#ffdb7d","#ffeab0",2));s.lastChild.setAttribute("class","nt-star-top");return s;
}
function sticker(s,kind,x,y,w){const a=ornamentArt(kind);if(a.namespaceURI===ns){a.setAttribute("x",x);a.setAttribute("y",y);a.setAttribute("width",w);a.setAttribute("height",w);s.append(a)}else{const t=el("text",{x:x+w/2,y:y+w*.8,"text-anchor":"middle","font-size":w*.8,"font-family":"Apple Color Emoji, Segoe UI Emoji, sans-serif"});t.textContent=a.textContent;s.append(t)}}
// Original vector scenery, shared by the editor, village, album and PNG.
export function addSceneBackground(s,kind,id){
 if(kind==="none")return s;
 if(extraBackground(s,kind,id))return s;
 const palette={snowforest:["#c6dce3","#f8eee0","#a4b9bd"],cabinroom:["#674337","#c99b77","#a67d5e"],wintervillage:["#18334f","#667c99","#bed4e0"],pastelstudio:["#f2dce6","#fff8ed","#e8ccd6"]}[kind];
 if(!palette)return s;
 const [a,b,c]=palette,g=el("g",{"aria-hidden":"true"}),defs=el("defs"),grad=el("linearGradient",{id:id+"-scene",x1:"0",y1:"0",x2:"0",y2:"100%"}),clip=el("clipPath",{id:id+"-scene-clip"});
 grad.append(el("stop",{offset:"0%","stop-color":a}),el("stop",{offset:"100%","stop-color":b}));clip.append(rect(0,0,300,360,13,"#fff"));defs.append(grad,clip);g.append(defs);const layer=el("g",{"clip-path":"url(#"+id+"-scene-clip)"});layer.append(rect(0,0,300,360,0,"url(#"+id+"-scene)"));
 const fir=(x,y,w,h,fill,snow)=>{for(let j=0;j<3;j++){let yy=y+j*h*.24,ww=w*(.42+j*.29);layer.append(p("M"+x+" "+yy+" L"+(x-ww)+" "+(yy+h*.5)+" Q"+x+" "+(yy+h*.58)+" "+(x+ww)+" "+(yy+h*.5)+"Z",fill));if(snow)layer.append(p("M"+x+" "+(yy+3)+" L"+(x-ww*.52)+" "+(yy+h*.29)+" Q"+x+" "+(yy+h*.23)+" "+(x+ww*.52)+" "+(yy+h*.29)+"Z",snow))}};
 const stars=(n,col)=>{for(let i=0;i<n;i++)layer.append(circle((i*67+19)%300,(i*47+12)%268,.6+(i%4)*.45,col))};
 if(kind==="snowforest"){
 layer.append(circle(235,60,28,"#fff7dc"),p("M0 193 Q61 109 109 183 T220 172 T300 154 V360 H0Z","#bdcfd5"),p("M0 254 Q60 200 130 245 T300 213 V360 H0Z","#dbe8e9"));
 for(const [x,y,w,h] of [[-4,71,37,172],[37,128,29,132],[66,178,23,96],[278,63,39,181],[244,124,24,133],[218,176,20,91]])fir(x,y,w,h,"#789c9d","#e7f1ef");
 layer.append(p("M0 289 Q75 270 139 305 T300 283 V360 H0Z","#f8fbfa"),p("M0 338 Q88 306 170 339 T300 326 V360 H0Z","#e9f0f1"));stars(45,"#ffffffc0");
 }else if(kind==="cabinroom"){
 for(let y=0;y<300;y+=27)layer.append(p("M0 "+y+" H300","none","#523329",1.2));
 layer.append(rect(17,30,75,117,35,"#e9bd8a"),rect(23,36,63,104,30,"#324f66"),circle(65,61,12,"#fff2c3"),p("M24 110 Q43 89 85 112 V140 H24Z","#e5eaf0"),p("M54 36 V140 M23 83 H86","none","#b88a62",4));
 layer.append(rect(222,171,78,104,4,"#6e4a40"),rect(228,180,65,86,3,"#9b7461"),rect(238,203,46,55,18,"#3c2a28"),p("M250 254 Q238 239 258 220 Q254 241 264 233 Q286 243 269 257Z","#ffb45d"),p("M259 254 Q253 244 265 236 Q273 245 267 255Z","#fff0a3"),rect(216,168,84,8,2,"#d4a87e"));
 layer.append(p("M0 286 H300 V360 H0Z","#af8060"));for(let x=-100;x<500;x+=45)layer.append(p("M150 284 L"+x+" 360","none","#916449",1));layer.append(ellipse(150,333,120,21,"#d9b5a0"));
 }else if(kind==="wintervillage"){
 layer.append(circle(242,47,24,"#fff0c0"),circle(253,40,23,a));stars(42,"#f9e9c9");
 layer.append(p("M0 185 Q60 143 116 196 T233 182 T300 171 V360 H0Z","#91a9ba"));
 for(const [x,y,w,h] of [[4,196,46,65],[55,211,34,47],[252,194,43,69],[211,220,34,43]]){
 layer.append(rect(x,y,w,h,2,"#896f70"),p("M"+(x-5)+" "+y+" L"+(x+w/2)+" "+(y-29)+" L"+(x+w+5)+" "+y+"Z","#e2e9ea"),rect(x+w*.2,y+13,9,13,1,"#ffe5a0"),rect(x+w*.65,y+13,9,13,1,"#ffe5a0"),rect(x+w*.43,y+h-22,10,22,2,"#554f61"));
 }layer.append(p("M0 281 Q70 257 153 286 T300 270 V360 H0Z","#e9f1f5"),p("M0 337 Q140 308 300 334 V360 H0Z","#d5e4ed"));stars(27,"#fff");
 }else{
 layer.append(p("M0 291 Q150 277 300 291 V360 H0Z","#fff9f4"),ellipse(150,331,117,19,"#eacbd9"));
 for(let i=0;i<22;i++){const x=(i*79+7)%300,y=(i*39+13)%280;layer.append(circle(x,y,2+i%4,"#ffffffb0"))}
 for(const x of [8,292]){layer.append(p("M"+x+" 0 Q"+(x<150?50:250)+" 60 "+x+" 190","none","#fff9f1",2));for(let j=0;j<9;j++)layer.append(circle(x+(x<150?1:-1)*Math.sin(j*.44)*17,j*20+11,2.5,"#fff4c0"))}
 layer.append(p("M0 9 Q75 40 150 15 Q225 40 300 9","none","#cfa6ae",1.5));for(let x=6;x<300;x+=18)layer.append(circle(x,15+Math.sin(x/150*Math.PI)*10,2.8,"#fff2c0"));
 }
 g.append(layer);s.insertBefore(g,s.firstChild);return s;
}
export function decorateScene(s,scene,id="nt"){
 addSceneBackground(s,scene.gardenBackgrounds,id);
 const {gardenBases:base,gardenSides:side,gardenTops:top}=scene;
 if(base==="basket"){s.append(p("M117 294 H183 L176 336 H124Z","#c49c6a","#806044",2));for(let y=301;y<335;y+=7){s.append(p("M124 "+y+" H176","none","#edd5aa",2));for(let x=126;x<176;x+=8)s.append(p("M"+x+" "+y+" l5 6","none","#92704a",1))}}
 if(base==="pot")s.append(p("M115 295 H185 L176 336 H124Z","#b76a57","#8c4c43",2),rect(112,292,76,9,3,"#da9882"));
 if(base==="snowmat")s.append(ellipse(150,334,117,13,"#f9fdff"),ellipse(150,337,92,5,"#d9e9f4"));
 if(base==="wood")s.append(ellipse(150,328,47,11,"#976d4d"),ellipse(150,324,47,10,"#e1b888"),ellipse(150,324,35,7,"#c89568"));
 if(side==="fence"){for(const x of [12,36,60,240,264,288])s.append(p("M"+x+" 301 l5 -8 5 8 v33 h-10Z","#f9e8ce","#ab8c6e"));for(const x of [10,237])for(const y of [308,321])s.append(rect(x,y,63,5,1,"#e2c8a7"))}
 if(side==="gifts"){sticker(s,"gift_pink",17,285,48);sticker(s,"gift_gold",237,295,39)}
 if(side==="lantern"){sticker(s,"lantern",15,278,57);sticker(s,"lantern",232,278,57)}
 if(side==="snowman")sticker(s,"snow",9,274,67);
 if(side==="tiger")sticker(s,"tiger",225,276,66);
 if(side==="cat")sticker(s,"kitty_white",225,276,66);
 if(side==="deer")sticker(s,"deer",225,275,66);
 if(top!=="star"){s.querySelector(".nt-star-top")?.remove();if(top==="bow")sticker(s,"bow_red",122,3,56);if(top==="snowflake")sticker(s,"snow_white",122,3,56)}
 extraAccessories(s,scene,sticker);
 if(["bethlehem","moravian","sunburst","pearlstar","filigreestar","rubystar","aurorastar","cometstar","artdecostar","rosettestar","tiara","twinbells","lotusgem"].includes(top))luxeTop(s,top,id,{...scene,gardenLightStrength:"soft"});
 return s;
}
