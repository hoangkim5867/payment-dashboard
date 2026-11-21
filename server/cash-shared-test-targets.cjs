'use strict';
// Separate from PHU HUNG's legacy allowlist. Only exact, server-configured
// non-production Google Sheets TEST copies are eligible for preview operations.
function deny(reason){const e=new Error(reason);e.statusCode=403;throw e}
function readTargets(env){
  if(env.VERCEL_ENV==='production')deny('MULTI_TEST_PRODUCTION_DISABLED');
  if(!/staging/.test(String(env.CASH_SYNC_FIREBASE_PROJECT_ID||''))||
     env.CASH_SYNC_FIREBASE_PROJECT_ID==='cscecmep-payment')
    deny('MULTI_TEST_STAGING_FIREBASE_REQUIRED');
  let items;
  try{items=JSON.parse(String(env.CASH_SYNC_MULTI_TEST_TARGETS_JSON||''))}
  catch{deny('MULTI_TEST_ALLOWLIST_MISSING')}
  if(!Array.isArray(items)||items.length<1||items.length>35)
    deny('MULTI_TEST_ALLOWLIST_INVALID');
  const allowed=new Map(),ids=new Set();
  for(const row of items){
    if(!row||typeof row!=='object'||Array.isArray(row)||
       Object.keys(row).sort().join(',')!=='project,spreadsheetId,tab,title')
      deny('MULTI_TEST_ALLOWLIST_SCHEMA');
    const {project,spreadsheetId,title,tab}=row;
    if(typeof project!=='string'||!project.trim()||project.toUpperCase()==='PHU HUNG'||
       typeof spreadsheetId!=='string'||!/^[A-Za-z0-9_-]{20,100}$/.test(spreadsheetId)||
       typeof title!=='string'||!/TEST/i.test(title)||title.length>200||
       typeof tab!=='string'||!/^DATA_CASHCONTROL_TEST_[A-Z0-9_]{1,80}$/.test(tab)||
       allowed.has(project)||ids.has(spreadsheetId))
      deny('MULTI_TEST_ALLOWLIST_ENTRY');
    allowed.set(project,Object.freeze({...row,isTestCopy:true}));
    ids.add(spreadsheetId);
  }
  return allowed;
}
function allowTarget(allowed,project,spreadsheetId,tab){
  const target=allowed?.get(project);
  if(!target||target.spreadsheetId!==spreadsheetId||target.tab!==tab)
    deny('MULTI_TEST_TARGET_NOT_ALLOWLISTED');
  return target;
}
module.exports={readTargets,allowTarget};
