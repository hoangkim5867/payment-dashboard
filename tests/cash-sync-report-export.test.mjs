import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareOneSheetReport,buildOneSheetXlsx} from '../site/assets/js/cash-sync-report-export.mjs';

function mockExcel(){
 const count={bookAppend:0};
 const utils={
  book_new:()=>({SheetNames:[],Sheets:{}}),
  aoa_to_sheet:rows=>{
   const out={};
   for(let i=0;i<rows.length;i++)for(let j=0;j<rows[i].length;j++){
    const v=rows[i][j];if(v===null||v===undefined)continue;
    const key=String.fromCharCode(65+j)+(i+1);
    out[key]={v,t:typeof v==='number'?'n':'s'};
   }return out;
  },
  encode_cell:({r,c})=>String.fromCharCode(65+c)+(r+1),
  book_append_sheet:(book,tab,name)=>{
   count.bookAppend++;book.SheetNames.push(name);book.Sheets[name]=tab;
  }
 };
 return {utils,count};
}
const sample=(project='ELYSIAN')=>{
 const n=project==='FOXCONN'?15:14;
 const fill=(row)=>[...row,...Array.from({length:Math.max(0,n-row.length)},()=>'')];
 return [
  fill([project+'项目现金流明细表']),
  fill(['期间：2026-10 ~ 2026-11']),
  fill(['日期','公司名称','合同编号','合同内容','IPC','类型','收入','支出']),
  fill(['','','','','','','','分包款']),
  fill(['2026-10-20','供应商','','越籍工资','','职工薪酬',0,0,0,0,1000,0,0,...(n===15?[0]:[]),10000]),
  fill(['2026-11-14','越籍员工工资','','2026年11月越籍员工工资','','职工薪酬',0,0,0,0,2000,0,0,...(n===15?[0]:[]),8000]),
  fill(['合计','','','','','',0,0,0,0,3000,0,0,...(n===15?[0]:[]),8000])
 ];
};
test('distributed Excel workbook contains one visible project tab and never technical tabs',()=>{
 const XL=mockExcel();
 const {workbook,sheetName,rows}=buildOneSheetXlsx({project:'ELYSIAN',values:sample(),XLSX:XL});
 assert.equal(rows,7);assert.deepEqual(workbook.SheetNames,['ELYSIAN']);
 assert.equal(XL.count.bookAppend,1);
 assert.ok(!workbook.SheetNames.some(x=>/HISTORY|CASHCONTROL/i.test(x)));
 assert.equal(workbook.Sheets[sheetName]['G5'],undefined,'zero-value cells are blank in export');
 assert.equal(workbook.Sheets[sheetName]['K5'].v,1000);
 assert.equal(workbook.Sheets[sheetName]['A7'].v,'合计');
});
test('FOXCONN import tax column uses 15-column source without exporting the mirror',()=>{
 const XL=mockExcel();const output=buildOneSheetXlsx({
  project:'FOXCONN',values:sample('FOXCONN'),XLSX:XL
 });
 assert.deepEqual(output.workbook.SheetNames,['FOXCONN']);
 assert.equal(output.workbook.Sheets.FOXCONN['O7'].v,8000);
});
test('rejects non-report Google tabs and incomplete totals',()=>{
 assert.throws(()=>prepareOneSheetReport({project:'ELYSIAN',values:[['DATA_CASHCONTROL']]}),/báo cáo|trống/i);
 const wrong=sample();wrong[0][0]='DATA_CASHCONTROL';
 assert.throws(()=>prepareOneSheetReport({project:'ELYSIAN',values:wrong}),/báo cáo/i);
 const cut=sample();cut.pop();
 assert.throws(()=>prepareOneSheetReport({project:'ELYSIAN',values:cut}),/合计/i);
});
