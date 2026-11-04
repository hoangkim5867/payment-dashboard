'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('V2 atomic writer rollout preserves all SDK methods and never switches on indexed queries',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../site/assets/js/firestore-payment.mjs'),'utf8');
 const names=['addDoc','setDoc','updateDoc','writeBatch','runTransaction'];
 const sdk=Object.fromEntries(names.map(name=>[name,()=>{}]));
 const wrapped=Object.fromEntries(names.map(name=>[name,()=>{}]));
 const computeIndexV2=()=>({});
 let received;
 const createPaymentWriters=(sdkArg,computeArg,options)=>{
   received={sdkArg,computeArg,options};
   return wrapped;
 };
 const header=source.slice(0,source.indexOf('/*')).replace(/^export \*[^\n]*\n/m,'').replace(/^import [^\n]*\n/gm,'').replace('export const','const');
 const context={sdk,computeIndexV2,createPaymentWriters};
 vm.createContext(context);
 vm.runInContext(header+'\nglobalThis.writers={'+names.join(',')+'};',context);
 assert.match(source,/PAYMENT_V2_WRITERS_ENABLED=true/);
 for(const name of names)assert.equal(context.writers[name],wrapped[name],name);
 assert.equal(received.sdkArg,sdk);
 assert.equal(received.computeArg,computeIndexV2);
 assert.deepEqual(Array.from(received.options.indexFields),['contractDigitsV2']);
 assert.deepEqual(Array.from(received.options.sourceFields),['contractNo']);
 for(const name of ['payment.html','payment-mobile-renderer.html']){
   const payment=fs.readFileSync(path.join(__dirname,'../../site',name),'utf8');
   assert.match(payment,/PAYMENT_INDEX_V2_QUERY_CODE_ENABLED = false/);
 }
});
