'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../site/payment.html'),'utf8');
const archiveHtml=fs.readFileSync(path.join(__dirname,'../../site/payment-archive.html'),'utf8');
const helperStart=html.indexOf('function isPaymentVisibleInWorkflowView(');
const helperEnd=html.indexOf('function getPaymentStatusContextRows(',helperStart);
assert(helperStart>0&&helperEnd>helperStart,'payment and workflow helper functions exist');
const helpers=html.slice(helperStart,helperEnd);
const paid={id:'paid',paymentMonth:'2026-10',processActualAmount:1000,processPaymentDate:'2026-10-29',
  processPlatformPlan:'done',processPaper:'done',processSettlement:'done',processPlatformPayment:'done'};
const paidIncomplete={...paid,id:'zhongjian',archived:true,processPaper:''};
const paidCompleteArchived={...paid,id:'archived',archiveState:'archived'};
const unpaid={id:'unpaid',paymentMonth:'2026-10',processPlatformPlan:''};
function getLogic(admin){
 const context={
  isAdmin:()=>admin,
  isPaymentArchived:p=>p?.archived===true||p?.archiveState==='archived',
  isPaymentPaid:p=>!!(p?.processPaymentDate&&p?.processActualAmount!==''&&p?.processActualAmount!=null),
  isPaymentCancelled:p=>p?.monthOutcome==='cancelled',
  isPaymentCarriedForward:p=>p?.monthOutcome==='carried_forward',
  isDone:v=>v==='done'||v===true
 };
 return vm.runInNewContext(helpers+'\n({isPaymentVisibleInWorkflowView,archiveWorkflowNeedsAttention,isExplicitWorkflowNotApplicable})',context);
}
test('Admin Paid includes all archived payments, including completed and incomplete',()=>{
 const f=getLogic(true);
 for(const payment of [paid,paidIncomplete,paidCompleteArchived]){
  assert.equal(f.isPaymentVisibleInWorkflowView(payment,'paid'),true);
 }
 assert.equal(f.isPaymentVisibleInWorkflowView(unpaid,'unpaid'),true);
 assert.equal(f.isPaymentVisibleInWorkflowView(paidCompleteArchived,'',true),true);
});
test('Staff everyday Paid and All hide archived payments',()=>{
 const f=getLogic(false);
 for(const payment of [paidIncomplete,paidCompleteArchived]){
  assert.equal(f.isPaymentVisibleInWorkflowView(payment,'paid'),false);
  assert.equal(f.isPaymentVisibleInWorkflowView(payment,''),false);
  assert.equal(f.isPaymentVisibleInWorkflowView(payment,'',true),false);
 }
 assert.equal(f.isPaymentVisibleInWorkflowView(paid,'paid'),true);
});
test('Needs Updates includes only PAID with incomplete Staff-owned workflow, even if archived',()=>{
 for(const admin of [false,true]){
  const f=getLogic(admin);
  assert.equal(f.isPaymentVisibleInWorkflowView(paidIncomplete,'attention'),true);
  assert.equal(f.isPaymentVisibleInWorkflowView(paidCompleteArchived,'attention'),false);
  assert.equal(f.isPaymentVisibleInWorkflowView(paid,'attention'),false);
  assert.equal(f.isPaymentVisibleInWorkflowView(unpaid,'attention'),false);
  assert.equal(f.isPaymentVisibleInWorkflowView({...paidIncomplete,monthOutcome:'cancelled'},'attention'),false);
  assert.equal(f.isPaymentVisibleInWorkflowView({...paidIncomplete,monthOutcome:'carried_forward'},'attention'),false);
 }
});
test('Needs Updates does not flag Admin-only approval/banking or explicit N/A',()=>{
 const f=getLogic(false);
 assert.equal(f.archiveWorkflowNeedsAttention({...paid,processApproval:'',processBanking:'',processPaymentNo:''}),false);
 assert.equal(f.archiveWorkflowNeedsAttention({...paid,processPaper:'N/A',processSettlement:'not_applicable'}),false);
 assert.equal(f.archiveWorkflowNeedsAttention({...paid,processPaper:''}),true);
});
test('UI has no Kho tab, financial fields remain Admin-only, original archive untouched',()=>{
 assert.doesNotMatch(html,/\{value:"attention", label:copy.attention, count:attentionRows.length\}/);
 assert.match(html,/id="paymentAttentionTools"/);
 assert.match(html,/id="paymentAttentionFilter"/);
 assert.match(html,/aria-pressed="false"/);
 assert.match(html,/previousStatusBeforeAttention/);
 assert.match(html,/button\.classList\.toggle\("active",active==="attention"\)/);
 assert.doesNotMatch(html,/value:"archive", label:copy.archive/);
 assert.doesNotMatch(html,/id="archiveWorkflowMessage"|archiveWorkflowPendingOnly|syncArchiveWorkflowNotice/);
 assert.match(html,/archiveWorkflowNeedsAttention\(item\)/);
 assert.match(html,/paid-progress-pending/);
 assert.match(html,/const workflowStepsEditable\s*=\s*canEditPaymentWorkflowSteps\(item\)/);
 assert.match(html,/workflowLocked \|\|\s*!isAdmin\(\)/);
 assert.match(html,/function paymentSourceForMonth\(month\)/);
 assert.match(html,/html\[data-theme\] \.payment-status-segments\{/);
 assert.match(html,/overflow:visible!important/);
 assert.doesNotMatch(html,/overflow-x:auto;overflow-y:hidden;scrollbar-width:thin/);
 assert.match(html,/\.payment-attention-tools\{/);
 assert.match(archiveHtml,/paymentArchiveDetails/);
 assert.doesNotMatch(archiveHtml,/archiveWorkflowPendingOnly|archiveWorkflowNotice|archiveWorkflowLink/);
 const helperScript=html.slice(helperStart,helperEnd);
 assert.doesNotMatch(helperScript,/getDocs\(|getDoc\(|onSnapshot\(|updateDoc\(|setDoc\(|deleteDoc\(/);
});
