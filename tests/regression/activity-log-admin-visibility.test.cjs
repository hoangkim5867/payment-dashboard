'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.resolve(__dirname,'../../site',name),'utf8');
test('desktop Activity Log searches bounded pages for Staff and keeps Admin hidden',()=>{
 const s=read('payment.html');
 assert.match(s,/const ACTIVITY_LOG_PAGE_SIZE = 30/);
 assert.match(s,/const ACTIVITY_LOG_MAX_PAGES_PER_ACTION = 4/);
 const start=s.indexOf('async function renderActivityLog({reset=true}={}){');
 const end=s.indexOf('async function doFirebaseLogin()',start);
 const block=s.slice(start,end);
 assert.match(block,/for\(let attempt=0;attempt<ACTIVITY_LOG_MAX_PAGES_PER_ACTION;attempt\+\+\)/);
 assert.match(block,/\.filter\(item=>!isAdminActivityLog\(item\)\)/);
 assert.match(block,/if\(docs\.length\)cursor = docs\[docs\.length-1\]/);
 assert.match(block,/if\(displayed\.length \|\| !more\)break/);
 assert.match(block,/activityLogState\.hasMore = more/);
 assert.match(s,/Đã kiểm tra.*thao tác gần nhất/);
 assert.doesNotMatch(s,/activityLogIncludeAdminBtn|showAdmin/);
});
test('mobile Activity Log no longer reads 500 documents on open and can continue by explicit click',()=>{
 const s=read('payment-mobile-renderer.html');
 assert.match(s,/MOBILE_ACTIVITY_LOG_PAGE_SIZE = 30/);
 assert.match(s,/MOBILE_ACTIVITY_LOG_MAX_PAGES_PER_ACTION = 4/);
 assert.match(s,/id="mobileActivityLogLoadMoreBtn"/);
 assert.match(s,/mobileActivityLogLoadMoreBtn\.addEventListener\("click"/);
 assert.match(s,/await renderActivityLog\(\{reset:false\}\)/);
 assert.match(s,/\.filter\(item=>!isAdminActivityLog\(item\)\)/);
 assert.match(s,/if\(newlyVisible\.length \|\| !more\)break/);
 assert.doesNotMatch(s,/mobileActivityLogIncludeAdminBtn|mobileActivityLogShowAdmin/);
});
test('both pages preserve append-only Activity Log writes and client-only Admin masking',()=>{
 for(const file of ['payment.html','payment-mobile-renderer.html']){
  const s=read(file);
  assert.match(s,/async function logActivity\(/);
  assert.match(s,/function isAdminActivityLog\(/);
  assert.match(s,/collection\(\s*db,\s*"activityLogs"/);
  const begin=s.indexOf('function isAdminActivityLog(');
  assert.match(s.slice(begin,begin+1200),/operatorRole/);
 }
});
