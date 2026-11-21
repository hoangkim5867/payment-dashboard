'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {isDesignFee,presentationValues}=require('../server/cash-sync-design-fee.cjs');
const {category}=require('../server/cash-sync-project-source-attestation.cjs');
const {planMonth}=require('../server/cash-sync-multi-project-core.cjs');
const human=require('../server/cash-sync-human-ledger.cjs');
const pay=160503771;
const source=['2026-10-29','PROMEC','CSCECVN-S.E.A-PH-MEP-DC-001',
 'PHU HUNG 项目-施工深化设计服务合同','IPC003','设计费',
 0,0,0,0,0,0,pay];
test('设计费 is direct cost in all supported languages, unrelated payables stay put',()=>{
 for(const x of ['设计费','设计费用','設計費','PHU HUNG 项目-施工深化设计服务合同',
  'Phí thiết kế','Dịch vụ thiết kế','design fee','design services'])
   assert.equal(isDesignFee(x),true,x);
 for(const x of ['材料款','间接费','保函手续费','其他应付款','奖金'])
   assert.equal(isDesignFee(x),false,x);
 assert.equal(category({costType:'其他应付款',
   contractName:'PHU HUNG 项目-施工深化设计服务合同'},'PHU HUNG'),9);
 assert.equal(category({costType:'设计费'},'ELYSIAN'),9);
 assert.equal(category({costType:'分包款'},'PHU HUNG'),7);
});
test('presentation moves exactly PHU HUNG 160,503,771 from other payable to other direct',()=>{
 const corrected=presentationValues([...source,0]);
 assert.equal(corrected[9],pay);
 assert.equal(corrected[12],0);
 assert.equal(corrected[9]+corrected[12],pay);
 assert.equal(source[9],0);
 assert.equal(source[12],pay);
 assert.equal(presentationValues(['2026-10-29','','','保函费','','其他应付款',
    0,0,0,0,0,0,pay])[12],pay);
});
test('human report accepts both immutable original and corrected design display without changing balance',()=>{
 const historic=[...source,1000],original=structuredClone(historic);
 const plan=planMonth({project:'PHU HUNG',month:'2026-11',source:[],history:[historic]});
 const opening=plan.historicalOpening;
 const prefix=[['PHU HUNG项目现金流明细表'],['期间：2026-10 ~ 2026-10'],
   ['日期','','','','','','','','','','','','','余额'],[]];
 const oldRow=[...source.slice(0,13),1000];
 const old=[...prefix,oldRow,['合计','','','','','',0,0,0,0,0,0,pay,1000]];
 const formulas=[[],[],[],[],[human.rowFormula(0,false,opening)],['=N5']];
 assert.equal(human.verifyHumanView(old,formulas,plan,{project:'PHU HUNG'}),true);
 const display=structuredClone(old);
 display[4][9]=pay;display[4][12]=0;
 display[5][9]=pay;display[5][12]=0;
 assert.equal(human.verifyHumanView(display,formulas,plan,{project:'PHU HUNG'}),true);
 const generated=human.humanRows(plan,plan,old,{project:'PHU HUNG'});
 assert.equal(generated[4].values[9].userEnteredValue.numberValue,pay);
 assert.equal(generated[4].values[12].userEnteredValue.numberValue,0);
 assert.deepEqual(historic,original);
 const wrong=structuredClone(display);wrong[4][9]=pay+1;
 assert.throws(()=>human.verifyHumanView(wrong,formulas,plan,{project:'PHU HUNG'}),/phân loại/);
});
test('migrated old-view workbooks accept only exact hidden originals and machine mirror',()=>{
 for(const [project,historical] of [['OCEAN LINK','Ocean Link'],
   ['H14-3','H14-3'],['SSIS','SSIS'],['红鹤别墅1.1区','红鹤别墅']]){
   const meta={sheets:[
     {properties:{sheetId:42,title:historical,hidden:true}},
     {properties:{sheetId:10000,title:'DATA_CASHCONTROL',hidden:true}},
     {properties:{sheetId:10001,title:'CASHCONTROL_VIEW'}}
   ]};
   assert.deepEqual(human.requireHumanMetadata(meta,{project,historySheetId:42}),
      {mirrorId:10000,viewId:10001});
   meta.sheets[0].properties.hidden=false;
   assert.throws(()=>human.requireHumanMetadata(meta,{project,historySheetId:42}),/cấu trúc/);
 }
});

test('historical design fee erroneously in indirect is projected into direct, preserving original',()=>{
 for(const [label,amount] of [['设计费',231000000],['服务合同',209697660]]){
  const v=['2025-01-23','PROMEC','-DC-001','图纸深化设计服务合同','IPC001',label,
   0,0,0,0,amount,0,0,400000000];
  const unchanged=structuredClone(v);
  const corrected=presentationValues(v);
  assert.equal(corrected[9],amount);
  assert.equal(corrected[10],0);
  assert.equal(corrected[12],0);
  assert.deepEqual(v,unchanged);
  assert.equal(corrected.slice(6,13).reduce((n,x)=>n+x,0),
   v.slice(6,13).reduce((n,x)=>n+x,0));
 }
});
