'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
test('production security hold preserves native SDK writer identities and overloads',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../site/assets/js/firestore-payment.mjs'),'utf8');
 const names=['addDoc','setDoc','updateDoc','writeBatch','runTransaction'];
 const sdk=Object.fromEntries(names.map(name=>[name,()=>{}]));
 const header=source.slice(0,source.indexOf('/*')).replace(/^export \*[^\n]*\n/m,'').replace(/^import [^\n]*\n/gm,'').replace('export const','const');
 const context={sdk};vm.createContext(context);
 vm.runInContext(header+'\nglobalThis.writers={'+names.join(',')+'};',context);
 for(const name of names)assert.equal(context.writers[name],sdk[name],name);
});
