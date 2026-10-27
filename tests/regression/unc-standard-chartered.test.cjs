'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
for(const page of ['payment.html','payment-mobile-renderer.html']){
 const src=fs.readFileSync(path.join(__dirname,'../../site',page),'utf8');
 const start=src.indexOf('const BULK_UNC_MONEY_TOKEN ='),end=src.indexOf('function bulkUncAmounts(',start);
 const ctx={normalize:x=>String(x).toLowerCase(),console};vm.createContext(ctx);vm.runInContext(src.slice(start,end),ctx);
 test(page+': Standard Chartered labelled fields and consistent date fallback',()=>{
  const text='STANDARD CHARTERED\nDEBIT ADVICE\nValue Date: 23 OCT 2026\nGeneration Date: 23 OCT 2026\nAmount: VND 1,615,383,530\nBeneficiary Name: EMULATOR COMPANY\nBank Reference: TESTREF123456\nAccount Number: 123456789';
  const out=ctx.extractBulkUncPdfInfo({text,layoutText:text});
  assert.equal(out.amount,1615383530);assert.equal(out.date,'2026-10-23');assert.equal(out.beneficiary,'EMULATOR COMPANY');assert.equal(out.bankReference,'TESTREF123456');
 });
 test(page+': conflicting visual date is not auto-posted',()=>{
  const prefix='STANDARD CHARTERED\nDEBIT ADVICE\nAmount: VND 1,000,000\nValue Date: ';
  const out=ctx.extractBulkUncPdfInfo({text:prefix+'23 OCT 2026',layoutText:prefix+'24 OCT 2026'});assert.equal(out.date,'');assert.equal(out.amount,1000000);
 });
 test(page+': legacy bank debit and remittance values remain distinct',()=>{
  const out=ctx.extractBulkUncInfo('HSBC\nDebit Amount: VND 1,010,000\nRemittance Amount: VND 1,000,000\nValue Date: 23/10/2026');
  assert.equal(out.debitAmount,1010000);assert.equal(out.remittanceAmount,1000000);assert.equal(out.amount,1000000);
 });
 test(page+': bilingual SC payee, value date and bank reference',()=>{
  const text='STANDARD CHARTERED\nDEBIT ADVICE\nBank Ref / Số GD: TEST123 / Q123456\nBeneficiary Party Info/Thông tin đơn vị hưởng TEST COMPANY\nSECOND LINE\nValue Date/Ngày giá trị 24/10/2026\nRemittance Amount/Số tiền chuyển VND 1,000,000.00';
  const out=ctx.extractBulkUncPdfInfo({text,layoutText:text});assert.equal(out.amount,1000000);assert.equal(out.date,'2026-10-24');assert.equal(out.beneficiary,'TEST COMPANY SECOND LINE');assert.equal(out.bankReference,'TEST123 / Q123456');
 });
 test(page+': combined advices cannot silently select the first payment',()=>{
  for(const bank of ['DEBIT ADVICE','Payment Advice'])assert.throws(()=>ctx.extractBulkUncPdfInfo({text:bank+'\nAmount: VND 1,000,000\n'+bank+'\nAmount: VND 2,000,000',layoutText:''}),/nhiều giấy/);
 });
 test(page+': one bank advice plus supporting pages remains accepted',()=>{
  const text='STANDARD CHARTERED\nDEBIT ADVICE\nAmount: VND 1,000,000\nValue Date: 24 OCT 2026\n\nSupporting invoice';assert.equal(ctx.extractBulkUncPdfInfo({text,layoutText:text}).amount,1000000);
 });

}
