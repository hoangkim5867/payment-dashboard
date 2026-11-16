'use strict';
/* Opt-in, Preview-only, S13-2-only destination gate. Never accepts original ledger.
 * This is independent of CASH_SYNC_MULTI_PRODUCTION_WRITES and its allowlist.
 */
const ORIGINAL='1s7-EZqTfS_6raZDxpK74m5gxDoAbRwBIJptCkG2lyUg';
const IDS=[
 'manual_salary_payroll_1790835443846_m4hd2',
 'manual_salary_payroll_1790835443852_ihc3a',
 'legacy_salary_672+legacy_salary_680'
];
const expected=[
 ['2026-10-02','中方员工工资','','2026年08月中方员工工资','','职工薪酬',0,0,0,0,81463753,0,0],
 ['2026-10-02','伙食费','','2026年08月伙食费','','职工薪酬',0,0,0,0,3859500,0,0],
 ['2026-10-20','','','2026年第3季度个人所得税','','职工薪酬',0,0,0,0,52923736,0,0]
];
const net=values=>values[6]-values.slice(7,14).reduce((a,b)=>a+b,0);
function canWriteS13Test(env,input){
 if(env.VERCEL_ENV!=='preview'||env.CASH_SYNC_S13_TEST_WRITES!=='YES'||
    env.CASH_SYNC_FIREBASE_PROJECT_ID!=='cscecmep-payment'||
    input.project!=='S13-2'||input.month!=='2026-10'||
    input.spreadsheetId===ORIGINAL||
    !/^[A-Za-z0-9_-]{20,100}$/.test(env.CASH_SYNC_S13_TEST_FILE_ID||'')||
    env.CASH_SYNC_S13_TEST_FILE_ID===ORIGINAL||
    input.spreadsheetId!==env.CASH_SYNC_S13_TEST_FILE_ID||
    !/^(0|[1-9]\d*)$/.test(env.CASH_SYNC_S13_TEST_HISTORY_GID||'')||
    input.historySheetId!==Number(env.CASH_SYNC_S13_TEST_HISTORY_GID)||
    input.expectedMonthClosing!==-72663856||
    !Array.isArray(input.source)||input.source.length!==3||
    input.openingBalance!=null)return false;
 const map=new Map(input.source.map(r=>[r?.id,r]));
 if(map.size!==3)return false;
 return IDS.every((id,i)=>{
  const record=map.get(id),values=record?.values;
  return record?.project==='S13-2'&&record?.month==='2026-10'&&
   Array.isArray(values)&&values.length===13&&
   values.every((x,j)=>x===expected[i][j])&&
   values.slice(6).every(x=>typeof x==='number'&&Number.isSafeInteger(x))&&
   net(values)===-expected[i][10];
 });
}
module.exports={canWriteS13Test,ORIGINAL,IDS};
