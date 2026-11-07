'use strict';
/*
 * Financial export kernel, COPIED VERBATIM from current site/cash-control.html.
 * DO NOT EDIT THIS FUNCTION INDEPENDENTLY.
 * tests/cash-sync-export-kernel.test.cjs checks exact-byte parity to the
 * browser function. Compilation is in a Node VM with only trusted, provided
 * finance helpers. The kernel itself has NO Firebase or Google access.
 */
const vm=require('node:vm');
const {hashValues,validRow}=require('./three-way.cjs');
const EXPORT_SOURCE="function legacyCashExportRows(month,project){\n    const rows=[];\n\n    allExpenses().forEach(x=>{\n        if(x.isAllocation||x.direction==='adjustment')return;\n        if(x.status!=='paid'||!x.actualDate)return;\n        if(monthOf(x.actualDate)!==month)return;\n        if(x.project!==project)return;\n\n        const amount=Math.abs(Number(x.actualAmount||x.amount||0));\n        const bucket=excelProjectCostBucket(x);\n\n        rows.push({\n            date:x.actualDate,\n            company:excelCashCompany(x),\n            contractNo:x.contractNo||'',\n            content:excelCashContent(x),\n            ipc:excelCashIpc(x),\n            type:excelCashType(x),\n            income:x.direction==='in'?amount:0,\n            subcontract:x.direction==='out'&&bucket==='subcontract'?amount:0,\n            material:x.direction==='out'&&bucket==='material'?amount:0,\n            otherDirect:x.direction==='out'&&(bucket==='labor'||bucket==='otherDirect'||bucket==='taxDeposit')?amount:0,\n            indirect:x.direction==='out'&&bucket==='indirect'?amount:0,\n            financial:x.direction==='out'&&bucket==='financial'?amount:0,\n            otherPayable:x.direction==='out'&&bucket==='other'?amount:0,\n            sortText:x.description||'',\n            _taxQuarter:x.direction==='out'?excelTaxQuarterCode(x):'',\n            _taxDirection:x.direction,\n            _syncIds:x.id?['expense:'+String(x.id)]:[]\n        });\n    });\n\n    /* Old workbook treats internal transfers as signed 收入:\n       received = positive, sent = negative. */\n    allTransfers().forEach(x=>{\n        if(x.status!=='paid'||!x.actualDate)return;\n        if(monthOf(x.actualDate)!==month)return;\n\n        const amount=Math.abs(Number(x.actualAmount||x.amount||0));\n\n        if(x.fromProject===project){\n            rows.push({\n                date:x.actualDate,\n                company:excelInternalCounterpartyLabel(window.cashExportLang||cashLang),\n                contractNo:'',\n                content:excelTransferContent(x,window.cashExportLang||cashLang),\n                ipc:'',\n                type:excelTransferTypeLabel(x,window.cashExportLang||cashLang,project),\n                income:-amount,\n                subcontract:0,material:0,otherDirect:0,indirect:0,financial:0,otherPayable:0,\n                sortText:x.description||'',_syncIds:x.id?['transfer:'+String(x.id)+':out']:[]\n            });\n        }\n\n        if(x.toProject===project){\n            rows.push({\n                date:x.actualDate,\n                company:excelInternalCounterpartyLabel(window.cashExportLang||cashLang),\n                contractNo:'',\n                content:excelTransferContent(x,window.cashExportLang||cashLang),\n                ipc:'',\n                type:excelTransferTypeLabel(x,window.cashExportLang||cashLang,project),\n                income:amount,\n                subcontract:0,material:0,otherDirect:0,indirect:0,financial:0,otherPayable:0,\n                sortText:x.description||'',_syncIds:x.id?['transfer:'+String(x.id)+':in']:[]\n            });\n        }\n    });\n\n    return excelGroupQuarterlyTaxRows(rows,\n        ['income','subcontract','material','otherDirect','indirect','financial','otherPayable'],\n        window.cashExportLang||cashLang).sort((a,b)=>{\n        const d=String(a.date).localeCompare(String(b.date));\n        if(d!==0)return d;\n        const ai=Number(a.income||0)!==0?0:1;\n        const bi=Number(b.income||0)!==0?0:1;\n        if(ai!==bi)return ai-bi;\n        return String(a.sortText).localeCompare(String(b.sortText));\n    });\n}";
const HELPERS=[
  'excelProjectCostBucket','excelCashCompany','excelCashContent',
  'excelCashIpc','excelCashType','excelTaxQuarterCode','excelTransferContent',
  'excelTransferTypeLabel','excelInternalCounterpartyLabel',
  'excelGroupQuarterlyTaxRows'
];
function compileKernel(helpers){
  if(!helpers||typeof helpers!=='object'||Array.isArray(helpers))
    throw Error('Verified Cash Control export helpers are missing.');
  for(const key of HELPERS){
    if(typeof helpers[key]!=='function')
      throw Error('Unverified cash export helper: '+key);
  }
  if(typeof helpers.monthOf!=='function')
    throw Error('Verified monthOf helper required.');
  const sandbox={
    ...Object.fromEntries(HELPERS.map(k=>[k,helpers[k]])),
    monthOf:helpers.monthOf,
    window:{cashExportLang:'zh'},
    cashLang:'zh'
  };
  const context=vm.createContext(sandbox,{codeGeneration:{strings:false,wasm:false}});
  const script=new vm.Script(EXPORT_SOURCE+'\n;legacyCashExportRows',
    {filename:'cash-control-exact-export-kernel.js'});
  const fn=script.runInContext(context,{timeout:1000});
  if(typeof fn!=='function')throw Error('Could not compile approved Cash Control exporter.');
  return ({month,project,expenses,transfers})=>{
    if(project!=='PHU HUNG'||!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)||
       month<'2026-10'||!Array.isArray(expenses)||!Array.isArray(transfers)||
       expenses.length>10000||transfers.length>10000)
      throw Error('Invalid bounded PHU HUNG export request.');
    // All classification and content helpers are the SAME ones from Cash
    // Control; no independent remapping or reinterpretation is permitted.
    context.allExpenses=()=>expenses;
    context.allTransfers=()=>transfers;
    let exported;
    try{exported=fn(month,project)}
    finally{delete context.allExpenses;delete context.allTransfers}
    if(!Array.isArray(exported)||exported.length>10000)
      throw Error('Cash Control financial export overflow.');
    const ids=new Set();
    const rows=exported.map(r=>{
      const parts=r._syncIds;
      if(!Array.isArray(parts)||!parts.length||
         parts.some(x=>typeof x!=='string'||!x||x.length>256))
        throw Error('Cash Control exported row without stable source IDs.');
      const id=r._taxQuarter
        ? 'tax:PHU HUNG:'+r.date+':'+r._taxQuarter+':'+(r._taxDirection||'out')
        : 'PHU HUNG:'+parts.slice().sort().join('+');
      if(ids.has(id))throw Error('Duplicate Cash Control exported source ID.');
      ids.add(id);
      const values=[
        r.date,r.company,r.contractNo,r.content,r.ipc,r.type,
        Number(r.income||0),Number(r.subcontract||0),Number(r.material||0),
        Number(r.otherDirect||0),Number(r.indirect||0),
        Number(r.financial||0),Number(r.otherPayable||0)
      ];
      return validRow({id,month,project:'PHU HUNG',values,hash:hashValues(values)});
    });
    return {project,month,rows,sourceComplete:false,authoritative:false,
      blocker:'Input expenses/transfers and helpers are not verified against full current Firestore sources.'};
  };
}
module.exports={EXPORT_SOURCE,HELPERS,compileKernel};
