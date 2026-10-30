'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../site/payment.html'),'utf8');
const archiveHtml=fs.readFileSync(path.join(__dirname,'../../site/payment-archive.html'),'utf8');
const helperStart=html.indexOf('function isPaymentVisibleInWorkflowView(');
const helperEnd=html.indexOf('let archiveWorkflowPendingOnly=',helperStart);
assert(helperStart>0&&helperEnd>helperStart,'archive view helpers exist');
const helpers=html.slice(helperStart,helperEnd);
const data={
 pending:{id:'p',paymentMonth:'2026-10',project:'SSIS',processPlatformPlan:'done'},
 archived:{id:'a',paymentMonth:'2026-10',project:'中建厂房',archived:true,processActualAmount:123,processPaymentDate:'2026-10-29',uncDriveFileId:'unc-123',processPlatformPlan:'done',processPaper:'',processSettlement:'',processPlatformPayment:'done'},
 done:{id:'d',paymentMonth:'2026-10',archiveState:'archived',processPlatformPlan:'done',processPaper:'done',processSettlement:'done',processPlatformPayment:'done'}
};
function functions(isAdmin){
 const ctx={isAdmin:()=>isAdmin,isPaymentArchived:p=>p?.archived===true||p?.archiveState==='archived',isDone:v=>v==='done'||v===true};
 return vm.runInNewContext(helpers+'\n({isPaymentVisibleInWorkflowView,archiveWorkflowNeedsAttention,isExplicitWorkflowNotApplicable})',ctx);
}
test('Archive tab includes archived only and regular tab excludes archived',()=>{
 for(const admin of [false,true]){
  const f=functions(admin);
  assert.equal(f.isPaymentVisibleInWorkflowView(data.archived,'unpaid'),false);
  assert.equal(f.isPaymentVisibleInWorkflowView(data.archived,'paid'),false);
  assert.equal(f.isPaymentVisibleInWorkflowView(data.archived,'archive'),true);
  assert.equal(f.isPaymentVisibleInWorkflowView(data.pending,'archive'),false);
  assert.equal(f.isPaymentVisibleInWorkflowView(data.pending,'unpaid'),true);
 }
});
test('Ignoring the status preserves legacy Admin financial summary/export inclusion',()=>{
 assert.equal(functions(true).isPaymentVisibleInWorkflowView(data.archived,'',true),true);
 assert.equal(functions(false).isPaymentVisibleInWorkflowView(data.archived,'',true),false);
});
test('Incomplete filter is advisory, respects explicit N/A and ignores privileged fields',()=>{
 const f=functions(false);
 assert.equal(f.archiveWorkflowNeedsAttention(data.archived),true);
 assert.equal(f.archiveWorkflowNeedsAttention(data.done),false);
 const na={...data.done,processPaper:'N/A',processSettlement:'not_applicable',processApproval:'',processBanking:'',processPaymentNo:''};
 assert.equal(f.archiveWorkflowNeedsAttention(na),false);
 assert.equal(f.archiveWorkflowNeedsAttention({...data.done,processApproval:'',processBanking:''}),false);
});
test('New archive tab reuses monthly listener and never mutates archive documents',()=>{
 assert.match(html,/value:"archive", label:copy.archive, count:archiveRows.length/);
 assert.match(html,/paymentStatus === "archive"|paymentStatus === "archive"|paymentStatus==="archive"/);
 assert.match(html,/function syncArchiveWorkflowNotice\(/);
 assert.match(html,/const workflowStepsEditable\s*=\s*canEditPaymentWorkflowSteps\(item\)/);
 assert.match(html,/workflowLocked \|\|\s*!isAdmin\(\)/);
 assert.match(html,/function paymentSourceForMonth\(month\)/);
 const source=html.slice(html.indexOf('function isPaymentVisibleInWorkflowView'),html.indexOf('function getPaymentStatusContextRows'));
 assert.doesNotMatch(source,/getDocs\(|getDoc\(|onSnapshot\(|updateDoc\(|setDoc\(|deleteDoc\(/);
 assert.match(archiveHtml,/paymentArchiveDetails/);
 assert.doesNotMatch(archiveHtml,/archiveWorkflowPendingOnly|archiveWorkflowNotice|archiveWorkflowLink/);
});
