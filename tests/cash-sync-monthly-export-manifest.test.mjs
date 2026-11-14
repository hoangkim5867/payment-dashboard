import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildMonthlyExportManifest} from '../site/assets/js/cash-sync-monthly-export-manifest.mjs';
const base=(id,over={})=>({
 date:'2026-10-26',company:'Đối tác',contractNo:'LAB-1',content:'Nội dung',
 ipc:'IPC01',type:'支出',income:0,subcontract:0,material:10,otherDirect:0,
 indirect:0,financial:0,otherPayable:0,
 _syncIds:['expense:'+id],...over
});
const resolver=id=>{
 if(id.startsWith('expense:pay'))return 'PAYMENT';
 if(id.startsWith('expense:tax'))return 'PAYROLL';
 if(id.startsWith('expense:cash'))return 'CASH';
 return 'UNKNOWN';
};
test('all 35 projects, exactly 19 grouped FOXCONN October rows, historic PIT remains only one source row',()=>{
 const projects=['FOXCONN','ELYSIAN',...Array.from({length:33},(_,i)=>'P'+i)];
 const pay=Array.from({length:18},(_,i)=>base('pay'+i,{importTaxVat:0}));
 const pit=base('tax1',{_syncIds:['expense:tax1','expense:tax2'],
  _taxQuarter:'2026Q3',_taxDirection:'out',indirect:71141977,material:0,
  contractNo:'',ipc:'',importTaxVat:0});
 const rows=[...pay,pit];
 const out=buildMonthlyExportManifest({month:'2026-10',projects,
  links:{FOXCONN:true,ELYSIAN:true},paymentCacheProjects:['FOXCONN'],
  rowsByProject:{FOXCONN:rows},resolveKind:resolver,expectedCounts:{FOXCONN:19}});
 assert.equal(out.catalogProjects,35);
 assert.equal(out.activeProjects,1);
 assert.equal(out.groupedRows,19);
 assert.equal(out.sourcesInMemory,19);
 assert.equal(out.historyComparisonCandidates,1);
 const fox=out.groups.find(x=>x.project==='FOXCONN');
 assert.equal(fox.groupedExcelRows,19);
 assert.equal(fox.records.length,19);
 assert.equal(fox.records.filter(x=>x.id.startsWith('tax:FOXCONN:')).length,1);
 assert.equal(fox.records.at(-1).values[10],71141977);
 assert.equal(fox.records.at(-1).values[13],0);
 assert.equal(fox.records.at(-1).sourceClass,'PAYROLL');
 assert.equal(fox.records[0].values.length,14);
 assert.equal(fox.state,'HISTORY_COMPARISON_CANDIDATE');
 assert.equal(out.googleWrites,0);
 assert.equal(out.googleReads,0);
 assert.equal(out.firestoreReads,0);
 assert.equal(out.canWrite,false);
 assert.equal(out.sourceComplete,false);
});
test('both signed transfer legs remain in the export source exactly as Excel, with no invented expense',()=>{
 const amount=5700000000;
 const source=buildMonthlyExportManifest({month:'2026-10',projects:['FOXCONN','ELYSIAN'],
  paymentCacheProjects:['FOXCONN','ELYSIAN'],links:{FOXCONN:true,ELYSIAN:true},
  rowsByProject:{
   FOXCONN:[base('unused',{_syncIds:['transfer:loan:out'],company:'Nội bộ',contractNo:'',
     ipc:'',income:-amount,material:0,importTaxVat:0})],
   ELYSIAN:[base('unused',{_syncIds:['transfer:loan:in'],company:'Nội bộ',contractNo:'',
     ipc:'',income:amount,material:0})]
  },resolveKind:resolver});
 assert.equal(source.activeProjects,2);
 assert.equal(source.sourcesInMemory,2);
 const out=source.groups[0].records[0],inside=source.groups[1].records[0];
 assert.equal(out.sourceClass,'TRANSFER');
 assert.equal(inside.sourceClass,'TRANSFER');
 assert.equal(out.values[6],-amount);
 assert.equal(inside.values[6],amount);
 assert.equal(out.values.slice(7).reduce((s,v)=>s+v,0),0);
 assert.equal(source.canSync,false);
});
test('missing IDs, duplicated IDs, amount text, date mismatch and row count deviation are blockers',()=>{
 const source=buildMonthlyExportManifest({month:'2026-10',projects:['FOXCONN','ELYSIAN','SSIS'],
  links:{FOXCONN:true,ELYSIAN:true,SSIS:true},paymentCacheProjects:['FOXCONN','ELYSIAN','SSIS'],
  rowsByProject:{
    FOXCONN:[base('pay1',{importTaxVat:0}),base('pay1',{importTaxVat:0}),
      base('cash0',{income:'10',importTaxVat:0})],
    ELYSIAN:[base('pay2',{date:'2026-11-01'}),base('pay3',{_syncIds:[]})],
    SSIS:[base('cash1',{indirect:3})]
  },expectedCounts:{FOXCONN:19},resolveKind:resolver});
 assert.equal(source.historyComparisonCandidates,1);
 assert.equal(source.needsSourceReview,2);
 const fox=source.groups.find(x=>x.project==='FOXCONN');
 assert.deepEqual(fox.issues.map(x=>x.code),
  ['DUPLICATE_SOURCE_ID','INVALID_AMOUNT_OR_TAX','GROUPED_EXCEL_ROW_COUNT_CHANGED']);
 assert.equal(source.groups.find(x=>x.project==='ELYSIAN').issues.length,2);
 assert.equal(source.groups.find(x=>x.project==='SSIS').state,'HISTORY_COMPARISON_CANDIDATE');
});
test('no Payment cache, no Google link or unknown source kind never approves history comparison',()=>{
 const p=buildMonthlyExportManifest({month:'2026-11',projects:['A','B','C'],
  rowsByProject:{A:[base('cash1',{date:'2026-11-03'})],
    B:[base('cash2',{date:'2026-11-03'})],
    C:[base('unmapped',{date:'2026-11-03'})]},
  links:{B:true,C:true},paymentCacheProjects:['B','C'],
  resolveKind:resolver});
 assert.equal(p.groups[0].state,'PAYMENT_COVERAGE_UNKNOWN');
 assert.equal(p.groups[1].state,'HISTORY_COMPARISON_CANDIDATE');
 assert.equal(p.groups[2].state,'SOURCE_REVIEW_REQUIRED');
 assert.equal(p.canWrite,false);
 assert.equal(p.googleReads,0);
 assert.throws(()=>buildMonthlyExportManifest({month:'2026-09',projects:['A']}),/INVALID_MONTH/);
 assert.throws(()=>buildMonthlyExportManifest({month:'2026-11',projects:['A','A']}),/INVALID_OR_DUPLICATE_PROJECT/);
});
