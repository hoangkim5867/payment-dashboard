'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const site=path.resolve(__dirname,'../../site');
test('V2 writer-only release always leaves V1 and V2 indexed Excel reads disabled',()=>{
 const gateway=fs.readFileSync(path.join(site,'assets/js/firestore-payment.mjs'),'utf8');
 assert.match(gateway,/PAYMENT_V2_WRITERS_ENABLED=true/);
 assert.match(gateway,/computeIndexV2/);
 assert.match(gateway,/indexFields:\['contractDigitsV2'\],sourceFields:\['contractNo'\]/);
 for(const page of ['payment.html','payment-mobile-renderer.html']){
  const html=fs.readFileSync(path.join(site,page),'utf8');
  assert.match(html,/PAYMENT_INDEX_V2_QUERY_CODE_ENABLED = false/);
  assert.match(html,/where\("contractDigitsV2","in",keys\.slice/);
 }
});
test('V2 writer-only release is not accompanied by an authorized marker toggle',()=>{
 const html=fs.readFileSync(path.join(site,'admin-index-v2-contract.html'),'utf8');
 assert.doesNotMatch(html,/activationEnable|activateIndexedExcel/);
});
