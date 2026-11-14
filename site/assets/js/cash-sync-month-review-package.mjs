/**
 * Cash Control monthly Export Excel review package.
 * One local JSON file for the entire selected month, instead of 35 separate
 * imports. No remote persistence, no Firebase tokens, no Google OAuth tokens.
 * It is evidence for READ-ONLY comparison, not a certified source or writer.
 */
const SCHEMA='CASH_SYNC_MONTH_EXPORT_REVIEW_V1';
const monthValid=x=>typeof x==='string'&&/^20\d{2}-(0[1-9]|1[0-2])$/.test(x)&&x>='2026-10';
const text=x=>String(x??'').normalize('NFKC').trim();
const validRecord=(r,p,m)=>r&&typeof r==='object'&&!Array.isArray(r)&&
 typeof r.id==='string'&&r.id.length>=3&&r.id.length<=500&&
 r.project===p&&r.month===m&&
 ['PAYMENT','CASH','PAYROLL','TRANSFER','MIXED','UNKNOWN'].includes(r.sourceClass)&&
 Array.isArray(r.values)&&r.values.length===(p==='FOXCONN'?14:13)&&
 typeof r.values[0]==='string'&&r.values[0].startsWith(m+'-')&&
 r.values.slice(1,6).every(x=>typeof x==='string'&&x.length<=1000)&&
 r.values.slice(6).every(x=>typeof x==='number'&&Number.isFinite(x));

export function buildMonthReviewPackage({month,manifest,actualMonthLoaded,
  monthQueryCount,revision,exportedAt}={}){
 if(!monthValid(month)||manifest?.month!==month||
   manifest.sourceComplete!==false||manifest.canWrite!==false||
   !Array.isArray(manifest.groups)||manifest.groups.length>150||
   actualMonthLoaded!==true||!Number.isInteger(monthQueryCount)||monthQueryCount<0||
   !Number.isInteger(revision)||revision<0)
   throw Error('MONTH_SOURCE_NOT_READY');
 const active=manifest.groups.filter(g=>g.groupedExcelRows>0);
 if(active.length>35)throw Error('TOO_MANY_ACTIVE_PROJECTS');
 const projects=active.map(g=>{
   if(!text(g.project)||g.project.length>180||
     !Array.isArray(g.records)||g.records.length>10000||
     !Array.isArray(g.issues)||g.issues.length>10000)
     throw Error('INVALID_SOURCE_PROJECT');
   const seen=new Set();
   for(const rec of g.records){
     if(!validRecord(rec,g.project,month)||seen.has(rec.id))
       throw Error('INVALID_SOURCE_ROW_OR_ID');
     seen.add(rec.id);
   }
   return {project:g.project,groupedExcelRows:g.groupedExcelRows,
     state:g.state,issues:g.issues.map(({row,code})=>({row,code})),
     records:g.records.map(({id,project,month,sourceClass,values})=>
       ({id,project,month,sourceClass,values:[...values]}))};
 });
 const seen=new Set();
 for(const p of projects){
   if(seen.has(p.project))throw Error('DUPLICATE_PROJECT');
   seen.add(p.project);
 }
 return {schema:SCHEMA,month,createdAt:exportedAt||new Date().toISOString(),
   projectsInCatalog:manifest.catalogProjects,
   actualPaidMonthQuery:{
     // Query is indexed on processPaymentDate in the source application.
     // 1 scoped month query, NEVER a scan of every project.
     month,documentsReturned:monthQueryCount,
     completeBusinessCoverage:false
   },
   cashRevision:revision,projects,
   activeProjects:active.length,
   groupedRows:active.reduce((s,g)=>s+g.groupedExcelRows,0),
   sourceAuthenticated:false,sourceComplete:false,
   googleCompared:false,canSync:false,canWrite:false,
   note:'Local, Admin-initiated read-only source review. Not approved for writes.'
 };
}
export function inspectMonthReviewPackage(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||
   data.schema!==SCHEMA||!monthValid(data.month)||
   data.sourceAuthenticated!==false||data.sourceComplete!==false||
   data.googleCompared!==false||data.canSync!==false||
   data.canWrite!==false||!Array.isArray(data.projects)||
   data.projects.length>35||!Number.isInteger(data.groupedRows)||
   data.groupedRows<0||data.groupedRows>20000||
   !Number.isInteger(data.activeProjects)||
   data.activeProjects!==data.projects.length||
   !Number.isInteger(data.projectsInCatalog)||data.projectsInCatalog<1||
   data.projectsInCatalog>150||
   data.actualPaidMonthQuery?.month!==data.month||
   !Number.isInteger(data.actualPaidMonthQuery.documentsReturned)||
   data.actualPaidMonthQuery.documentsReturned<0||
   data.actualPaidMonthQuery.completeBusinessCoverage!==false)
   throw Error('MONTH_SOURCE_REVIEW_FILE_INVALID');
 const projects=new Set(),groups=[];
 let total=0;
 for(const g of data.projects){
   if(!g||typeof g.project!=='string'||!text(g.project)||
     g.project.length>180||projects.has(g.project)||
     !Number.isInteger(g.groupedExcelRows)||g.groupedExcelRows<1||
     g.groupedExcelRows>10000||
     !Array.isArray(g.records)||g.records.length>g.groupedExcelRows||
     !Array.isArray(g.issues)||g.issues.length>10000)
     throw Error('MONTH_SOURCE_PROJECT_INVALID');
   projects.add(g.project);total+=g.groupedExcelRows;
   const ids=new Set(),rows=[];
   for(const r of g.records){
     if(!validRecord(r,g.project,data.month)||ids.has(r.id))
       throw Error('MONTH_SOURCE_ROW_INVALID');
     ids.add(r.id);
     rows.push(Object.freeze({...r,values:Object.freeze(r.values.slice())}));
   }
   const unresolved=g.issues.length>0||rows.length!==g.groupedExcelRows||
     rows.some(r=>r.sourceClass==='MIXED'||r.sourceClass==='UNKNOWN'||
       r.sourceClass==='TRANSFER');
   // Mirror matches still need Google scan and source-attestation. Transfers
   // remain review-only even if two legs matched in the local export.
   groups.push(Object.freeze({
     project:g.project,month:data.month,
     groupedExcelRows:g.groupedExcelRows,records:Object.freeze(rows),
     state:unresolved?'SOURCE_REVIEW_REQUIRED':'HISTORY_COMPARISON_CANDIDATE',
     issues:Object.freeze(g.issues.map(i=>({row:i.row,code:String(i.code)}))),
     canWrite:false,sourceComplete:false
   }));
 }
 if(total!==data.groupedRows)
   throw Error('MONTH_SOURCE_ROW_COUNT_MISMATCH');
 return Object.freeze({
   month:data.month,activeProjects:data.activeProjects,
   groupedRows:data.groupedRows,
   // These came from an untrusted local JSON file; never call them signed
   // snapshots or treat them as release authorization.
   sourceAuthenticated:false,sourceComplete:false,canWrite:false,
   groups:Object.freeze(groups)
 });
}
