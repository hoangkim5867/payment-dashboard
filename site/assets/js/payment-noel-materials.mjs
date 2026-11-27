import {backgroundNames,depthBackground,isolateBackgroundForeground} from "./payment-noel-depth-backgrounds.mjs";
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
accessoryOptions.gardenBackgrounds.push(...Object.keys(backgroundNames));
Object.assign(accessoryOptions,blingOptions,{gardenBackgroundLevel:["medium","soft","focus"]});
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
export function addSceneBackground(s,kind,id,level="medium"){if(kind!=="none")depthBackground(s,kind,id,level);return s;}
export function decorateScene(s,scene,id="nt"){
 addSceneBackground(s,scene.gardenBackgrounds,id,scene.gardenBackgroundLevel);
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
 if(scene.gardenBackgrounds!=="none"&&s.getAttribute("viewBox")==="0 0 300 360")isolateBackgroundForeground(s);
 return s;
}
