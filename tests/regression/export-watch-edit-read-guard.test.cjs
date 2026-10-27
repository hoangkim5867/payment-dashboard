'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const src=fs.readFileSync(require('node:path').resolve(__dirname,'../../site/payment.html'),'utf8');
const helper=src.match(/function exportWatchLogCanChangeSnapshot\(action, changes = \[\]\)\{[\s\S]*?\n\}/);
assert.ok(helper,'Missing pure read guard');
const context=vm.createContext({});
vm.runInContext(helper[0],context);
const check=context.exportWatchLogCanChangeSnapshot;
test('No Export Watch history reload for process/status/metadata changes',()=>{
 for(const field of ['processPaper','processPlatformPlan','processApproval','processBanking','processActualAmount','processPaymentDate','remark'])
   assert.equal(check('EDIT',[{field}]),false,field);
 for(const action of ['EXPORT_EXCEL','RESTORE'])assert.equal(check(action,[]),false,action);
});
test('Amount edits and add/delete/cancel still refresh Export Watch',()=>{
 assert.equal(check('EDIT',[{field:'amount'}]),true);
 assert.equal(check('EDIT',[{field:'remark'},{field:'amount'}]),true);
 for(const action of ['ADD','DELETE','CANCEL'])assert.equal(check(action,[]),true,action);
});
test('Activity log write is still present, only refresh is gated',()=>{
 assert.match(src,/await addDoc\(\s*activityLogsRef/);
 assert.match(src,/if\(exportWatchLogCanChangeSnapshot\(action,changes\)\)\{/);
});
