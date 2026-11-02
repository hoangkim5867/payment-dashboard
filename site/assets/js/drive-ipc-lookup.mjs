// Read-only Google Drive IPC dossier discovery. Never writes Drive or Firebase.
export const GOOGLE_DRIVE_CLIENT_ID="217279768663-lkrs0o14b9kg1fi4rk1pt7cpgf7bq3sq.apps.googleusercontent.com";
export const GOOGLE_DRIVE_SCOPE="https://www.googleapis.com/auth/drive.metadata.readonly";
const folderMime="application/vnd.google-apps.folder";
const normalize=value=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/gi,"d").toUpperCase();
const compact=value=>normalize(value).replace(/[^A-Z0-9\u4e00-\u9fff]/g,"");
const listTokens=(v,types)=>{
 const exp=new RegExp("(?:^|[^A-Z0-9])("+types+")[\\s._-]*0*(\\d{1,5})(?!\\d)","g");
 const found=new Set();let item;const t=normalize(v);
 while((item=exp.exec(t)))found.add(item[1]+Number(item[2]));
 return [...found];
};
export const ipcTokens=value=>listTokens(value,"IPC|MEP");
export const contractTokens=value=>listTokens(value,"SUBP|SUPL|SUBP|LAB|ADM|MEP|SUP");
// Known project aliases only: do not guess other Chinese/Vietnamese names.
// Keep the zone decimals distinct: 1.1 must never match 1.2 or 11.
const hongHacIdentity=value=>{
 const raw=normalize(value),key=compact(value);
 if(!/(?:红鹤别墅|紅鶴別墅)/.test(raw)&&!key.includes("HONGHAC"))return "";
 const zone=raw.match(/(?:ZONE|KHU|别墅|別墅)[\s/_-]*(\d{1,2})\s*\.\s*(\d{1,2})/i)
   ||raw.match(/(\d{1,2})\s*\.\s*(\d{1,2})\s*(?:区|區)/);
 return zone?"HONGHACZONE"+Number(zone[1])+"DOT"+Number(zone[2]):"HONGHAC";
};
const normalizeProject=value=>{
 const known=hongHacIdentity(value);
 if(known)return known;
 const s=compact(value);
 if(/^EATON(PARK)?(P1)?$/.test(s)||s==="EATONPARKP1")return "EATONPARK";
 if(s==="OCEANLINKPROJECT"||s==="OCEANLINK")return "OCEANLINK";
 return s;
};
const knownProjects=["EATON","ELYSIAN","PHUHUNG","OCEANLINK","FOXCONN","ADVANCE","H143","C13B","CN82","CR51B","SSIS","FSCPCB","ORKIDE","ZJ","S61","CHAOMED"];
const projectWord=value=>{
 const known=hongHacIdentity(value);
 // A bare HONGHAC folder is not enough to assert which zone was paid.
 if(known&&known!=="HONGHAC")return known;
 const s=compact(value);
 if(s.includes("EATON"))return "EATONPARK";
 if(s.includes("ELYSIAN"))return "ELYSIAN";
 if(s.includes("PHUHUNG"))return "PHUHUNG";
 if(s.includes("OCEANLINK"))return "OCEANLINK";
 for(const key of knownProjects.slice(4))if(s.startsWith(key)||s.includes(key+"MEP"))return key;
 return "";
};
export const folderId=raw=>{
 try{
  const u=new URL(String(raw??"").trim());
  if(u.protocol!=="https:"||u.hostname!=="drive.google.com")return "";
  return u.pathname.match(/\/(?:drive\/(?:u\/\d+\/)?folders|folders)\/([A-Za-z0-9_-]{8,})(?:\/|$)/)?.[1]||"";
 }catch{return "";}
};
export const fileUrl=file=>file.webViewLink||(
 file.mimeType===folderMime?"https://drive.google.com/drive/folders/"+encodeURIComponent(file.id):
 "https://drive.google.com/file/d/"+encodeURIComponent(file.id)+"/view"
);
export async function scanDriveFolder({folderId:rootId,token,fetcher=fetch,onProgress=()=>{},maxFolders=400,maxItems=15000,maxDepth=9}){
 if(!/^[A-Za-z0-9_-]{8,}$/.test(rootId))throw Error("Link thư mục Google Drive không hợp lệ.");
 if(!token)throw Error("Cần kết nối Google và cấp quyền chỉ đọc trước.");
 async function get(url){
  const res=await fetcher("https://www.googleapis.com/drive/v3/"+url,{headers:{Authorization:"Bearer "+token},cache:"no-store"});
  if(!res.ok){
   const body=await res.json().catch(()=>({}));
   throw Error("Drive "+res.status+": "+(body.error?.message||"Không có quyền truy cập hoặc tài khoản Google chưa được chia sẻ"));
  }
  return res.json();
 }
 const root=await get("files/"+encodeURIComponent(rootId)+"?supportsAllDrives=true&fields="+encodeURIComponent("id,name,mimeType"));
 if(root.mimeType!==folderMime)throw Error("Đây không phải thư mục Drive.");
 const queue=[{id:rootId,segments:[root.name||""],depth:0}],files=[],folders=[];
 let readFolders=0,items=0,partial=false;
 while(queue.length){
  if(readFolders>=maxFolders){partial=true;break;}
  const current=queue.shift();readFolders++;
  if(readFolders===1||readFolders%10===0)onProgress({readFolders,items,pdfs:files.length});
  let pageToken="";
  do{
   const q=new URLSearchParams({
    q:"'"+current.id.replace(/'/g,"\\'")+"' in parents and trashed = false",
    fields:"nextPageToken,incompleteSearch,files(id,name,mimeType,webViewLink)",
    pageSize:"250",supportsAllDrives:"true",includeItemsFromAllDrives:"true"
   });
   if(pageToken)q.set("pageToken",pageToken);
   const page=await get("files?"+q.toString());
   if(page.incompleteSearch)partial=true;
   for(const f of page.files||[]){
    items++;
    if(items>maxItems){partial=true;break;}
    const full={...f,path:current.segments.join("/")};
    if(f.mimeType===folderMime){
     folders.push(full);
     if(current.depth<maxDepth)queue.push({id:f.id,segments:[...current.segments,f.name],depth:current.depth+1});
     else partial=true;
    }else if(f.mimeType==="application/pdf"||/\.pdf$/i.test(f.name||"")){
     files.push(full);
    }
   }
   if(items>maxItems)break;
   pageToken=page.nextPageToken||"";
  }while(pageToken);
  if(items>maxItems)break;
 }
 onProgress({readFolders,items,pdfs:files.length});
 return {files,folders,rootName:root.name||"",readFolders,items,partial};
}
export function findPaymentPdfCandidates(payment,scan){
 const contract=contractTokens(payment.contractNo);
 const ipc=ipcTokens(payment.ipcNo)[0];
 const wantedProject=normalizeProject(payment.project);
 if(!ipc||!contract.length)return [];
 const projectRoot=normalizeProject(scan.rootName);
 const rootIsContract=contract.some(c=>contractTokens(scan.rootName).includes(c));
 const rootIsNarrow=/^(IPC|SUPL|SUBP|LAB|ADM|MEP)([-_ ]*0*\d+)?$/i.test(scan.rootName);
 const rootIsProject=projectRoot===wantedProject;
 const rootIsMaster=compact(scan.rootName)==="SSIS"||compact(scan.rootName)==="ROOT";
 const scored=[];
 for(const file of scan.files||[]){
  const segments=String(file.path||"").split("/").filter(Boolean);
  const relative=segments.slice(1);
  const fromFolders=relative.map(projectWord).filter(Boolean);
  // Also recognize project + zone split across adjacent Drive folders.
  const pathProject=projectWord(relative.join("/"));
  const otherFromFolders=fromFolders.some(p=>p!==wantedProject)||Boolean(pathProject&&pathProject!==wantedProject);
  if(otherFromFolders)continue;
  const filenameProject=projectWord(file.name);
  if(filenameProject&&filenameProject!==wantedProject)continue;
  const folderMatches=relative.some(p=>normalizeProject(p)===wantedProject)||pathProject===wantedProject;
  const nameProject=filenameProject===wantedProject;
  const recognizedProject=folderMatches||nameProject||rootIsProject;
  const keyFromName=contractTokens(file.name);
  // If the file explicitly names another contract, never suggest it for the selected payment.
  if(keyFromName.some(c=>!contract.includes(c)))continue;
  const pathContract=contractTokens(file.path);
  if(pathContract.some(c=>!contract.includes(c)))continue;
  const contractMatch=contract.some(c=>keyFromName.includes(c)||pathContract.includes(c));
  const eligibleContract=contractMatch||rootIsContract;
  if(!eligibleContract)continue;
  const fileIpcs=ipcTokens(file.name);
  const pathIpcs=ipcTokens(file.path);
  if(fileIpcs.length&&!fileIpcs.includes(ipc))continue;
  const numberedIpc=fileIpcs.includes(ipc)||(fileIpcs.length===0&&pathIpcs.includes(ipc));
  if(!numberedIpc)continue; // generic shared "IPC" folders are not a specific payment file.
  if(rootIsMaster&&!recognizedProject)continue;
  const uncertainProject=!recognizedProject&&(rootIsNarrow||rootIsContract);
  if(!recognizedProject&&!uncertainProject)continue;
  const score=(nameProject?35:0)+(folderMatches?35:0)+(rootIsProject?25:0)+(keyFromName.some(c=>contract.includes(c))?25:0)+(fileIpcs.includes(ipc)?30:10);
  scored.push({...file,score,confidence:uncertainProject?"review":"strong",url:fileUrl(file)});
 }
 return scored.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,80);
}
