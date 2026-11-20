'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../server/cash-sync-multi-project-core.cjs');
const human=require('../server/cash-sync-human-ledger.cjs');
const adapt=require('../server/cash-sync-multi-project-adapter.cjs');
const ORIGINAL=[
 ['2026-10-01','供应商','LAB-01','保函手续费','IPC001','间接费',0,0,0,0,100,0,0,-100],
 ['2026-10-20','供应商','LAB-02','10月材料款','IPC002','材料款',0,0,200,0,0,0,0,-300]
];
const v=(date,amount,company='Chi phí nhân sự')=>[date,'Lương Việt Nam','',`Lương Việt Nam · Tháng 11/2026`,'',company,0,0,0,0,amount,0,0,0];
const paid=v('2026-11-13',1234);
const future=v('2026-11-18',4321);
const record=(id,values)=>({id,project:'ELYSIAN',month:'2026-11',values,hash:core.sha(values),status:'synced'});
const previous=record('ELYSIAN:expense:already-posted',paid);
const previousPlan=core.planMonth({project:'ELYSIAN',month:'2026-11',
 source:[previous],history:ORIGINAL,mirror:[previous]});
const nextPlan=core.planMonth({project:'ELYSIAN',month:'2026-11',
 source:[previous,{...record('ELYSIAN:expense:new',future)}],
 history:ORIGINAL,mirror:[previous]});
function render(plan){
 const rows=[['ELYSIAN项目现金流明细表'],['期间：2026-10 ~ 2026-11'],
 ['日期','公司名称','合同编号','合同内容','IPC','类型','收入','支出','','','','','','余额'],
 ['','','','','','','','分包款','材料款','其他直接费用','间接费','财务费用','其他应付款']];
 const formulas=[[],[],['余额'],[]],opening=plan.historicalOpening;
 let sum=opening;
 for(let i=0;i<plan.viewRows.length;i++){
  const item=plan.viewRows[i],r=item.values,n=i+5;
  sum+=core.net(r);
  const fmt=human.rowFormula(i,false,opening);
  rows.push([...r.slice(0,13),sum]);
  formulas.push([fmt]);
 }
 const tot=['合计','','','','','',0,0,200,0,1334,0,0,sum];
 rows.push(tot);formulas.push(['=N'+(plan.viewRows.length+4)]);
 return {rows,formulas};
}
const meta={sheets:[
 {properties:{sheetId:41,title:'ELYSIAN_HISTORY_BACKUP',hidden:true}},
 {properties:{sheetId:10000,title:'DATA_CASHCONTROL',hidden:true}},
 {properties:{sheetId:10001,title:'ELYSIAN',hidden:false}}]};
test('new November payment appended to named Chinese main tab and hidden mirror, never historical backup',()=>{
 const old=render(previousPlan);
 human.verifyHumanView(old.rows,old.formulas,previousPlan,{project:'ELYSIAN'});
 const snapshot={meta,view:old.rows,formulas:old.formulas};
 const out=human.compileHumanBatch({plan:nextPlan,previousPlan,snapshot,historySheetId:41});
 assert.equal(out.human,true);
 assert.equal(out.requests.length,5);
 assert.equal(out.requests[3].repeatCell.cell.userEnteredFormat.textFormat.bold,false);
 assert.equal(out.requests[4].repeatCell.cell.userEnteredFormat.textFormat.bold,true);
 assert.deepEqual(out.requests.filter(x=>x.updateCells).map(x=>x.updateCells.range.sheetId),[10000,10001]);
 assert.ok(out.requests.every(x=>!x.updateCells||x.updateCells.range.sheetId!==41));
 const ledger=out.requests[1].updateCells.rows;
 assert.equal(ledger.length,nextPlan.viewRows.length+5);
 assert.equal(ledger[ledger.length-2].values[1].userEnteredValue.stringValue,'越籍员工工资');
 assert.equal(ledger[ledger.length-2].values[5].userEnteredValue.stringValue,'职工薪酬');
 assert.equal(ledger[ledger.length-2].values[13].userEnteredValue.formulaValue,'=N7+G8-SUM(H8:M8)');
 assert.equal(ledger.at(-1).values[0].userEnteredValue.stringValue,'合计');
 assert.equal(out.requests[0].updateCells.rows.length,3);
});
test('manual amount or total formula edits prevent posting',()=>{
 const changed=render(previousPlan);
 changed.rows[4][10]=2000;
 assert.throws(()=>human.verifyHumanView(changed.rows,changed.formulas,previousPlan,{project:'ELYSIAN'}),/Số tiền/);
 const invalid=render(previousPlan);invalid.formulas.at(-1)[0]='=1';
 assert.throws(()=>human.verifyHumanView(invalid.rows,invalid.formulas,previousPlan,{project:'ELYSIAN'}),/Dòng tổng/);
});
test('changed workbook layout or hidden-history gid rejects',()=>{
 const wrong=structuredClone(meta);wrong.sheets[0].properties.hidden=false;
 assert.throws(()=>human.requireHumanMetadata(wrong,{project:'ELYSIAN',historySheetId:41}),/cấu trúc/);
 const noMirror=structuredClone(meta);noMirror.sheets.splice(1,1);
 assert.throws(()=>human.requireHumanMetadata(noMirror,{project:'ELYSIAN',historySheetId:41}),/cấu trúc/);
});

test('empty new project sheet preserves positive/negative opening without fake transaction',()=>{
  for(const opening of [22805265,-341996474,0]){
    const project='289';
    const plan=core.planMonth({project,month:'2026-11',source:[],
      history:[],mirror:[],openingBalance:opening});
    const totalFormula=human.emptyTotalFormula(opening);
    const rows=[
      [project+'项目现金流明细表'],
      ['期间：2026-11 ~ 2026-11'],
      ['日期','公司名称','合同编号','合同内容','IPC','类型','收入','支出','','','','','','余额'],
      ['','','','','','','','分包款','材料款','其他直接费用','间接费','财务费用','其他应付款'],
      ['合计','','','','','',0,0,0,0,0,0,0,opening]
    ];
    const formulas=[[],[],[],[],[totalFormula]];
    assert.equal(human.verifyHumanView(rows,formulas,plan,{project}),true);
    const posted=[...Array(13).fill(0)];posted[0]='2026-11-18';
    posted[1]='公司';posted[3]='内部结算IPC1';posted[5]='收款';posted[6]=12;
    const nextPlan=core.planMonth({project,month:'2026-11',
      source:[{id:project+':expense:future',project,month:'2026-11',
        values:posted,hash:core.sha([...posted,0])}],
      history:[],mirror:[],openingBalance:opening});
    assert.equal(nextPlan.status,'CANDIDATES_ONLY');
    const meta={sheets:[
      {properties:{sheetId:0,title:project+'_HISTORY_BACKUP',hidden:true}},
      {properties:{sheetId:10000,title:'DATA_CASHCONTROL',hidden:true}},
      {properties:{sheetId:10001,title:project}}
    ]};
    const prepared=human.compileHumanBatch({plan:nextPlan,
      previousPlan:plan,snapshot:{meta,view:rows,formulas},
      historySheetId:0});
    assert.equal(prepared.requests.length,5);
    assert.ok(prepared.requests.every(req=>
      !req.updateCells||req.updateCells.range.sheetId!==0));
    assert.equal(prepared.requests[1].updateCells.rows.length,6);
  }
});

test('PHU HUNG accepts its verified original underscored backup, never another project alias',()=>{
 const ph={sheets:[
  {properties:{sheetId:1049774332,title:'PHU_HUNG_HISTORY_BACKUP',hidden:true}},
  {properties:{sheetId:1001,title:'DATA_CASHCONTROL',hidden:true}},
  {properties:{sheetId:1000,title:'PHU HUNG',hidden:false}}
 ]};
 assert.deepEqual(human.requireHumanMetadata(ph,{project:'PHU HUNG',
  historySheetId:1049774332}),{mirrorId:1001,viewId:1000});
 assert.throws(()=>human.requireHumanMetadata(ph,{project:'EATON',
  historySheetId:1049774332}),/cấu trúc/);
 const visibleOriginal=structuredClone(ph);
 visibleOriginal.sheets[0].properties.hidden=false;
 assert.throws(()=>human.requireHumanMetadata(visibleOriginal,{project:'PHU HUNG',
  historySheetId:1049774332}),/cấu trúc/);
});

test('PHU HUNG live Q5 zero-opening formula is valid only for first row with intact balances',()=>{
 const project='PHU HUNG',month='2026-11';
 const src=[{id:'PHU HUNG:expense:manual_1',project,month,
  values:['2026-11-16','越籍员工工资','','2026年10月越籍员工工资',
   '','职工薪酬',0,0,0,0,548412000,0,0]}];
 const plan=core.planMonth({project,month,source:src,history:[],openingBalance:0});
 const data=[['PHU HUNG项目现金流明细表'],['期间：2026-11 ~ 2026-11'],
  ['日期','','','','','','','','','','','','','余额'],
  [],[...plan.viewRows[0].values.slice(0,13),-548412000],
  ['合计','','','','','',0,0,0,0,548412000,0,0,-548412000]];
 const formulas=[[],[],[],[],['=$Q$5+G5-SUM(H5:M5)'],['=N5']];
 assert.equal(human.verifyHumanView(data,formulas,plan,{project}),true);
 assert.throws(()=>human.verifyHumanView(data,formulas,plan,{project:'EATON'}),/Công thức/);
 const tampered=structuredClone(data);tampered[4][13]=-548411999;
 assert.throws(()=>human.verifyHumanView(tampered,formulas,plan,{project}),/Số dư/);
 const arbitrary=structuredClone(formulas);arbitrary[4][0]='=$Q$6+G5-SUM(H5:M5)';
 assert.throws(()=>human.verifyHumanView(data,arbitrary,plan,{project}),/Công thức/);
});
