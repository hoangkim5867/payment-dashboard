'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const s=fs.readFileSync(path.join(__dirname,'../../site/payment.html'),'utf8');
const start=s.indexOf('function isPaymentWorkflowLocked(payment){');
const end=s.indexOf('function canAdminSelectPaidForArchive(payment){',start);
assert(start>=0 && end>start,'paid workflow permission functions exist');
const functions=s.slice(start,end);
const paid={id:'p1',paymentMonth:'2026-10',processActualAmount:100,processPaymentDate:'2026-10-29'};
function check(role,payment,{signedIn=true,month='2026-10'}={}){
 const ctx={
  currentAuthUser:signedIn?{uid:'test-user'}:null,
  currentUserProfile:signedIn?{role}:null,
  isAdmin:()=>role==='Admin',
  isStaff:()=>role==='Staff',
  CURRENT_MONTH:month,
  canStaffViewPaymentMonth:m=>m===month,
  isStaffTemporaryHistoryScope:m=>m!==month,
  isPaymentPaid:p=>!!(p.processPaymentDate && p.processActualAmount!=='' && p.processActualAmount!=null),
  isPaymentCancelled:p=>p?.monthOutcome==='cancelled',
  isPaymentCarriedForward:p=>p?.monthOutcome==='carried_forward'
 };
 return vm.runInNewContext(functions+'\n({canEditPaymentWorkflowSteps,isPaymentWorkflowLocked})',ctx);
}
test('Staff can finish steps on paid current-month payment; the payment record stays paid/locked',()=>{
 const p=check('Staff',paid);
 assert.equal(p.canEditPaymentWorkflowSteps(paid),true);
 assert.equal(p.isPaymentWorkflowLocked(paid),true);
 assert.equal(p.canEditPaymentWorkflowSteps({...paid,processActualAmount:''}),true);
});
test('Staff cannot edit previous-month, cancelled, carried, deleted or unauthenticated workflow',()=>{
 for(const payment of [
  {...paid,paymentMonth:'2026-09'},
  {...paid,monthOutcome:'cancelled'},
  {...paid,monthOutcome:'carried_forward'},
  {...paid,deleted:true}
 ])assert.equal(check('Staff',payment).canEditPaymentWorkflowSteps(payment),false);
 assert.equal(check('Staff',paid,{signedIn:false}).canEditPaymentWorkflowSteps(paid),false);
});
test('Admin still owns paid payment results and can update workflow; cancelled/carried remain locked',()=>{
 assert.equal(check('Admin',{...paid,paymentMonth:'2026-09'}).canEditPaymentWorkflowSteps({...paid,paymentMonth:'2026-09'}),true);
 assert.equal(check('Admin',{...paid,monthOutcome:'cancelled'}).canEditPaymentWorkflowSteps({...paid,monthOutcome:'cancelled'}),false);
});
test('Table separates workflow editing from financial result and main record editing',()=>{
 const table=s.slice(s.indexOf('const workflowStepsEditable ='),s.indexOf('rowsFragment.appendChild(',s.indexOf('const workflowStepsEditable =')));
 assert.ok((table.match(/!workflowStepsEditable/g)||[]).length>=6,'workflow fields use step permission');
 assert.ok((table.match(/workflowLocked \|\|\s*!isAdmin\(\)/g)||[]).length>=2,'amount and payment date retain original lock');
 assert.match(table,/workflowLocked[\s\S]*?payment-locked/,'paid action still locked');
 const handler=s.slice(s.indexOf('".inline-process-toggle"'),s.indexOf('".inline-process-amount"'));
 assert.ok((handler.match(/!canEditPaymentWorkflowSteps\(payment\)/g)||[]).length>=2,'click and text have write guards');
 assert.match(s,/if\(!canEditPaymentWorkflowSteps\(payment\)\)\{\s*if\(status==="done"\)/,'paper rendering protected');
});
