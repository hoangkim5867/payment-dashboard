'use strict';
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const assert=require('assert');
const root=path.join(__dirname,'..','site');
const source=fs.readFileSync(path.join(root,'contract-master.html'),'utf8');
const marker='async function refreshEditedMEPGroupFromServer(group){';
const start=source.indexOf(marker);
assert(start>=0,'Missing targeted function');
let braces=0,found=false,end=-1;
for(let i=start;i<source.length;i++) {
  if(source[i]==='{') {braces++;found=true;}
  if(source[i]==='}') {braces--;if(found&&braces===0){end=i+1;break;}}
}
assert(end>start);
const fn=source.slice(start,end);
let assertions=0;
const mk=(id,overrides={})=>({id,project:'A',company:'V',paymentType:'other',contractNo:'MEP01',amount:100,processActualAmount:30,...overrides});
const originals=Array.from({length:47},(_,i)=>mk('p'+i));
const groups=originals.slice(0,42);
const remote=new Map(groups.map(p=>[p.id,mk(p.id,{company:'Changed',amount:p.amount,processActualAmount:p.processActualAmount})]));
remote.delete('p17'); // Server-side deletion must remove one group member
remote.set('p18',mk('p18',{company:'Should disappear',paymentType:'materials',contractId:'real-id',contractNo:'DUMMY',noMEPException:false}));
const requests=[];
let rebuilt=0,rendered=0,filterUpdated=0;
const sandbox={
  allMEPPayments:originals.map(x=>({...x})),
  mepPaymentsLoaded:false,
  paymentsRef:{collection:'payments'},
  documentId:()=>('__name__'),
  where:(field,op,values)=>({field,op,values}),
  query:(collection,constraint)=>({collection,constraint}),
  getDocs:async(q)=>{
    requests.push(q.constraint.values);
    return {forEach: f=>q.constraint.values.filter(x=>remote.has(x)).forEach(id=>f({id,data:()=>remote.get(id)}))};
  },
  isMEPHistoryPayment:(p)=> p.paymentType==='other' && p.contractId!=='real-id',
  buildMEPGroups:()=>rebuilt++,
  updateMEPProjectFilter:()=>filterUpdated++,
  renderMEPMaster:()=>rendered++,
  console:{info:()=>{}}
};
vm.createContext(sandbox);
vm.runInContext(fn,sandbox);
(async()=>{
 await sandbox.refreshEditedMEPGroupFromServer({items:groups});
 assert.deepStrictEqual(requests.map(x=>x.length),[20,20,2]); assertions++;
 assert.strictEqual(sandbox.allMEPPayments.length,45); assertions++;
 assert.strictEqual(sandbox.allMEPPayments.some(p=>p.id==='p17'),false); assertions++;
 assert.strictEqual(sandbox.allMEPPayments.some(p=>p.id==='p18'),false); assertions++;
 for(let i=42;i<47;i++) {assert.strictEqual(sandbox.allMEPPayments.find(p=>p.id==='p'+i)?.company,'V');assertions++;}
 assert.strictEqual(sandbox.allMEPPayments.find(p=>p.id==='p0')?.company,'Changed'); assertions++;
 assert.strictEqual(sandbox.allMEPPayments.find(p=>p.id==='p0')?.amount,100); assertions++;
 assert.strictEqual(sandbox.allMEPPayments.find(p=>p.id==='p0')?.processActualAmount,30); assertions++;
 assert.deepStrictEqual([rebuilt,filterUpdated,rendered],[1,1,1]);assertions++;
 assert.strictEqual(sandbox.mepPaymentsLoaded,true);assertions++;
 // Identical IDs in group are deduplicated before querying.
 requests.length=0;
 await sandbox.refreshEditedMEPGroupFromServer({items:[groups[0],groups[0]]});
 assert.strictEqual(requests.length,1);assertions++;
 assert.strictEqual(requests[0].length,1);assertions++;
 console.log('PASS',assertions,'MEP targeted-refresh assertions; reads exactly edited IDs, no whole-collection scan');
})().catch(e=>{console.error(e);process.exitCode=1});
