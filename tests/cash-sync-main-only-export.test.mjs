import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareMainOnlyExport,buildMainOnlyWorkbook} from
 '../site/assets/js/cash-sync-main-only-export.mjs';
const cols=['date','company','contractNo','content','ipc','type','income',
 'subcontract','material','otherDirect','indirect','financial','otherPayable',
 'importTaxVat','balance'];
const original=[
 cols,
 ['2026-10-02','ABC','LAB-001','工程款','IPC001','分包款',0,100,0,0,0,0,0,0,900],
 ['2026-10-20','','','Q3个人所得税','','职工薪酬',0,0,0,0,200,0,0,0,700]
];
const xlsx={
 utils:{
  aoa_to_sheet(rows){
   const ws={'!ref':`A1:N${rows.length}`};
   const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
   for(let r=0;r<rows.length;r++)for(let c=0;c<rows[r].length;c++){
    const v=rows[r][c];if(v!==''&&v!==null&&v!==undefined)
     ws[letters[c]+(r+1)]={t:typeof v==='number'?'n':'s',v};
   }return ws;
  },
  book_new:()=>({SheetNames:[],Sheets:{}}),
  book_append_sheet(wb,ws,name){
   wb.SheetNames.push(name);wb.Sheets[name]=ws;
  },
  encode_cell:({r,c})=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[c]+(r+1)
 }
};
test('format like PHU HUNG: grouped title, Chinese two-level headings, total and balance',()=>{
 const view=prepareMainOnlyExport({project:'ELYSIAN',values:original});
 assert.equal(view.transactionCount,2);
 assert.equal(view.closingBalance,700);
 assert.equal(view.rows[0][0],'ELYSIAN项目现金流明细表');
 assert.equal(view.rows[2][7],'支出');
 assert.equal(view.rows[2][13],'余额');
 assert.equal(view.rows[3][7],'分包款');
 assert.equal(view.rows.at(-1)[0],'合计');
 assert.equal(view.rows.at(-1)[7],100);
 assert.equal(view.rows.at(-1)[10],200);
 assert.equal(view.rows.at(-1)[13],700);
 assert.equal(view.colCount,14);
 const wb=buildMainOnlyWorkbook(xlsx,view);
 assert.deepEqual(wb.SheetNames,['ELYSIAN']);
 assert.equal(wb.Sheets.ELYSIAN['!merges'].length,11);
 assert.equal(wb.Sheets.ELYSIAN['!cols'].length,14);
 assert.equal(wb.Sheets.ELYSIAN.N7.v,700);
 assert.equal(wb.Sheets.ELYSIAN['!freeze'].ySplit,4);
 assert.ok(!JSON.stringify(wb).includes('sourceId'));
 assert.ok(!JSON.stringify(wb).includes('DATA_CASHCONTROL'));
 assert.ok(!JSON.stringify(wb).includes('HISTORIC_ROW_'));
 assert.ok(!JSON.stringify(wb).includes('CASHCONTROL_VIEW'));
 assert.equal(view.includesHiddenTabs,false);
});
test('FOXCONN keeps import tax + VAT as separate expenditure and O balance',()=>{
 const rows=[
  cols,
  ['2026-10-01','','','TAX','','',0,0,0,0,0,0,0,100,900]
 ];
 const v=prepareMainOnlyExport({project:'FOXCONN',values:rows});
 assert.equal(v.colCount,15);assert.equal(v.rows[3][13],'进口税+增值税');
 assert.equal(v.rows.at(-1)[13],100);
 assert.equal(v.rows.at(-1)[14],900);
 const wb=buildMainOnlyWorkbook(xlsx,v);
 assert.deepEqual(wb.SheetNames,['FOXCONN']);
 assert.equal(wb.Sheets.FOXCONN['!cols'].length,15);
});
test('PHU HUNG formatted existing main tab can be isolated as one-sheet export',()=>{
 const main=[
  ['PHU HUNG项目现金流明细表'],
  ['期间：2026-10'],
  ['日期','','','','','','','支出','','','','','','余额'],
  ['','','','','','','','分包款','材料款','其他直接费用','间接费','财务费用','其他应付款'],
  ['2026-10-02','','','payroll','','',0,0,0,0,80,0,0,920],
  ['合计','','','','','',0,0,0,0,80,0,0,920]
 ];
 const v=prepareMainOnlyExport({project:'PHU HUNG',values:main,sourceKind:'phu-hung'});
 assert.equal(v.transactionCount,1);
 assert.equal(v.closingBalance,920);
 const wb=buildMainOnlyWorkbook(xlsx,v);
 assert.deepEqual(wb.SheetNames,['PHU HUNG']);
 assert.equal(v.rows.at(-1)[10],80);
});
test('denies inconsistent money, changed view schema, metadata columns and non-approved source',()=>{
 assert.throws(()=>prepareMainOnlyExport({project:'ELYSIAN',
  values:[['changed'],...original.slice(1)]}),/MAIN_VIEW_HEADER/);
 const bad=structuredClone(original);bad[2][14]=701;
 assert.throws(()=>prepareMainOnlyExport({project:'ELYSIAN',values:bad}),/BALANCE_MISMATCH/);
 const extra=structuredClone(original);extra[1].push('secret sourceId');
 assert.throws(()=>prepareMainOnlyExport({project:'ELYSIAN',values:extra}),/MAIN_VIEW_UNEXPECTED_DATA/);
 assert.throws(()=>prepareMainOnlyExport({project:'FOXCONN',values:original.slice(0,1)}),/MAIN_VIEW_HEADER/);
 assert.throws(()=>prepareMainOnlyExport({project:'ELYSIAN',values:[],
  sourceKind:'phu-hung'}),/MAIN_EXPORT_WRONG_PHU_HUNG/);
});
