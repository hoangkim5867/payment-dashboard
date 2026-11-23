'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {applyInflowActualDates}=require('../deployment/cash-inflow-actual-dates.cjs');
const input=fs.readFileSync(path.join(__dirname,'../site/cash-control.html'),'utf8');
const html=applyInflowActualDates(input);
function snippet(src,start,end){
 const i=src.indexOf(start),j=src.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i, 'missing functional source');
 return src.slice(i,j);
}
test('IPC header includes actual receipt date, correct empty colspan and translations',()=>{
 assert.ok(html.includes('<th>Đã thu</th><th>Ngày thực thu</th><th>Còn phải thu</th>'));
 assert.ok(html.includes('"Ngày thực thu":{"vi":"Ngày thực thu","zh":"实际收款日期","en":"Actual receipt date"}'));
 assert.ok(html.includes('colspan="14" class="mep-empty"'));
 assert.ok(html.includes('cc-if-actual-dates'));
 assert.equal((html.match(/id="inflowBody"/g)||[]).length,1);
});
test('actual dates come from receipts, split installments and legacy actualDate, never expected date',()=>{
 const data=[
   {id:'a',project:'OCEAN LINK',number:'IPC001',type:'ipc',
    expectedDate:'2026-12-31',receivedAmount:100,
    receipts:[{date:'2026-11-01',amount:100}]},
   {id:'b',project:'FOXCONN',number:'IPC002',type:'ipc',
    expectedDate:'2026-12-30',receivedAmount:100,
    receipts:[{date:'2026-11-07',amount:40},{date:'2026-11-21',amount:60}]},
   {id:'c',project:'PHU HUNG',number:'IPC003',type:'ipc',
    expectedDate:'2026-12-29',receivedAmount:120,actualDate:'2026-10-15'},
   {id:'d',project:'ELYSIAN',number:'IPC004',type:'ipc',
    expectedDate:'2026-12-28',receivedAmount:30,
    receipts:[{date:'',amount:30}]}
 ];
 const elements={inflowSearch:{value:''},inflowProject:{value:''},
   inflowType:{value:''},inflowStatus:{value:''},inflowBody:{}};
 for(const k of ['ifPlanned','ifApproved','ifReceived','ifOutstanding','ifRetention'])
   elements[k]={textContent:''};
 const ctx={
  cashCloudState:{inflowRecords:data},$:(id)=>elements[id],
  num:v=>Number(v||0),esc:v=>String(v),
  money:v=>Number(v||0).toLocaleString('en-US'),
  fmtDate:d=>{const [y,m,day]=String(d).split('-');return day+'/'+m+'/'+y},
  cashT:s=>s,mepId:()=> 'blank',
  effectiveInflowStatus:()=> 'received',inflowOutstanding:()=>0,
  daysUntil:()=>1,ageText:()=>'',statusChip:()=>'',INFLOW_TYPE_LABELS:{ipc:'IPC'},
  INFLOW_STATUS_LABELS:{received:'Đã thu đủ'},document:{querySelectorAll:()=>[]}
 };
 const normalize=snippet(input,'function normalizeInflowReceipts(record){','\nfunction inflowReceiptRowHtml(');
 const render=snippet(html,'function renderInflows(){','\nfunction openInflow(');
 vm.runInNewContext(normalize+'\n'+render+'\nrenderInflows();',ctx);
 const output=elements.inflowBody.innerHTML;
 assert.match(output,/01\/11\/2026/);
 assert.match(output,/07\/11\/2026/);
 assert.match(output,/21\/11\/2026/);
 assert.match(output,/15\/10\/2026/);
 assert.match(output,/<small>40<\/small>/);
 assert.match(output,/<small>60<\/small>/);
 assert.match(output,/Chưa ghi ngày/);
 assert.equal((output.match(/class="cc-if-actual-dates"/g)||[]).length,4);
 assert.equal((output.match(/<tr>/g)||[]).length,4);
});
