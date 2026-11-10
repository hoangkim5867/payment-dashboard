'use strict';
// Read-only audit of the *existing* synthetic ELYSIAN Google TEST data.
// All expected values are server-owned; never accept client-provided financial
// rows, trust only the pinned TEST spreadsheet, and never attempt to repair it.
const {planTestSync,verifyAfterWrite}=require('./cash-sync-multiproject-write-plan.cjs');
const project='ELYSIAN';
const moneyRow=(date,company,contractNo,content,ipc,amount)=>({
  date,company,contractNo,content,ipc,type:'支出',income:0,
  subcontract:amount,material:0,otherDirect:0,indirect:0,
  financial:0,otherPayable:0
});
const history=[{...moneyRow('2026-10-01','DEMO HISTORY','TEST-H001',
  'Lịch sử giả, không phải giao dịch thật','IPC00',100),rowId:2,balance:900}];
const first={...moneyRow('2026-11-02','DEMO VENDOR','TEST-LAB-001',
  'ELYSIAN giả trên PHU HUNG TEST COPY','IPC01',50),
  project,id:'MULTI-TEST-ELYSIAN-001'};
const december={...moneyRow('2026-12-02','DEMO VENDOR 12','TEST-LAB-002',
  'Giao dịch giả tháng 12, không phải thanh toán thật','IPC02',25),
  project,id:'MULTI-TEST-ELYSIAN-002'};
function buildExpected(source){
  return planTestSync({project,history,source,sourceComplete:true,
    destinationConfirmed:true,openingBalance:1000});
}
function auditExistingTest(snapshot){
  if(!snapshot||snapshot.project!==project||
    !Array.isArray(snapshot.mirror)||!Array.isArray(snapshot.view)||
    !Array.isArray(snapshot.formulas))
    throw Object.assign(new Error('Không đọc đủ sổ ELYSIAN TEST.'),{code:'TEST_AUDIT_SOURCE'});
  const counts={mirrorRows:snapshot.mirror.length,viewRows:Math.max(0,snapshot.view.length-1)};
  // These are the only two synthetic fixtures previously offered by TEST.
  // Old December data, if any, stays intact; do not reinterpret it as November.
  const cases=[
    {label:'ONLY_NOVEMBER',source:[first],closingBalance:850},
    {label:'NOVEMBER_AND_DECEMBER_DEMO',source:[first,december],closingBalance:825}
  ];
  if(!snapshot.mirror.length||!snapshot.view.length)
    return {mode:'TEST_ONLY',project,readOnly:true,verified:false,
      reason:'TAB_INCOMPLETE',...counts,canWrite:false};
  for(const item of cases){
    const expected=buildExpected(item.source);
    try{
      const verified=verifyAfterWrite(expected,snapshot);
      if(verified.status==='FULL_READBACK_VERIFIED'&&
         verified.closingBalance===item.closingBalance){
        return {mode:'TEST_ONLY',project,readOnly:true,verified:true,
          fixture:item.label,closingBalance:verified.closingBalance,
          formulasVerified:true,mirrorVerified:true,...counts,canWrite:false};
      }
    }catch{/* another fixture may match; never auto-repair */}
  }
  return {mode:'TEST_ONLY',project,readOnly:true,verified:false,
    reason:'CONTENT_OR_FORMULA_MISMATCH',...counts,canWrite:false};
}
module.exports={auditExistingTest};
