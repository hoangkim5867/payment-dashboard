'use strict';
/* Regression for the actual production Cash Control Excel cost bucket.
   Runs during the Vercel build; no Firebase or Google access. */
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const html=fs.readFileSync(path.resolve(__dirname,'../site/cash-control.html'),'utf8');
const extract=(start,end)=>{
 const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Cannot locate '+start);
 return html.slice(a,b);
};
const source=[
 extract('function excelLinkedPayrollRecord(x){','function excelPayrollLabel('),
 extract('function excelProjectCostBucket(txn){','function excelProjectDailyRows(')
].join('\n');
const ctx={cashCloudState:{salaryRecords:[{id:'b1',type:'bonus'}]}};
vm.createContext(ctx);vm.runInContext(source,ctx);
const bucket=ctx.excelProjectCostBucket;
assert.equal(bucket({source:'payroll',subCode:'THUONG',category:'Thưởng'}),'indirect');
assert.equal(bucket({linkedModule:'payroll',linkedRecordId:'b1',category:'Chi phí khác'}),'indirect');
assert.equal(bucket({source:'payroll',category:'奖金'}),'indirect');
assert.equal(bucket({source:'payroll',subCode:'L',category:'Lương'}),'indirect');
assert.equal(bucket({source:'manual',category:'其他应付款',description:'Đặt cọc khác'}),'other');
assert.equal(bucket({source:'payment',category:'材料款'}),'material');
assert.equal(bucket({source:'payment',category:'分包款'}),'subcontract');
console.log('PASS: Payroll bonus exports as indirect (间接费); unrelated costs unchanged.');
