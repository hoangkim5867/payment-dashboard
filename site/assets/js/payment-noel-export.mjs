// Local PNG compositor; renders only on explicit user request.
import {ornamentArt} from "./payment-noel-tree-catalog.mjs";
const ns="http://www.w3.org/2000/svg";
async function bitmap(svg,w,h){const clone=svg.cloneNode(true);clone.setAttribute("xmlns",ns);clone.setAttribute("width",w);clone.setAttribute("height",h);const blob=new Blob([new XMLSerializer().serializeToString(clone)],{type:"image/svg+xml;charset=utf-8"}),url=URL.createObjectURL(blob);try{const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url});return img}finally{URL.revokeObjectURL(url)}}
export async function exportGardenPNG({pages,art,entries,name,caption,framed=true}){
 const n=pages.length;if(!n||n>100)throw Error("Invalid album size");
 const single=n===1,w=single?900:360,h=single?1080:432,head=framed?(single?120:52):0,foot=framed?(single?76:36):0,cols=single?1:Math.min(5,Math.ceil(Math.sqrt(n))),rows=Math.ceil(n/cols),canvas=document.createElement("canvas");
 canvas.width=cols*w;canvas.height=rows*(h+head+foot);
 const ctx=canvas.getContext("2d");if(!ctx)throw Error("Canvas unavailable");
 const icons=new Map();
 for(let i=0;i<n;i++){const page=pages[i],x=i%cols*w,y=Math.floor(i/cols)*(h+head+foot);if(framed){const g=ctx.createLinearGradient(x,y,x+w,y+h+head+foot);g.addColorStop(0,"#fffaf0");g.addColorStop(1,"#e9f0e9");ctx.fillStyle=g;ctx.fillRect(x,y,w,h+head+foot);ctx.strokeStyle="#c4a66b";ctx.lineWidth=single?3:1;ctx.strokeRect(x+8,y+8,w-16,h+head+foot-16);ctx.textAlign="center";ctx.fillStyle="#315648";ctx.font=(single?42:20)+"px Georgia, serif";ctx.fillText(String(name||"Christmas").slice(0,32),x+w/2,y+head*.68,w*.9);ctx.font=(single?27:15)+"px system-ui";ctx.fillText(caption(page),x+w/2,y+h+head+foot*.65,w*.9)}
  ctx.drawImage(await bitmap(art(page),w,h),x,y+head,w,h);
  for(const e of entries.filter(z=>z.page===page&&z.g.hidden!==true)){const kind=e.g.kind;if(!icons.has(kind)){const a=ornamentArt(kind);icons.set(kind,a.namespaceURI===ns?await bitmap(a,128,128):a.textContent)}const icon=icons.get(kind),size=w*(e.zone==="ground"?.135:.115)*(e.scale??1);ctx.save();ctx.translate(x+e.x*w/100,y+head+e.y*h/100);ctx.rotate((e.rotation??0)*Math.PI/180);if(typeof icon==="string"){ctx.font=size*.92+"px Apple Color Emoji, Segoe UI Emoji, sans-serif";ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(icon,0,0)}else ctx.drawImage(icon,-size/2,-size/2,size,size);ctx.restore()}
 }
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("PNG unavailable")),"image/png"));const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=single?"noel-tree-"+(pages[0]+1)+".png":"noel-garden.png";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
