'use strict';
/*
 * Source certification from REAL server documents, one bounded paid-month
 * Payment query and two protected Cash Control/legacy archive documents.
 *
 * Supports unambiguous, 1:1 paid Payment expenses and, for new rows,
 * linked client receipts and signed manual transfer legs from Cash Control.
 * Legacy cash, payroll, grouped quarterly PIT, older aliases and unknown
 * buckets still require separate source rules.
 *
 * This deliberately does NOT infer all 35 projects are certified from
 * a 187-document monthly Payment query or from a cached spreadsheet.
 */
const {sha,parseValues}=require('./cash-sync-multi-project-core.cjs');
const {readFields,SEED_HASH}=require('./cash-sync-s13-source-integrity.cjs');
const {createHash}=require('node:crypto');
const norm=v=>String(v??'').normalize('NFKC').trim();
const validDate=v=>{
 if(typeof v!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(v))return false;
 const [year,month,day]=v.split('-').map(Number);
 const exact=new Date(Date.UTC(year,month-1,day));
 return exact.getUTCFullYear()===year&&exact.getUTCMonth()===month-1&&
   exact.getUTCDate()===day;
};
const money=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')?
 Number(v):NaN;
const eq=(a,b)=>Math.abs(a-b)<0.000001;
const bounded=(a,n)=>Array.isArray(a)&&a.length<=n;
const problem=(code)=>{throw Object.assign(Error(code),{statusCode:409})};
const NEXT=(m)=>{const [y,n]=m.split('-').map(Number);return n===12?
 (y+1)+'-01':y+'-'+String(n+1).padStart(2,'0')};
function category(raw,project){
 const c=norm(raw?.costType).toLowerCase();
 const details=[raw?.contractName,raw?.note,raw?.remark,raw?.description,raw?.content].map(norm).join(' ').toLowerCase();
 if(/(?:招标|投标)(?:文件|资料).*购买费|(?:购买|购置).*(?:招标|投标)(?:文件|资料)/.test(details))return 9;
 if(/(?:投标|履约|预付款)保函.*手续费/.test(details))return 11;
 if(/投标保证金|投标押金/.test(details))return 9;
 if(/材料|vật tư|vat tu/.test(c))return 8;
 if(/分包|thầu phụ|thau phu/.test(c))return 7;
 if(/劳务|nhân công|nhan cong/.test(c))return 9;
 if(/其他直接|trực tiếp|truc tiep/.test(c))return 9;
 if(/财务|tài chính|tai chinh/.test(c))return 11;
 if(/间接|gián tiếp|gian tiep/.test(c)&&project!=='FOXCONN')return 10;
 // FOXCONN import tax/VAT has a special column and must be classified
 // by its original import-tax rule; refuse generic proof here.
 return null;
}
// Match a narrow, real manual expense against the seven Cash Control Excel
// amount buckets. Payroll, quarterly PIT, imports and linked modules are NOT
// inferred from a free-text cost description.
function manualCashBucket(cash){
 const text=[cash.category,cash.description,cash.contractType].map(norm).join(' ').toLowerCase();
 if(/工资|奖金|lương|luong|thưởng|thuong|bảo hiểm|bao hiem|保险|社保|công đoàn|cong doan|工会|伙食|tiền ăn|tien an|个税|所得税|thuế\s*tncn|thue\s*tncn/.test(text))return null;
 if(/材料|vật tư|vat tu/.test(text))return 8;
 if(/分包|thầu phụ|thau phu/.test(text))return 7;
 if(/劳务|nhân công|nhan cong|其他直接|chi trực tiếp|chi truc tiep/.test(text))return 9;
 if(/间接|gián tiếp|gian tiep/.test(text))return 10;
 if(/财务|tài chính|tai chinh|bảo lãnh|bao lanh|授信|hạn mức|han muc/.test(text))return 11;
 if(/清关|进口税|外省增值税|thuế nhập khẩu|thue nhap khau|ký quỹ|ky quy|保证金|deposit/.test(text))return null;
 if(/^(khác|chi phí khác|khoản phải trả khác|其他应付款|其他费用)$/.test(norm(cash.category).toLowerCase()))return 12;
 return null;
}
// Replay the canonical Chinese labels used by the existing Xuất Excel
// projection for linked, non-tax payroll. No free-text guess of a salary ID.
function payrollGroup(record){
 const g=norm(record.staffGroup).toLowerCase();
 if(['vn','vietnam','viet nam','người việt','越籍','越南'].includes(g))return 'vn';
 if(['cn','tq','china','trung quoc','中方','中国'].includes(g))return 'cn';
 if(record.type==='insurance_vn'||record.sourceType==='vn_paste')return 'vn';
 if(record.type==='insurance_cn'||record.sourceType==='cn_excel')return 'cn';
 const sub=norm(record.subCode).toUpperCase();
 if(['LVN','BHVN'].includes(sub))return 'vn';
 if(['LTQ','BHTQ'].includes(sub))return 'cn';
 const raw=[record.sourceSheet,record.sourceFile,record.description,
  record.category,record.note].join(' ');
 if(/越籍|越南|VIET\s*NAM|LƯƠNG\s*VN|LUONG\s*VN/i.test(raw))return 'vn';
 if(/中方|中国|中国籍|CHINA|LƯƠNG\s*TQ|LUONG\s*TQ/i.test(raw))return 'cn';
 return 'unknown';
}
function payrollZh(record,cash){
 const labels={salary:'实发工资',salary_vn:'越籍员工工资',
  salary_cn:'中方员工工资',bonus:'奖金',insurance_vn:'越南社保',
  insurance_cn:'中国社保',union:'工会经费',insurance:'社保',
  meal:'伙食费'};
 const type=norm(record.type),group=payrollGroup(record);
 const key=type==='salary'&&group!=='unknown'?'salary_'+group:type;
 const label=labels[key];
 if(!label)return null; // PIT needs the separate quarter/group verifier
 let content=label;
 if(type==='bonus'){
  const remark=norm(record.note);
  if(remark)content=label+' · '+remark;
  else if(record.bonusYear)content=String(record.bonusYear)+'年'+label;
 }else{
  const month=norm(record.payrollMonth||cash.period);
  if(month&&!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))return null;
  if(month)content=month.slice(0,4)+'年'+month.slice(5)+'月'+label;
 }
 return {company:label,content};
}
function unpackSeed(seed,{expectedSeedHash=SEED_HASH}={}){
 const raw=readFields(seed);
 if(raw.schemaVersion!==1||raw.sha256!==expectedSeedHash||
  typeof raw.payload!=='string'||
  createHash('sha256').update(raw.payload).digest('hex')!==expectedSeedHash)
  problem('LEGACY_ARCHIVE_FINGERPRINT_CHANGED');
 let json;
 try{json=JSON.parse(raw.payload)}catch{problem('LEGACY_ARCHIVE_INVALID')}
 for(const key of ['LEGACY_SALARY','LEGACY_FINANCE','LEGACY_CASH_SPECIAL','LEGACY_VNB'])
  if(!bounded(json[key],20000))problem('LEGACY_ARCHIVE_INCOMPLETE');
 return json;
}
function activeCashRecord(x,project,month){
 if(!x||typeof x!=='object'||Array.isArray(x)||x.status!=='paid'||
  !validDate(x.actualDate)||!x.actualDate.startsWith(month+'-')||
  x.isAllocation===true||x.direction==='adjustment')return false;
 return norm(x.project)===project||norm(x.fromProject)===project||
  norm(x.toProject)===project;
}
function linkedClientReceiptValues(state,project,month,member){
 const cashId=member.slice('expense:'.length);
 const records=state.manualRecords.filter(item=>item?.id===cashId);
 if(records.length!==1)return null;
 const [cash]=records;
 if(cash.kind!=='normal'||cash.source!=='manual'||cash.direction!=='in'||
    cash.category!=='Tiền thu chủ đầu tư'||cash.linkedModule!=='inflow'||
    cash.needsReview===true||cash.project!==project||
    !activeCashRecord(cash,project,month)||
    typeof cash.linkedRecordId!=='string'||!cash.linkedRecordId||
    typeof cash.linkedReceiptId!=='string'||!cash.linkedReceiptId||
    cashId!=='manual_inflow_'+cash.linkedRecordId+'_'+cash.linkedReceiptId)
  return null;
 const inflows=(state.inflowRecords||[]).filter(item=>item?.id===cash.linkedRecordId);
 if(inflows.length!==1)return null;
 const [inflow]=inflows;
 if(inflow.project!==project||!bounded(inflow.receipts,1000)||
    norm(inflow.number)!==norm(cash.subCode)||
    (inflow.cashTxnId!==cashId&&!(Array.isArray(inflow.cashTxnIds)&&inflow.cashTxnIds.includes(cashId))))
  return null;
 const linkedReceipts=inflow.receipts.filter(item=>item?.id===cash.linkedReceiptId);
 if(linkedReceipts.length!==1)return null;
 const [receipt]=linkedReceipts;
 const amount=money(receipt.amount);
 if(receipt.date!==cash.actualDate||!Number.isSafeInteger(amount)||amount<=0||
    amount!==money(cash.actualAmount)||amount!==money(cash.amount))
  return null;
 const number=String(inflow.number||cash.subCode||'').trim();
 const ipc=number.match(/IPC[\s._-]*([0-9]+)/i);
 const content=ipc?'内部结算IPC'+ipc[1]:number?'业主收款 · '+number:'业主收款';
 return parseValues([cash.actualDate,cash.company||cash.counterparty||'',
  cash.contractNo||'',content,cash.ipcNo||cash.subCode||'','业主收款',
  amount,0,0,0,0,0,0],{foxconn:false});
}
function manualTransferValues(state,project,month,member){
 const parsed=/^transfer:(manual_transfer_[0-9]+):(in|out)$/.exec(member);
 if(!parsed)return null;
 const [,cashId,leg]=parsed;
 const records=state.manualRecords.filter(item=>item?.id===cashId);
 if(records.length!==1)return null;
 const [cash]=records;
 if(cash.kind!=='transfer'||cash.source!=='manual'||cash.direction!=='transfer'||
    !activeCashRecord(cash,project,month))
  return null;
 const {fromProject:from,toProject:to,transferType:type,lender,borrower}=cash;
 if(typeof from!=='string'||!from||typeof to!=='string'||!to||
    norm(from)!==from||norm(to)!==to||from===to||
    (leg==='out'?from:to)!==project)
  return null;
 const amount=money(cash.actualAmount);
 if(!Number.isSafeInteger(amount)||amount<=0||amount!==money(cash.amount))return null;
 let content,label;
 if(type==='loan'&&lender===from&&borrower===to){
  content=to+'向'+from+'借款';label=leg==='out'?'借出':'借入';
 }else if(type==='repayment'&&lender===to&&borrower===from){
  content=from+'归还'+to+'借款';label=leg==='out'?'还款':'收回借款';
 }else if(type==='transfer'&&!lender&&!borrower){
  content=from+'调拨至'+to;label=leg==='out'?'内部转出':'内部转入';
 }else return null;
 return parseValues([cash.actualDate,'内部调剂','',content,'',label,
  leg==='out'?-amount:amount,0,0,0,0,0,0],{foxconn:false});
}
function attestMonth({project,month,revision,records,payments,cashDocument,seedDocument,expectedSeedHash=SEED_HASH,
 appendOnly=false}={}){
 if(typeof project!=='string'||!project||norm(project)!==project||
   !/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||month<'2026-10'||
   !Number.isSafeInteger(revision)||revision<0||
   !bounded(records,1000)||!bounded(payments,1000)||
   !cashDocument||!seedDocument)
  problem('SOURCE_CERTIFICATION_SCOPE_INVALID');
 const state=readFields(cashDocument),legacy=unpackSeed(seedDocument,{expectedSeedHash});
 if(state.revision!==revision||!bounded(state.manualRecords,20000)||
   !bounded(state.deletedLegacy,20000)||
   typeof state.legacyOverrides!=='object'||!state.legacyOverrides)
  problem('SOURCE_REVISION_OR_ARCHIVE_CHANGED');
 const blockers=[];
 const all=[...state.manualRecords];
 for(const key of ['LEGACY_SALARY','LEGACY_FINANCE','LEGACY_CASH_SPECIAL','LEGACY_VNB']){
  for(const item of legacy[key]){
   if(state.deletedLegacy.includes(item.id))continue;
   all.push({...item,...(state.legacyOverrides[item.id]||{})});
  }
 }
 for(const entry of all)if(!appendOnly&&activeCashRecord(entry,project,month)){
  blockers.push('CASH_OR_LEGACY_SOURCE_REQUIRES_RULES');break;
 }
 for(const key of ['inflowRecords','salaryRecords','paymentRequests']){
  const collection=state[key];
  if(collection!==undefined&&!bounded(collection,20000))
    blockers.push('UNVERIFIED_CASH_COLLECTION');
  else if(!appendOnly&&Array.isArray(collection)&&collection.some(x=>
    (norm(x?.project)===project||norm(x?.fromProject)===project||
      norm(x?.toProject)===project)&&
    String(x?.actualDate||x?.paymentDate||'').startsWith(month+'-')))
    blockers.push('LINKED_CASH_SOURCE_REQUIRES_RULES');
 }
 const paid=new Map();
 for(const p of payments){
  if(!p||typeof p!=='object'||typeof p.id!=='string'||
    !p.id||typeof p.processPaymentDate!=='string'||
    !p.processPaymentDate.startsWith(month+'-')||
    !validDate(p.processPaymentDate))problem('MONTH_PAYMENT_QUERY_UNVERIFIED');
  if(p.deleted===true)continue;
  if(norm(p.project)!==project){
   if(norm(p.project).toUpperCase()===project.toUpperCase())
    blockers.push('PROJECT_ALIAS_REQUIRES_REVIEW');
   continue;
  }
  if(paid.has(p.id))problem('DUPLICATE_PAYMENT_DOC');
  paid.set(p.id,p);
 }
 const seen=new Set();
 let verifiedRows=0;
 for(const r of records){
  const member=Array.isArray(r?.members)&&r.members.length===1?r.members[0]:null;
  if(appendOnly&&project!=='FOXCONN'&&typeof member==='string'){
   const clientReceipt=r.sourceClass==='CASH'&&
     /^expense:manual_inflow_[A-Za-z0-9_-]{1,190}$/.test(member);
   const manualTransfer=r.sourceClass==='TRANSFER'&&
     /^transfer:manual_transfer_[0-9]+:(in|out)$/.test(member);
   if(clientReceipt||manualTransfer){
    const values=clientReceipt?
      linkedClientReceiptValues(state,project,month,member):
      manualTransferValues(state,project,month,member);
    if(r.project!==project||r.month!==month||r.id!==project+':'+member||seen.has(member)||
       !values||!Array.isArray(r.values)||r.values.length!==13||
       sha(values)!==r.hash||sha(parseValues(r.values,{foxconn:false}))!==r.hash){
     blockers.push(clientReceipt?'LINKED_CLIENT_RECEIPT_MISMATCH':'MANUAL_TRANSFER_LEG_MISMATCH');
     continue;
    }
    seen.add(member);
    verifiedRows++;
    continue;
   }
  }
  // Quarterly personal income tax is exported as ONE row whose identity is
  // date + quarter + all underlying linked payroll-tax IDs. Certify all
  // members and the exact sum; never infer a tax quarter from the payment day.
  if(appendOnly&&project!=='FOXCONN'&&r?.sourceClass==='PAYROLL'&&
     /^tax:[^:]+:20\d{2}-\d{2}-\d{2}:20\d{2}-Q[1-4]:out$/.test(r.id||'')){
    const idMatch=/^tax:(.+):(20\d{2}-\d{2}-\d{2}):(20\d{2}-Q[1-4]):out$/.exec(r.id);
    const members=r.members;
    const validMembers=Array.isArray(members)&&members.length>0&&members.length<=100&&
      members.every((x,i)=>typeof x==='string'&&
        /^expense:manual_[A-Za-z0-9_-]{1,190}$/.test(x)&&
        (i===0||members[i-1]<x)&&!seen.has(x));
    if(!idMatch||idMatch[1]!==project||r.project!==project||r.month!==month||
       !validMembers){
      blockers.push('GROUPED_TAX_SOURCE_ID_INVALID');continue;
    }
    const values=Array.isArray(r.values)&&r.values.length===13?
      parseValues(r.values,{foxconn:false}):null;
    if(!values||sha(values)!==r.hash){
      blockers.push('GROUPED_TAX_ROW_HASH_CHANGED');continue;
    }
    let total=0;const expectedQuarter=idMatch[3],date=idMatch[2];
    let valid=true;let meta=null;
    for(const memberId of members){
      const id=memberId.slice('expense:'.length);
      const found=state.manualRecords.filter(x=>x?.id===id);
      const cash=found.length===1?found[0]:null;
      const linked=cash&&typeof cash.linkedRecordId==='string'?
        (state.salaryRecords||[]).filter(x=>x?.id===cash.linkedRecordId):[];
      const tax=linked.length===1?linked[0]:null;
      const quarter=tax?norm(tax.taxPeriod).toUpperCase().replace('/','-'):'';
      const amt=cash?money(cash.actualAmount??cash.amount):NaN;
      if(!cash||cash.kind!=='normal'||cash.project!==project||
         cash.direction!=='out'||!activeCashRecord(cash,project,month)||
         (cash.source!=='payroll'&&cash.linkedModule!=='payroll')||
         cash.needsReview===true||!tax||tax.type!=='tax'||tax.project!==project||
         quarter!==expectedQuarter||cash.actualDate!==date||
         (tax.actualDate&&tax.actualDate!==date)||
         !Number.isSafeInteger(amt)||amt<=0||
         (cash.amount!==undefined&&money(cash.amount)!==amt)||
         (tax.actualAmount!==undefined&&tax.actualAmount!==null&&
          money(tax.actualAmount)!==amt)){valid=false;break;}
      const fields=[norm(cash.contractNo||''),norm(cash.company||'')];
      if(meta&&JSON.stringify(meta)!==JSON.stringify(fields)){valid=false;break;}
      meta=fields;total+=amt;
    }
    const quarterParts=expectedQuarter.match(/^(20\d{2})-Q([1-4])$/);
    const chinese=quarterParts[1]+'年第'+quarterParts[2]+'季度个人所得税';
    if(!valid||!Number.isSafeInteger(total)||
       values[0]!==date||values[1]!=='个人所得税'||
       norm(values[2])!==meta?.[0]||values[3]!==chinese||
       norm(values[4])!==''||values[5]!=='职工薪酬'||
       values[6]!==0||
       values.slice(7,13).some((n,i)=>!eq(n,i===3?total:0))){
      blockers.push('GROUPED_TAX_SOURCE_OR_AMOUNT_MISMATCH');continue;
    }
    members.forEach(x=>seen.add(x));
    verifiedRows++;
    continue;
  }
  // PAYROLL has its own source class: a paid Cash Control transaction
  // must link to exactly one salary record, and the normalized Chinese
  // export row must match that source. Never certify grouped PIT here.
  if(appendOnly&&project!=='FOXCONN'&&r?.sourceClass==='PAYROLL'&&
     Array.isArray(r.members)&&r.members.length===1&&
     /^expense:manual_[A-Za-z0-9_-]{1,190}$/.test(r.members[0])){
    const memberId=r.members[0],id=memberId.slice('expense:'.length);
    const found=state.manualRecords.filter(x=>x?.id===id);
    const cash=found.length===1?found[0]:null;
    const linked=cash&&typeof cash.linkedRecordId==='string'?
      (state.salaryRecords||[]).filter(x=>x?.id===cash.linkedRecordId):[];
    const salary=linked.length===1?linked[0]:null;
    const labels=salary?payrollZh(salary,cash):null;
    const amount=cash?money(cash.actualAmount??cash.amount):NaN;
    const values=Array.isArray(r.values)&&r.values.length===13?
      parseValues(r.values,{foxconn:false}):null;
    if(!cash||cash.kind!=='normal'||cash.project!==project||
       cash.direction!=='out'||!activeCashRecord(cash,project,month)||
       (cash.source!=='payroll'&&cash.linkedModule!=='payroll')||
       cash.needsReview===true||!salary||salary.project!==project||
       !labels||!Number.isSafeInteger(amount)||amount<=0||
       (cash.amount!==undefined&&money(cash.amount)!==amount)||
       (salary.actualDate&&salary.actualDate!==cash.actualDate)||
       (salary.actualAmount!==undefined&&salary.actualAmount!==null&&
        money(salary.actualAmount)!==amount)||
       r.project!==project||r.month!==month||
       r.id!==project+':'+memberId||seen.has(memberId)||
       !values||sha(values)!==r.hash||
       values[0]!==cash.actualDate||
       norm(values[1])!==labels.company||
       norm(values[3])!==labels.content||
       norm(values[2])!==norm(cash.contractNo||'')||
       norm(values[4])!==''||norm(values[5])!=='职工薪酬'||
       values[6]!==0||values.slice(7,13).some((n,i)=>!eq(n,i===3?amount:0))){
      blockers.push('PAYROLL_LINKED_SOURCE_OR_AMOUNT_MISMATCH');
      continue;
    }
    seen.add(memberId);
    verifiedRows++;
    continue;
  }
  // A non-payroll manual paid expense has a stable Cash Control ID, even
  // when no Payment document exists. Prove the exact original expense and
  // bucket independently; never use the Excel row number as an identity.
  if(appendOnly&&project!=='FOXCONN'&&r?.sourceClass==='CASH'&&
     Array.isArray(r.members)&&r.members.length===1&&
     /^expense:manual_[A-Za-z0-9_-]{1,190}$/.test(r.members[0])&&
     !r.members[0].startsWith('expense:manual_inflow_')){
    const memberId=r.members[0],id=memberId.slice('expense:'.length);
    const matches=state.manualRecords.filter(x=>x?.id===id);
    const cash=matches.length===1?matches[0]:null;
    const amount=cash?money(cash.actualAmount??cash.amount):NaN;
    const bucket=cash?manualCashBucket(cash):null;
    const values=Array.isArray(r.values)&&r.values.length===13?
      parseValues(r.values,{foxconn:false}):null;
    if(!cash||cash.kind!=='normal'||cash.source!=='manual'||
       cash.linkedModule||cash.needsReview===true||
       cash.direction!=='out'||!activeCashRecord(cash,project,month)||
       cash.project!==project||cash.isAllocation===true||
       !Number.isSafeInteger(amount)||amount<=0||
       (cash.amount!==undefined&&money(cash.amount)!==amount)||
       bucket===null||r.project!==project||r.month!==month||
       r.id!==project+':'+memberId||seen.has(memberId)||
       !values||sha(values)!==r.hash||
       values[0]!==cash.actualDate||
       norm(values[1])!==norm(cash.company||cash.counterparty||'')||
       norm(values[2])!==norm(cash.contractNo||'')||
       norm(values[3])!==norm(cash.contractName||cash.description||'')||
       norm(values[4])!==norm(cash.ipcNo||cash.subCode||'')||
       values[6]!==0||
       values.slice(7,13).some((n,i)=>!eq(n,i+7===bucket?amount:0))){
      blockers.push('MANUAL_CASH_SOURCE_OR_AMOUNT_MISMATCH');
      continue;
    }
    seen.add(memberId);
    verifiedRows++;
    continue;
  }
  // A grouped Excel row may represent multiple distinct, already-paid
  // Payment documents. Certify each ORIGINAL member ID independently and
  // compare the exact aggregate amount, date and expense column. No manual
  // ID entry, positional Excel ID, or inferred document match is accepted.
  if(appendOnly&&project!=='FOXCONN'&&r?.sourceClass==='PAYMENT'&&
     Array.isArray(r.members)&&r.members.length>1){
    const members=r.members;
    const canonical=members.every(x=>typeof x==='string'&&
      /^expense:pay_[A-Za-z0-9_-]{1,180}$/.test(x))&&
      members.every((x,i)=>i===0||members[i-1]<x);
    if(!canonical||r.id!==project+':'+members.join('+')||
       members.some(x=>seen.has(x))||
       !Array.isArray(r.values)||r.values.length!==13||
       r.project!==project||r.month!==month){
      blockers.push('GROUPED_PAYMENT_ID_INVALID');continue;
    }
    const values=parseValues(r.values,{foxconn:false});
    if(sha(values)!==r.hash){
      blockers.push('SOURCE_HASH_CHANGED');continue;
    }
    const sourceDocs=members.map(x=>paid.get(x.slice('expense:pay_'.length)));
    if(sourceDocs.some(p=>!p)){
      blockers.push('GROUPED_PAYMENT_DOC_NOT_FOUND');continue;
    }
    const categories=sourceDocs.map(p=>category(p,project));
    if(categories.some(x=>x===null)||new Set(categories).size!==1){
      blockers.push('GROUPED_PAYMENT_CATEGORY_MISMATCH');continue;
    }
    const sums=sourceDocs.map(p=>p.processActualAmount!==undefined&&
      p.processActualAmount!==null&&p.processActualAmount!==''?
      money(p.processActualAmount):money(p.amount));
    const total=sums.reduce((n,x)=>n+x,0);
    const col=categories[0];
    if(sums.some(x=>!Number.isSafeInteger(x)||x<=0)||
       !Number.isSafeInteger(total)||total<=0||
       values[6]!==0||
       values.slice(7,14).some((n,i)=>!eq(n,i+7===col?total:0))||
       sourceDocs.some(p=>values[0]!==p.processPaymentDate||
         norm(values[1])!==norm(p.company)||
         norm(values[2])!==norm(p.contractNo)||
         (norm(p.ipcNo)&&!norm(values[4]).includes(norm(p.ipcNo))))){
      blockers.push('GROUPED_PAYMENT_DATE_AMOUNT_OR_CATEGORY_CHANGED');continue;
    }
    members.forEach(x=>seen.add(x));
    verifiedRows++;
    continue;
  }
  if(!r||r.project!==project||r.month!==month||
    typeof r.id!=='string'||r.id.length>500||
    !Array.isArray(r.members)||r.members.length!==1||
    typeof r.members[0]!=='string'||
    !/^expense:pay_[A-Za-z0-9_-]{1,180}$/.test(r.members[0])||
    r.id!==project+':'+r.members[0]||
    r.sourceClass!=='PAYMENT'||
    !Array.isArray(r.values)||r.values.length!==13||
    seen.has(r.members[0])){
   blockers.push('GROUPED_TAX_TRANSFER_OR_SOURCE_ID_UNSUPPORTED');continue;
  }
  seen.add(r.members[0]);
  const rawId=r.members[0].slice('expense:pay_'.length);
  const p=paid.get(rawId);
  if(!p){blockers.push('PAYMENT_SOURCE_DOC_NOT_FOUND');continue;}
  const values=parseValues(r.values,{foxconn:false});
  if(sha(values)!==r.hash){blockers.push('SOURCE_HASH_CHANGED');continue;}
  const target=category(p,project);
  if(target===null){blockers.push('PAYMENT_CATEGORY_UNVERIFIED');continue;}
  const actual=p.processActualAmount!==undefined&&p.processActualAmount!==null&&
    p.processActualAmount!==''?money(p.processActualAmount):money(p.amount);
  if(!Number.isSafeInteger(actual)||actual<=0||
    values[0]!==p.processPaymentDate||
    norm(values[1])!==norm(p.company)||norm(values[2])!==norm(p.contractNo)||
    (norm(p.ipcNo)&&!norm(values[4]).includes(norm(p.ipcNo)))||
    values[6]!==0||
    values.slice(7,14).some((n,i)=>!eq(n,i+7===target?actual:0))){
   blockers.push('PAYMENT_ROW_DATE_AMOUNT_OR_CATEGORY_CHANGED');
  }else verifiedRows++;
 }
 if(!appendOnly&&seen.size!==paid.size)
  blockers.push('PAID_MONTH_PROJECT_COUNT_OR_ALIAS_MISMATCH');
 if(project==='FOXCONN')blockers.push('FOXCONN_IMPORT_TAX_LAYOUT_REQUIRES_RULES');
 if(!records.length&&(appendOnly||paid.size))blockers.push('PAYMENT_ROWS_NOT_IN_EXPORT');
 const unique=[...new Set(blockers)].sort();
 return Object.freeze({
  kind:'INDEPENDENT_PROJECT_MONTH_SOURCE_CHECK_V1',project,month,revision,
  paymentRowsRead:payments.length,canonicalPaidRows:paid.size,
  sourceRowsChecked:records.length,
  sourceIdsMatched:appendOnly?verifiedRows===records.length:seen.size===paid.size,
  blockers:Object.freeze(unique),verified:unique.length===0&&records.length>0,
  // This narrow certification is ONLY about the known canonical paid-month
  // payment stream, not aliases/old cash outside the stored archive.
  legacyAndTransfersCertified:!appendOnly&&unique.length===0,
  fullPaymentAliasHistoryCertified:false,
  newlyAppendedOnly:appendOnly,
  sourceComplete:false,canWrite:false,googleWrites:0,
  sourceFingerprint:sha(records.map(r=>[r.id,r.values,r.hash,r.members]))
 });
}
module.exports={attestMonth,unpackSeed,category};
