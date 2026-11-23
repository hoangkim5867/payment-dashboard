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
// Only enum-like diagnostic codes; never echo IDs, tokens or environment secrets.
// The endpoint has already authenticated the staging Admin before calling this.
function testGateChecks(env,input){
 const missing=[];
 if(env.VERCEL_ENV!=='preview')missing.push('NOT_PREVIEW');
 if(env.CASH_SYNC_S13_TEST_WRITES!=='YES')missing.push('TEST_FLAG_DISABLED');
 if(!/^[A-Za-z0-9_-]{20,100}$/.test(env.CASH_SYNC_S13_TEST_FILE_ID||'')||
    env.CASH_SYNC_S13_TEST_FILE_ID===ORIGINAL)missing.push('TEST_FILE_NOT_SET');
 else if(input.spreadsheetId!==env.CASH_SYNC_S13_TEST_FILE_ID)missing.push('TEST_FILE_MISMATCH');
 if(!/^(0|[1-9]\d*)$/.test(env.CASH_SYNC_S13_TEST_HISTORY_GID||''))
   missing.push('TEST_GID_NOT_SET');
 else if(input.historySheetId!==Number(env.CASH_SYNC_S13_TEST_HISTORY_GID))
   missing.push('TEST_GID_MISMATCH');
 if(input.project!=='S13-2'||input.month!=='2026-10'||
    input.spreadsheetId===ORIGINAL)missing.push('TEST_SCOPE_MISMATCH');
 if(input.expectedMonthClosing!==-72663856||input.openingBalance!=null)
   missing.push('TEST_BALANCE_INPUT_MISMATCH');
 if(!Array.isArray(input.source)||input.source.length!==3)missing.push('TEST_SOURCE_COUNT');
 else if(!canWriteS13Test({...env,VERCEL_ENV:'preview',CASH_SYNC_S13_TEST_WRITES:'YES',
   CASH_SYNC_S13_TEST_FILE_ID:input.spreadsheetId,
   CASH_SYNC_S13_TEST_HISTORY_GID:String(input.historySheetId)},input))
   missing.push('TEST_SOURCE_CONTENT_MISMATCH');
 return missing;
}
// Compare the live export with the prior TEST posting without treating text
// labels as financial fields. A label difference is reported separately.
function compareS13TestSource(rows){
 const byId=new Map(rows.map(row=>[row.id,row.values]));
 const identitiesMatch=rows.length===IDS.length&&byId.size===IDS.length&&
   IDS.every(id=>byId.has(id));
 const postingMatches=identitiesMatch&&IDS.every((id,i)=>{
  const actual=byId.get(id),reference=expected[i];
  return actual.length===reference.length&&actual[0]===reference[0]&&
   actual.slice(6).every((value,j)=>value===reference[j+6]);
 });
 const labelsMatch=postingMatches&&IDS.every((id,i)=>
  byId.get(id).slice(1,6).every((value,j)=>value===expected[i][j+1]));
 return {identitiesMatch,postingMatches,labelsMatch};
}
module.exports={canWriteS13Test,testGateChecks,compareS13TestSource,ORIGINAL,IDS};
