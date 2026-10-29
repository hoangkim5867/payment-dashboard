'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const imported=import(require('node:url').pathToFileURL(path.resolve(__dirname,'../../site/assets/js/payroll-bonus-tax.mjs')));
test('Bonus paid in October 2026 belongs to Q4 2026, PIT due January 2027',async()=>{
 const {bonusTaxQuarterFromPaymentDate,bonusTaxDueMonth}=await imported;
 assert.equal(bonusTaxQuarterFromPaymentDate('2026-10-27'),'2026-Q4');
 assert.equal(bonusTaxDueMonth('2026-Q4'),'2027-01');
 assert.equal(bonusTaxQuarterFromPaymentDate('2026-04-15'),'2026-Q2');
 assert.equal(bonusTaxDueMonth('2026-Q2'),'2026-07');
 assert.equal(bonusTaxQuarterFromPaymentDate(''),'');
 assert.equal(bonusTaxQuarterFromPaymentDate('2026-02-31'),'');
});
test('Linked bonus PIT remains a separate unpaid obligation when bonus was paid',async()=>{
 const {buildLinkedBonusTaxRecord}=await imported;
 const bonus={id:'bonus1',type:'bonus',bonusYear:'2024',project:'C17-2',staffGroup:'cn',amountVnd:500,actualDate:'2026-10-27',note:'2024 award'};
 const tax=buildLinkedBonusTaxRecord({bonus,amountVnd:125,id:'pit1',now:'2026-10-29'});
 assert.equal(tax.linkedBonusId,'bonus1');assert.equal(tax.type,'tax');
 assert.equal(tax.taxPeriod,'2026-Q4');assert.equal(tax.payrollMonth,'2026-10');
 assert.equal(tax.actualDate,'');assert.equal(tax.amountVnd,125);
 const update=buildLinkedBonusTaxRecord({bonus,amountVnd:130,existing:tax,now:'2026-10-29'});
 assert.equal(update.id,'pit1');
 await assert.rejects(async()=>buildLinkedBonusTaxRecord({bonus,amountVnd:160,existing:{...tax,actualDate:'2027-01-18'},now:'2027-01-19'}),/đã nộp/);
});
test('Cash Control edit, batch, table and exports retain explicit linked PIT and bonus year',()=>{
 const src=fs.readFileSync(path.resolve(__dirname,'../../site/cash-control.html'),'utf8');
 for(const q of ['id="pyBonusTaxAmount"','id="pyBonusTaxHelp"','findLinkedBonusTaxRecord','buildLinkedBonusTaxRecord({','record.bonusTaxRecordId=linkedTax.id','if(linkedTax){','syncSalaryCash(linkedTax)','bonusTaxQuarterFromPaymentDate(actualDate)','Năm thưởng '+String.fromCharCode(39)])assert.ok(src.includes(q),q);
 assert.match(src,/cashCloudState\.salaryRecords=arr/);
 assert.match(src,/x\.type==='bonus'&&findLinkedBonusTaxRecord\(x\)/);
});
