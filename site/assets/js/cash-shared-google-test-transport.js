'use strict';
// Google Sheets TEST-only transport. Caller provides an authenticated Google
// request and an externally held exclusive lock. No Firebase or OAuth here.
// NOT an authorization boundary: server must validate the lock + allowlisted ID.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.CashSharedGoogleTestTransport=api;
})(typeof window!=='undefined'?window:null,function(){
  const HEADER=['sourceId','project','date','sourceType','company','contractNo',
    'ipc','income','subcontract','material','otherDirect','indirect',
    'financial','otherPayable','importTaxVat'];
  const range=(tab,cells)=>encodeURIComponent("'"+tab.replace(/'/g,"''")+"'!"+cells);
  const fail=(code)=>{throw Error(code)};
  const validate=(target)=>{
    if(!target||target.isTestCopy!==true||!/^[-A-Za-z0-9_]{20,}$/.test(target.spreadsheetId)||
      typeof target.title!=='string'||!/TEST/i.test(target.title)||
      typeof target.project!=='string'||!target.project.trim()||
      typeof target.tab!=='string'||!/^DATA_CASHCONTROL_TEST_[A-Z0-9_]{1,80}$/.test(target.tab)||
      target.project.trim().toUpperCase()==='PHU HUNG')fail('TEST_TARGET_ONLY');
  };
  const validRow=r=>r&&typeof r.sourceId==='string'&&r.sourceId&&
    Array.isArray(r.amounts)&&(r.amounts.length===7||r.amounts.length===8)&&
    r.amounts.every(v=>typeof v==='number'&&Number.isFinite(v));
  const serialize=row=>[row.sourceId,row.project,row.date,row.sourceType,
    row.company,row.contractNo,row.ipc,...row.amounts,
    ...Array(8-row.amounts.length).fill('')];
  const deserialize=(row,columns)=>{
    if(!Array.isArray(row)||row.length<14)fail('INVALID_GOOGLE_TEST_ROW');
    const amounts=Array.from({length:columns},(_,i)=>row[7+i]??0);
    if(amounts.some(x=>typeof x!=='number'||!Number.isFinite(x)))
      fail('INVALID_GOOGLE_TEST_AMOUNT');
    const result={sourceId:String(row[0]??''),project:String(row[1]??''),
      date:String(row[2]??''),sourceType:String(row[3]??''),
      company:String(row[4]??''),contractNo:String(row[5]??''),
      ipc:String(row[6]??''),amounts};
    if(!validRow(result))fail('INVALID_GOOGLE_TEST_ROW');
    return result;
  };
  // Stable 32-bit snapshot digest, NOT a Google Sheets transaction or lock.
  const revision=rows=>{
    const data=JSON.stringify(rows);let hash=2166136261;
    for(let i=0;i<data.length;i++){hash^=data.charCodeAt(i);hash=Math.imul(hash,16777619)}
    return hash>>>0;
  };
  function create({target,request,exclusiveLock,openingBalance,history,amountColumns}={}){
    validate(target);
    if(typeof request!=='function'||!exclusiveLock||
      typeof exclusiveLock.assertHeld!=='function'||
      typeof openingBalance!=='number'||!Number.isFinite(openingBalance)||
      ![7,8].includes(amountColumns)||!Array.isArray(history)||
      history.some(x=>!validRow(x)||x.amounts.length!==amountColumns))
      fail('TEST_TRANSPORT_NOT_CONFIGURED');
    const base='/v4/spreadsheets/'+encodeURIComponent(target.spreadsheetId);
    const endpoint=(path,method='GET',body)=>request(base+path,{method,body});
    async function readSnapshot(){
      await exclusiveLock.assertHeld();
      const meta=await endpoint('?fields=spreadsheetId,properties(title),sheets(properties(title,hidden))');
      if(meta?.spreadsheetId!==target.spreadsheetId||
         meta.properties?.title!==target.title||
         !Array.isArray(meta.sheets))fail('TEST_FILE_IDENTITY_CHANGED');
      const tab=meta.sheets.find(s=>s.properties?.title===target.tab);
      if(!tab||tab.properties.hidden===true)fail('TEST_TAB_MISSING_OR_HIDDEN');
      const raw=await endpoint('/values/'+range(target.tab,'A1:O20000')+
        '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER');
      const rows=raw?.values||[];
      if(!Array.isArray(rows)||!rows.length||rows.length>20000||
         JSON.stringify(rows[0])!==JSON.stringify(HEADER))
        fail('TEST_HEADER_OR_ROWS_INVALID');
      const mirror=rows.slice(1).map(row=>deserialize(row,amountColumns));
      if(mirror.some(r=>r.project!==target.project))fail('TEST_CROSS_PROJECT_ROW');
      const snapshot={spreadsheetId:target.spreadsheetId,tab:target.tab,
        project:target.project,openingBalance,history,mirror};
      return {...snapshot,revision:revision(snapshot)};
    }
    async function appendRows(_target,entries,expectedRevision){
      validate(_target);
      if(_target.spreadsheetId!==target.spreadsheetId||_target.tab!==target.tab||
         _target.project!==target.project||!Number.isSafeInteger(expectedRevision)||
         !Array.isArray(entries)||!entries.length||entries.length>1000||
         entries.some(x=>!validRow(x)||x.project!==target.project||
           x.amounts.length!==amountColumns))
        fail('TEST_APPEND_INVALID');
      await exclusiveLock.assertHeld();
      const latest=await readSnapshot();
      if(latest.revision!==expectedRevision)fail('TEST_REVISION_CHANGED');
      const idSet=new Set(latest.mirror.map(r=>r.sourceId));
      if(entries.some(e=>idSet.has(e.sourceId)))fail('TEST_DUPLICATE_SOURCE_ID');
      await exclusiveLock.assertHeld();
      const path='/values/'+range(target.tab,'A:O')+
        ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS';
      return endpoint(path,'POST',{values:entries.map(serialize)});
    }
    return Object.freeze({readSnapshot,appendRows});
  }
  return Object.freeze({HEADER,create});
});
