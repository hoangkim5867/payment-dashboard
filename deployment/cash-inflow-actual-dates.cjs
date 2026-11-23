'use strict';

// Render existing per-IPC receipt dates; never infer from expected date,
// submission date, current date or Cash Control bank transaction.
function applyInflowActualDates(html) {
  const head='<th>Đã thu</th><th>Còn phải thu</th>';
  if(!html.includes(head))throw Error('Inflow table header changed');
  html=html.replace(head,'<th>Đã thu</th><th>Ngày thực thu</th><th>Còn phải thu</th>');
  const key='"Ngày dự kiến thu":{"vi":"Ngày dự kiến thu","zh":"预计收款日","en":"Expected receipt date"}';
  if(!html.includes(key))throw Error('Inflow translations changed');
  html=html.replace(key,key+',"Ngày thực thu":{"vi":"Ngày thực thu","zh":"实际收款日期","en":"Actual receipt date"},"Chưa ghi ngày":{"vi":"Chưa ghi ngày","zh":"未填写实际收款日期","en":"Receipt date missing"}');
  const start=html.indexOf('function renderInflows(){');
  const end=html.indexOf('\nfunction openInflow(',start);
  if(start<0||end<start)throw Error('Inflow rendering function changed');
  let part=html.slice(start,end);
  const oldCount='const receiptCount=normalizeInflowReceipts(x).filter(r=>r.date&&num(r.amount)>0).length;';
  const newCount=[
   'const receipts=normalizeInflowReceipts(x).filter(r=>r.date&&num(r.amount)>0);',
   '        const receiptCount=receipts.length;',
   '        const datesHtml=receiptCount?receipts.map(r=>',
   '          `<div class="cc-if-receipt-date">${esc(fmtDate(r.date))}`+',
   '          (receiptCount>1?`<small>${money(r.amount)}</small>`:\'\')+',
   '          `</div>`).join(\'\'):num(x.receivedAmount)>0?',
   '          `<span class="cc-if-date-missing">${esc(cashT(\'Chưa ghi ngày\'))}</span>`:\'—\';'
  ].join('\n');
  if(!part.includes(oldCount))throw Error('Inflow receipt count changed');
  part=part.replace(oldCount,newCount);
  const amount='<td class="money ${outstanding>0?\'neg\':\'\'}">${money(outstanding)}</td>';
  if(!part.includes(amount))throw Error('Inflow balance cell changed');
  part=part.replace(amount,'<td class="cc-if-actual-dates">${datesHtml}</td>'+amount);
  const empty='colspan="13"';
  if(!part.includes(empty))throw Error('Inflow empty row span changed');
  part=part.replace(empty,'colspan="14"');
  html=html.slice(0,start)+part+html.slice(end);
  if(!html.includes('</head>'))throw Error('Missing document head');
  html=html.replace('</head>', '<style id="cc-inflow-actual-dates">\n'+
    '#inflowsView .cc-if-actual-dates{min-width:128px;vertical-align:top;white-space:nowrap}\n'+
    '#inflowsView .cc-if-receipt-date{margin:0 0 3px;font-variant-numeric:tabular-nums}\n'+
    '#inflowsView .cc-if-receipt-date small{display:block;color:#53647b;font-size:11px}\n'+
    '#inflowsView .cc-if-date-missing{color:#9a4b13;font-size:11px;white-space:normal}\n'+
    '</style></head>');
  return html;
}
module.exports={applyInflowActualDates};
