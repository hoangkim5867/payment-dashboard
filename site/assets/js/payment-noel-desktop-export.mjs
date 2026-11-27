// Explicit, local-only transfer of the displayed tree. No network or Firebase access.
// Rasterize the actual SVG tree and the visible ornament art, not a new tree design.
const ns="http://www.w3.org/2000/svg";
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function stripDesktopBackdrop(copy){
 for(const layer of copy.querySelectorAll(".nt-depth-background"))layer.remove();
 copy.style.removeProperty("background");copy.style.removeProperty("background-color");
 return copy;
}
export function isolateDesktopBackdrop(copy){
 for(const child of Array.from(copy.children))if(child.localName!=="defs"&&!child.classList.contains("nt-depth-background"))child.remove();
 copy.style.removeProperty("filter");copy.style.removeProperty("background");copy.style.removeProperty("background-color");
 return copy;
}
export function desktopSceneMode(background){return !background||background==="none"?"transparent":"soft-scene"}
function snapshotSVG(source,{transparent=false,backdropOnly=false}={}){
 const copy=source.cloneNode(true),original=[source,...source.querySelectorAll("*")],clones=[copy,...copy.querySelectorAll("*")];
 for(let i=0;i<original.length;i++){
  const a=original[i],b=clones[i];if(a.namespaceURI!==ns)continue;
  const css=getComputedStyle(a);
  for(const key of ["opacity","filter","visibility","display","transform","transform-origin","transform-box"]){
   const value=css.getPropertyValue(key);if(!value)continue;
   // SVG transform attributes and their computed matrices must not both be applied.
   if(key==="transform"&&a.hasAttribute("transform")&&!a.getAnimations().length)continue;
   b.style.setProperty(key,value);
  }
  b.style.setProperty("animation","none");b.style.setProperty("transition","none");
  if(a.localName==="text"){b.style.fontFamily=css.fontFamily;b.style.fontSize=css.fontSize}
 }
 if(backdropOnly)isolateDesktopBackdrop(copy);else if(transparent)stripDesktopBackdrop(copy);
 copy.setAttribute("xmlns",ns);copy.style.width="";copy.style.height="";
 const box=source.getBoundingClientRect();copy.setAttribute("width",String(Math.max(1,Math.round(box.width*2))));copy.setAttribute("height",String(Math.max(1,Math.round(box.height*2))));
 return new XMLSerializer().serializeToString(copy);
}
async function decodeSVG(markup){
 const url=URL.createObjectURL(new Blob([markup],{type:"image/svg+xml;charset=utf-8"}));
 try{const im=new Image();im.src=url;await im.decode();return im}finally{URL.revokeObjectURL(url)}
}
// Feather only the scenery layer. The foreground and ornaments remain untouched.
export function featherDesktopBackdrop(ctx,width,height){
 const edgeX=width*.13,edgeY=height*.11;
 ctx.save();ctx.globalCompositeOperation="destination-in";
 const horizontal=ctx.createLinearGradient(0,0,width,0);
 for(const [at,alpha] of [[0,0],[.035,.10],[.075,.5],[edgeX/width,1],[1-edgeX/width,1],[.925,.5],[.965,.10],[1,0]])horizontal.addColorStop(at,"rgba(0,0,0,"+alpha+")");
 ctx.fillStyle=horizontal;ctx.fillRect(0,0,width,height);
 const vertical=ctx.createLinearGradient(0,0,0,height);
 for(const [at,alpha] of [[0,0],[.028,.12],[.06,.58],[edgeY/height,1],[1-edgeY/height,1],[.94,.58],[.972,.12],[1,0]])vertical.addColorStop(at,"rgba(0,0,0,"+alpha+")");
 ctx.fillStyle=vertical;ctx.fillRect(0,0,width,height);ctx.restore();
}
async function prepareBackdrop(source,scale,w,h,background){
 if(desktopSceneMode(background)==="transparent"||!source.querySelector(".nt-depth-background"))return null;
 const im=await decodeSVG(snapshotSVG(source,{backdropOnly:true}));
 const layer=document.createElement("canvas");layer.width=Math.ceil(w*scale);layer.height=Math.ceil(h*scale);
 const ctx=layer.getContext("2d");if(!ctx)throw Error("CANVAS_UNAVAILABLE");
 ctx.drawImage(im,0,0,layer.width,layer.height);
 featherDesktopBackdrop(ctx,layer.width,layer.height);return layer;
}
function ornamentGeometry(canvas,orn){
 const cs=getComputedStyle(orn),w=orn.offsetWidth,h=orn.offsetHeight,b=canvas.getBoundingClientRect();
 const x=parseFloat(orn.style.left)/100*b.width,y=parseFloat(orn.style.top)/100*b.height;
 return {x,y,w,h,scale:Number(orn.style.getPropertyValue("--nt-orn-scale"))||1,rotation:(parseFloat(orn.style.getPropertyValue("--nt-orn-rotation"))||0)*Math.PI/180,ground:orn.classList.contains("nt-ground-gift"),filter:cs.filter,child:orn.firstElementChild};
}
async function prepareOrnaments(canvas){
 const elements=Array.from(canvas.querySelectorAll(":scope > .nt-ornament"));
 return Promise.all(elements.map(async el=>{
  const g=ornamentGeometry(canvas,el),child=g.child;
  if(!child)return null;
  if(child.namespaceURI===ns){g.image=await decodeSVG(snapshotSVG(child))}
  else {const css=getComputedStyle(child);g.text=child.textContent;g.font=css.fontSize+" "+css.fontFamily}
  return g;
 }));
}
function drawOrnament(ctx,g){
 if(!g)return;ctx.save();ctx.translate(g.x,g.y);ctx.rotate(g.rotation);ctx.scale(g.scale,g.scale);
 if(g.ground){ctx.fillStyle="#b95b6d";ctx.strokeStyle="#f6d99f";ctx.lineWidth=.8;const x=-g.w*.58,y=-g.h*.05,w=g.w*1.16,h=g.h*.67;ctx.beginPath();ctx.roundRect(x,y,w,h,3);ctx.fill();ctx.stroke();ctx.fillStyle="#efcd83";ctx.fillRect(-g.w*.07,y,g.w*.14,h)}
 ctx.filter=g.filter==="none"?"none":g.filter;
 if(g.image)ctx.drawImage(g.image,-g.w/2,-g.h/2,g.w,g.h);else if(g.text){ctx.font=g.font;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(g.text,0,1)}
 ctx.restore();
}
export async function exportDesktopTree(canvas,{name="Noel",background="none",mode="twinkle",lights="original",progress=()=>{},isActive=()=>true}={}){
 const source=canvas.querySelector(":scope > .nt-tree-svg");if(!source)throw Error("TREE_NOT_VISIBLE");
 const box=canvas.getBoundingClientRect();if(box.width<10||box.height<10)throw Error("TREE_NOT_VISIBLE");
 const w=box.width,h=box.height,scale=600/w,pad=24,output=document.createElement("canvas");output.width=Math.ceil(w*scale+pad*2);output.height=Math.ceil(h*scale+pad*2);
 const ctx=output.getContext("2d");if(!ctx)throw Error("CANVAS_UNAVAILABLE");
 const [ornaments,backdrop]=await Promise.all([prepareOrnaments(canvas),prepareBackdrop(source,scale,w,h,background)]);
 const motion=mode!=="static"&&lights!=="off"&&!matchMedia("(prefers-reduced-motion: reduce)").matches,frameCount=motion?8:1,interval=420,frames=[];
 for(let i=0;i<frameCount;i++){
  if(!isActive()||!canvas.isConnected)throw Error("TREE_CHANGED");
  const started=performance.now(),im=await decodeSVG(snapshotSVG(source,{transparent:true}));
  ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,output.width,output.height);ctx.setTransform(scale,0,0,scale,pad,pad);
  // A static, feathered background is composited behind every unmasked foreground frame.
  if(backdrop)ctx.drawImage(backdrop,0,0,w,h);
  ctx.drawImage(im,0,0,w,h);for(const ornament of ornaments)drawOrnament(ctx,ornament);
  frames.push(output.toDataURL("image/png").split(",")[1]);progress(i+1,frameCount);
  if(i+1<frameCount)await wait(Math.max(0,interval-(performance.now()-started)));
 }
 if(!isActive()||!canvas.isConnected)throw Error("TREE_CHANGED");
 const payload={format:"noel-desktop-v1",intervalMs:interval,frames};
 const blob=new Blob([JSON.stringify(payload)],{type:"application/octet-stream"}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=(String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g,"_").trim().slice(0,48)||"Noel")+".noel";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
