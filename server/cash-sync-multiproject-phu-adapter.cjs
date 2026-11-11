'use strict';
// Reuse PHU HUNG's already-tested buildLedger for other project READ-ONLY
// plans, rather than maintaining a second balance/formula calculator.
// No Google API, Firestore API, or write authorization in this module.
const {plan, COLUMNS, record, token}=require('../site/assets/js/cash-sync-multiproject-planner.js');
const {buildLedger,viewGrid,HEAD_VIEW}=require('./cash-sync-live-core.cjs');
function block(message){throw Object.assign(new Error(message),{code:'LEDGER_PARITY'})}
function prepareProjectView(input){
  const prepared=plan(input);
  if(prepared.historicCount===0){
    // PHU HUNG buildLedger needs a historical anchor. New projects remain
    // blocked for the separate, explicitly approved opening-balance route.
    return {...prepared,renderer:'NEW_PROJECT_NEEDS_APPROVAL',canWrite:false};
  }
  const historical=(input.history||[]).map(entry=>{
    const data=record(entry);
    return {sheetRow:entry.rowId,values:[...COLUMNS.map(key=>data[key]),entry.balance]};
  });
  const mirror=prepared.rows.filter(row=>row.origin==='CASH_CONTROL').map(row=>({
    id:row.id,values:COLUMNS.map(key=>row.data[key]),status:'synced'
  }));
  const reused=buildLedger(historical,mirror);
  if(reused.rows.length!==prepared.rows.length||
      Math.abs(reused.opening-prepared.openingBalance)>0.000001||
      Math.abs(reused.closingBalance-prepared.closingBalance)>0.000001)
    block('Sổ dùng chung lệch số dư so với kiểm tra độc lập.');
  for(let i=0;i<reused.rows.length;i++){
    const a=reused.rows[i],b=prepared.rows[i];
    // Check both position and transaction identity; equal closing balances
    // alone cannot prove the rows/transactions are equivalent.
    if(a.values[0]!==b.data.date||
       token(Object.fromEntries(COLUMNS.map((key,j)=>[key,a.values[j]])))!==token(b.data)||
       Math.abs(a.balance-b.balance)>0.000001||a.formula!==b.formula)
      block('Hai cách tính không khớp tại hàng '+(i+2)+'.');
  }
  return Object.freeze({...prepared,renderer:'REUSED_PHU_HUNG_BUILD_LEDGER',
    rows:reused.rows,grid:viewGrid(reused),headers:HEAD_VIEW,canWrite:false,
    status:'OFFLINE_PLAN_ONLY'});
}
module.exports={prepareProjectView};
