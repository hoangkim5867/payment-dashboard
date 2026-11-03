'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {computeIndexV1}=require('../../backend/payment-index-core.cjs');
const src=fs.readFileSync(path.join(__dirname,'../../site/admin-index-maintenance.html'),'utf8');
const script=src.split('<script type="module">')[1]?.split('</script>')[0]||'';
test('new Admin page script is valid JavaScript and never runs a Payment scan on page load',()=>{
 assert.ok(script);
 const from=script.indexOf('const firebaseConfig=');
 assert.ok(from>0);
 assert.doesNotThrow(()=>new Function(script.slice(from)));
 assert.match(script,/onAuthStateChanged\(auth,async user=>/);
 assert.match(script,/getDocFromServer\(doc\(db,"authUsers",user\.uid\)\)/);
 assert.match(script,/if\(String\(p\.role\|\|""\)\.toLowerCase\(\)!=="admin"/);
 assert.match(script,/addEventListener\("click",\(\)=>step\(mode,restart\)\)/);
 assert.doesNotMatch(script,/setInterval\(|window\.onload.*step|setTimeout\(.*step/);
});
test('bounded manual operation always takes snapshots from server and writes only derived fields',()=>{
 assert.match(script,/const MAX_READ=200,MAX_WRITE=80,PAGE=40,MAX_KEY_BYTES=1000/);
 assert.match(script,/const snapshot=await getDocsFromServer\(query\(collection\(db,"payments"\),\.\.\.constraints\)\)/);
 assert.match(script,/if\(state\.cursor\)constraints\.push\(startAfter\(state\.cursor\)\)/);
 assert.match(script,/const latest=await transaction\.get\(item\.ref\)/);
 assert.match(script,/transaction\.update\(item\.ref,now\.fields\)/);
 assert.match(script,/if\(writesThisRun>=MAX_WRITE\)break/);
 assert.match(script,/if\(auth\.currentUser\?\.uid!==uid\)throw/);
 assert.match(src,/Không tự chạy khi mở trang/);
 assert.match(src,/Chưa tự kích hoạt/);
 assert.match(script,/INDEX_MARKER=doc\(db,"systemConfig","paymentLookupV1"\)/);
 assert.match(script,/await finalIndexAuditForActivation\(uid\)/);
 assert.match(script,/activationVersion:2/);
 assert.match(script,/await setDoc\(INDEX_MARKER,\{ready:false/);
 assert.doesNotMatch(script,/updateDoc\(|writeBatch\(|deleteDoc\(|deleteField\(/);
 assert.doesNotMatch(src,/localStorage/);
});
test('Admin browser computeIndex matches backend including accent and alias normalization',()=>{
 const start=script.indexOf('function inspect(row){'),end=script.indexOf('async function step(',start);
 assert.ok(start>0&&end>start);
 const inspect=vm.runInNewContext(script.slice(start,end)+'\ninspect',{
  computeIndexV1,TextEncoder,Error,MAX_KEY_BYTES:1000
 });
 const input={project:'PHU HUNG',contractNo:'PH-MEP1',ipcNo:'IPC01',amount:123,uncDriveFileId:'abc'};
 const expected=computeIndexV1(input);
 assert.deepEqual(Object.fromEntries(Object.entries(inspect(input).fields)),expected);
 assert.equal(inspect(input).wrong,true);
 assert.equal(inspect({...input,...expected}).wrong,false);
 assert.throws(()=>inspect({...input,project:'x'.repeat(1500)}),/1.000 bytes/);
});
