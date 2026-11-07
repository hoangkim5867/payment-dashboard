'use strict';
// Production-owner, read-only audit. Never send a write request to Google Sheets.
// The original file ID lives only in a Vercel environment variable.
const {TEST_SPREADSHEET_ID,readConfig,verifyFirebaseAdminToken}=
  require('../server/cash-sync-guard.cjs');
const {compareOriginalWithTest,auditKnownPayrollCorrection}=require('../server/cash-sync-original-audit.cjs');

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST')return res.status(405).json({error:'Only POST is supported.'});
  const host=String(req.headers.host||''),origin=String(req.headers.origin||'');
  if(!host||origin!=='https://'+host)
    return res.status(403).json({error:'Cross-origin request rejected.'});
  try{
    if(process.env.VERCEL_ENV!=='production')
      return res.status(403).json({error:'Only production Admin may audit the original.'});
    const config=readConfig(process.env);
    await verifyFirebaseAdminToken(String(req.headers['x-firebase-id-token']||''),config);
    const bearer=String(req.headers.authorization||'');
    if(!/^Bearer [A-Za-z0-9._~-]{20,4096}$/.test(bearer))
      return res.status(401).json({error:'Google OAuth token required.'});
    const originalId=String(process.env.CASH_SYNC_ORIGINAL_SPREADSHEET_ID||'');
    if(!/^[A-Za-z0-9_-]{30,100}$/.test(originalId)||originalId===TEST_SPREADSHEET_ID)
      return res.status(503).json({error:'Original spreadsheet is not configured safely.'});
    const headers={Authorization:bearer};
    async function google(id,path){
      const response=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+id+path,{
        method:'GET',headers,signal:AbortSignal.timeout(12000)
      });
      if(!response.ok)throw Object.assign(
        new Error('Cannot read spreadsheet with current Google account.'),{statusCode:502});
      return response.json();
    }
    const metaQuery='?fields=spreadsheetId,properties(title),sheets(properties(title))';
    const [originalInfo,testInfo]=await Promise.all([
      google(originalId,metaQuery),google(TEST_SPREADSHEET_ID,metaQuery)
    ]);
    if(originalInfo.spreadsheetId!==originalId||
       testInfo.spreadsheetId!==TEST_SPREADSHEET_ID||
       !/TEST/i.test(testInfo.properties?.title||'')||
       !originalInfo.sheets?.some(s=>s.properties?.title==='PHU HUNG')||
       !testInfo.sheets?.some(s=>s.properties?.title==='PHU HUNG'))
      return res.status(409).json({error:'Original/TEST file identity or PHU HUNG tab mismatch.'});
    const history='/values/'+encodeURIComponent("'PHU HUNG'!A1:N")+
      '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER';
    const [originalHistory,testHistory]=await Promise.all([
      google(originalId,history),google(TEST_SPREADSHEET_ID,history)
    ]);
    const report=compareOriginalWithTest(originalHistory.values||[],testHistory.values||[]);
    const correction=auditKnownPayrollCorrection(originalHistory.values||[],testHistory.values||[]);
    return res.status(200).json({
      readOnly:true,matched:report.matched,
      approvedKnownCorrection:correction.approved,
      readyForFurtherReview:report.matched||correction.approved,
      correction:correction.approved?correction:null,
      originalTitle:String(originalInfo.properties?.title||'').slice(0,120),
      originalRows:report.originalRows,testRows:report.testRows,
      originalClosing:report.originalClosing,testClosing:report.testClosing,
      closingDifference:report.closingDifference,
      mismatchCount:report.mismatchCount,
      firstMismatch:report.firstMismatch,lastMismatch:report.lastMismatch,
      balanceOnlyRows:report.balanceOnlyRows,
      transactionChangedRows:report.transactionChangedRows,
      onlyBalanceDifferences:report.onlyBalanceDifferences,
      byColumn:report.byColumn,
      details:report.details,mismatches:report.mismatches
    });
  }catch(error){
    if(error?.statusCode===403||error?.statusCode===503)
      return res.status(error.statusCode).json({error:error.message});
    if(error?.name==='TimeoutError'||error?.name==='AbortError')
      return res.status(504).json({error:'Google read-only audit timed out.'});
    return res.status(502).json({error:'Could not verify both PHU HUNG histories; no changes were made.'});
  }
};
