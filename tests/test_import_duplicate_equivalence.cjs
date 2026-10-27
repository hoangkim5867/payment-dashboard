'use strict';
// Compare actual original duplicate-match functions with the cumulative edit,
// including cross-month preference and matching amount/paid/carry scoring.
// Uses fake payment data; never connects to Firebase.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert'),crypto=require('crypto'),cp=require('child_process');
const root=path.resolve(__dirname,'../site');
function readOld(){
  return fs.readFileSync(path.join(__dirname,'import_duplicate_baseline.cjs'),'utf8');
}
function extract(src,marker){
 const i=src.indexOf(marker);assert(i>=0,marker);
 let depth=0,started=false;
 for(let j=i;j<src.length;j++){
  if(src[j]==='{'){depth++;started=true;}
  else if(src[j]==='}'){
   depth--;if(started&&depth===0)return src.slice(i,j+1);
  }
 }
 throw Error('Unclosed function '+marker);
}
function ctx(source,isNew,rows){
 let count=0;
 const sandbox={
   getImportDuplicateCandidates:()=>{count++;return rows;},
   normalize:v=>String(v??'').trim().toLowerCase(),
   paymentContractKey:(a,b)=>String(a??'').trim().toLowerCase().replaceAll(' ','')+'|'+String(b??'').trim().toLowerCase().replaceAll(' ',''),
   isPaymentPaid:p=>!!p.paid,
   isPaymentCarriedForward:p=>!!p.carry,
 };
 vm.createContext(sandbox);
 const m1=extract(source,'function findSameMonthDuplicateImport(');
 const m2=extract(source,'function findCrossMonthDuplicateImport(');
 vm.runInContext(m1+'\n'+m2,sandbox);
 return {sandbox,getCount:()=>count};
}
const seed=Array.from({length:2500},(_,i)=>({
  id:'test-'+i,project: i%2?'EATON':'PHU HUNG',contractNo:`C-${i%40}`,
  ipcNo:`IPC${String(i%18).padStart(3,'0')}`,
  paymentMonth:`2026-${String(i%12+1).padStart(2,'0')}`,
  amount:i%3===0?100000:250000,paid:i%4===0,carry:i%8===0,
  processActualAmount:i%6===0?100000:250000,deleted:i%25===0
}));
let checks=0;
for(const name of ['payment.html','payment-mobile-renderer.html']){
 const src=fs.readFileSync(path.join(root,name),'utf8');
 const old=readOld();
 // Verify runtime duplicate behavior against the frozen Stage4 function code.
 assert(src.includes('findCrossMonthDuplicateImport(data,importCandidateRowsForPreview)'));
 assert(src.includes('findSameMonthDuplicateImport(data,importCandidateRowsForPreview)'));
 assert(src.includes('importCandidateRowsForPreview =\n                                getImportDuplicateCandidates();'));
 checks+=3;
 const news=ctx(src,true,seed);

 const originals=ctx(old,false,seed);
 for(let i=0;i<100;i++){
  const test={project:i%2?'EATON':'PHU HUNG',contractNo:`C-${i%40}`,ipcNo:`IPC${String(i%18).padStart(3,'0')}`,paymentMonth:`2026-${String((i+3)%12+1).padStart(2,'0')}`,amount:i%2?100000:250000};
  const oldSame=originals.sandbox.findSameMonthDuplicateImport(test);
  const newSame=news.sandbox.findSameMonthDuplicateImport(test,seed);
  assert.strictEqual(oldSame?.id,newSame?.id,`${name} same month #${i}`);
  const oldCross=originals.sandbox.findCrossMonthDuplicateImport(test);
  const newCross=news.sandbox.findCrossMonthDuplicateImport(test,seed);
  assert.strictEqual(oldCross?.id,newCross?.id,`${name} cross month #${i}`);
  checks+=2;
 }
}
console.log(`PASS ${checks} duplicate matching equivalence checks (offline)`);
