// View-only layout for old ornaments; explicit changes are saved by their owner.
import {safeColor} from "./payment-noel-tree-catalog.mjs";
export const MAX_PAGES=100, MAX_LOCAL=300;
export const PAGE_SLOTS=40;
export const treeSlots=[[50,19],[45,27],[55,27],[40,35],[50,35],[60,35],[35,43],[45,43],[55,43],[65,43],[35,51],[45,51],[55,51],[65,51],[30,59],[40,59],[50,59],[60,59],[70,59],[25,67],[35,67],[45,67],[55,67],[65,67],[75,67],[20,75],[30,75],[40,75],[50,75],[60,75],[70,75],[80,75],[15,82],[25,82],[35,82],[45,82],[55,82],[65,82],[75,82],[85,82]];
export const groundSlots=[[14,90],[38,90],[62,90],[86,90],[14,97],[38,97],[62,97],[86,97]];
export const safePage=v=>Number.isInteger(v)&&v>=0&&v<MAX_PAGES?v:0;
export const safeZone=v=>v==="ground"?"ground":"tree";
export const safeScale=v=>Number.isFinite(v)?Math.max(.55,Math.min(1.45,v)):1;
export const safeRotation=v=>Number.isFinite(v)?Math.max(-180,Math.min(180,v)):0;
export const fields=g=>({page:safePage(g.page),zone:safeZone(g.zone),scale:safeScale(g.scale),rotation:safeRotation(g.rotation)});
export const validPoint=(x,y,z)=>Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&x<=100&&(z==="ground"?x>=8&&x<=92&&y>=86&&y<=97:y>=17&&y<=82&&Math.abs(x-50)<=Math.min(44,(y-12)*.62));
export const pageColor=(m,p)=>safeColor(p===0?m.color:(m.gardenColors?.[p]||m.color));
export const capacity=z=>z==="ground"?groundSlots.length:PAGE_SLOTS;
const key=(p,z)=>p+":"+z;
const stamp=g=>g.createdAt?.seconds??0;
export function layoutGarden(local=[],remote=[]){
 const entries=[...local.map(g=>({g,local:true})),...remote.slice().sort((a,b)=>stamp(a)-stamp(b)||String(a.id||"").localeCompare(String(b.id||""))).map(g=>({g,local:false}))];
 const counts=new Map(),out=new Map();
 const place=(entry,p,z,legacy)=>{const g=entry.g,k=key(p,z),n=counts.get(k)||0;counts.set(k,n+1);const slots=z==="ground"?groundSlots:treeSlots;const pos=legacy&&(p>0||!validPoint(g.x,g.y,z))?slots[n%slots.length]:[g.x,g.y];out.set(g,{g,local:entry.local,page:p,zone:z,x:pos[0],y:pos[1],scale:safeScale(g.scale),rotation:safeRotation(g.rotation)})};
 for(const e of entries)if(Number.isInteger(e.g.page)&&e.g.page>=0&&e.g.page<MAX_PAGES)place(e,e.g.page,safeZone(e.g.zone),false);
 for(const e of entries)if(!out.has(e.g)){const z=safeZone(e.g.zone);let p=0;while(p<MAX_PAGES-1&&(counts.get(key(p,z))||0)>=capacity(z))p++;place(e,p,z,true)}
 return {entries:entries.map(e=>out.get(e.g)),counts};
}
export const cleanTreeName=v=>typeof v==="string"?v.trim().slice(0,32):"";
export const safeGardenNames=v=>Array.isArray(v)?v.slice(0,MAX_PAGES).map(cleanTreeName):[];
export function treeNameAt(m,p){return cleanTreeName(m.gardenNames?.[p])||(p===0?cleanTreeName(m.name):"")}
export function countPages(layout,m={}){return Math.max(1,Math.min(MAX_PAGES,Math.max(...["gardenColors","gardenStyles","gardenNames","gardenBases","gardenSides","gardenTops","gardenBackgrounds","gardenLights","gardenGarlands","gardenLightMode","gardenLightStrength"].map(k=>Array.isArray(m[k])?m[k].length:0),safePage(m.representative)+1,...layout.entries.map(e=>e.page+1))))}
export function directoryPages(trees,giftsFor=()=>[]){return trees.flatMap(tree=>{const local=(Array.isArray(tree.decorations)?tree.decorations:[]).filter(g=>g&&typeof g.kind==="string"&&Number.isFinite(g.x)&&Number.isFinite(g.y));const gifts=giftsFor(tree.uid)||[],layout=layoutGarden(local,gifts),total=countPages(layout,tree);return Array.from({length:total},(_,page)=>({tree,page,layout,total}))})}

export function pageCount(layout,p,z){return layout.counts.get(key(p,z))||0}
export function nextPage(layout,p,z){for(let i=p;i<MAX_PAGES;i++)if(pageCount(layout,i,z)<capacity(z))return i;return -1}
export function freeSpot(layout,p,z,exclude){const slots=z==="ground"?groundSlots:treeSlots;const occupied=layout.entries.filter(e=>e.page===p&&e.zone===z&&e.g!==exclude&&e.g.hidden!==true);return slots.slice().sort((a,b)=>distance(b)-distance(a))[0];function distance(a){return occupied.length?Math.min(...occupied.map(e=>(e.x-a[0])**2+(e.y-a[1])**2)):10000}}
export function arrangePage(layout,p){const result=[];for(const z of ["tree","ground"]){const slots=z==="ground"?groundSlots:treeSlots;let n=0;for(const e of layout.entries.filter(e=>e.page===p&&e.zone===z&&e.g.hidden!==true)){if(n>=slots.length)break;const [x,y]=slots[n++];result.push({g:e.g,local:e.local,patch:{page:p,zone:z,x,y,scale:z==="tree"?(pageCount(layout,p,"tree")>32?.60:pageCount(layout,p,"tree")>24?.68:.78):.9,rotation:0}})}}return result}
