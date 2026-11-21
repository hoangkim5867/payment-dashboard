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
 if(data?.schema===EXCEL_SCHEMA)return inspectLegacyExcelReviewPackage(data);
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

const EXCEL_SCHEMA='CASH_SYNC_LEGACY_EXCEL_REVIEW_V1';
const EXCEL_TYPES=new Map([
 ['借出','loan'],['借入','loan'],['还款','repayment'],['收回借款','repayment'],
 ['内部转出','transfer'],['内部转入','transfer']
]);

// The original Chinese monthly ledger preserves grouped rows and balances.
export function buildLegacyExcelReviewPackage(sheets,month,projects){
 if(!monthValid(month)||!Array.isArray(sheets)||!sheets.length||sheets.length>35||
    !Array.isArray(projects))throw Error('LEGACY_EXCEL_MONTH_INVALID');
 const expectedHeaders=['日期','公司名称','合同编号','合同内容','IPC','类型',
   '收入','分包款','材料款','其他直接费用','间接费','财务费用','其他应付款','余额'];
 const names=new Set();
 const groups=sheets.map(grid=>{
   const title=String(grid[0]?.[0]??'');
   const project=title.endsWith('项目现金流')?title.slice(0,-'项目现金流'.length):'';
   if(!projects.includes(project)||names.has(project)||
      grid[1]?.[0]!=='数据期间：'+month||
      expectedHeaders.some((header,i)=>grid[3]?.[i]!==header)||
      grid[4]?.[1]!=='期初余额'||!Number.isFinite(grid[4]?.[13])||
      grid.length<6||grid.length>10005)throw Error('LEGACY_EXCEL_LAYOUT_INVALID');
   names.add(project);
   let balance=grid[4][13];
   const records=grid.slice(5).map((row,i)=>{
     const day=row[0];
     const stamp=new Date(day+'T00:00:00Z');
     const amounts=Array.from({length:7},(_,j)=>row[j+6]===''||row[j+6]===null||
       row[j+6]===undefined?0:row[j+6]);
     if(typeof day!=='string'||!day.startsWith(month+'-')||
        !Number.isFinite(stamp.valueOf())||stamp.toISOString().slice(0,10)!==day||
        row.slice(14).some(x=>x!=null&&x!=='')||
        amounts.some((x,j)=>!Number.isFinite(x)||(j>0&&x<0)))
       throw Error('LEGACY_EXCEL_ROW_INVALID');
     balance+=amounts[0]-amounts.slice(1).reduce((a,b)=>a+b,0);
     if(!Number.isFinite(row[13])||Math.abs(row[13]-balance)>0.001)
       throw Error('LEGACY_EXCEL_BALANCE_MISMATCH');
     const values=[day,...Array.from({length:5},(_,j)=>String(row[j+1]??'')),...amounts];
     const sourceClass=values[1]==='内部调剂'&&EXCEL_TYPES.has(values[5])?'TRANSFER':'UNKNOWN';
     if(project==='FOXCONN')values.push(0);
     return {id:'excel-row:'+(i+6),project,month,sourceClass,values};
   });
   if(project==='FOXCONN'&&month==='2026-10'&&records.length!==19)
     throw Error('FOXCONN_EXCEL_ROW_COUNT_MISMATCH');
   return {project,groupedExcelRows:records.length,records};
 });
 return {schema:EXCEL_SCHEMA,month,projects:groups,
   sourceAuthenticated:false,sourceComplete:false,canWrite:false};
}

function inspectLegacyExcelReviewPackage(data){
 if(!monthValid(data.month)||data.sourceAuthenticated!==false||
    data.sourceComplete!==false||data.canWrite!==false||
    !Array.isArray(data.projects)||!data.projects.length||data.projects.length>35)
   throw Error('LEGACY_EXCEL_REVIEW_INVALID');
 const projects=new Set(), transfers=new Map();
 const groups=data.projects.map(g=>{
   if(typeof g?.project!=='string'||!text(g.project)||g.project.length>180||
      projects.has(g.project)||!Array.isArray(g.records)||
      g.groupedExcelRows!==g.records.length||!g.records.length||g.records.length>10000)
     throw Error('LEGACY_EXCEL_REVIEW_PROJECT_INVALID');
   projects.add(g.project);
   const records=g.records.map((row,i)=>{
     if(!validRecord(row,g.project,data.month)||row.id!=='excel-row:'+(i+6)||
        !['TRANSFER','UNKNOWN'].includes(row.sourceClass))
       throw Error('LEGACY_EXCEL_REVIEW_ROW_INVALID');
     if(row.sourceClass==='TRANSFER'){
       const [day,company,,description,,type,income,...costs]=row.values;
       const kind=EXCEL_TYPES.get(type);
       if(company!=='内部调剂'||!kind||!description||!income||
          costs.some(x=>x!==0))throw Error('LEGACY_EXCEL_TRANSFER_INVALID');
       const key=JSON.stringify([day,description,kind,Math.abs(income)]);
       const legs=transfers.get(key)||[];
       legs.push({project:g.project,income});
       transfers.set(key,legs);
     }
     return Object.freeze({...row,values:Object.freeze(row.values.slice())});
   });
   return {project:g.project,month:data.month,groupedExcelRows:records.length,
     records:Object.freeze(records),state:'HISTORY_COMPARISON_CANDIDATE',
     excelOnly:true,pairedTransferLegs:0,unresolvedTransferLegs:0,canWrite:false};
 });
 const byProject=new Map(groups.map(g=>[g.project,g]));
 for(const legs of transfers.values()){
   const paired=legs.length===2&&legs[0].project!==legs[1].project&&
     legs[0].income===-legs[1].income;
   for(const leg of legs)byProject.get(leg.project)[paired?'pairedTransferLegs':'unresolvedTransferLegs']++;
 }
 const groupedRows=groups.reduce((sum,g)=>sum+g.groupedExcelRows,0);
 if(groupedRows>20000)throw Error('LEGACY_EXCEL_REVIEW_LIMIT');
 return Object.freeze({month:data.month,activeProjects:groups.length,groupedRows,
   sourceAuthenticated:false,sourceComplete:false,canWrite:false,
   groups:Object.freeze(groups.map(Object.freeze))});
}
