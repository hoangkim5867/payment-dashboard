'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const html=fs.readFileSync(path.join(__dirname,'../site/cash-control.html'),'utf8');
const start=html.indexOf('<script type="module">'),end=html.indexOf('</script>',start);
const script=html.slice(start+'<script type="module">'.length,end);
const inside=(left,right)=>{
 const a=html.indexOf(left),b=html.indexOf(right,a+left.length);
 assert.ok(a>=0&&b>a,'missing '+left);return html.slice(a,b);
};
test('production Cash Control module parses, original payment functions remain',()=>{
 const run=spawnSync(process.execPath,['--input-type=module','--check'],{
  input:script,encoding:'utf8',timeout:30000
 });
 assert.equal(run.status,0,run.stderr);
 assert.match(html,/async function autoLoadPaymentActualMonth/);
 assert.match(html,/ccGoogleSyncDirectSync/);
});
test('one Admin button for read-only monthly audit, no extra writer',()=>{
 assert.equal((html.match(/id="ccSyncBatchAnalyze"/g)||[]).length,1);
 assert.match(html,/ccSyncReadOnlyMonthBox/);
 assert.match(html,/auditMonthBox.hidden=firebaseConfig.projectId!=='cscecmep-payment'\|\|!isCashControlOwner\(\)/);
 assert.match(html,/ccSyncAuditFreshMonthGoogleReadOnly\)/);
});
test('new source audit and Google scan use readonly OAuth and no writes',()=>{
 const source=inside('async function ccSyncLoadMonthlyExport(','async function ccSyncAuditFreshMonthGoogleReadOnly(){');
 const audit=inside('async function ccSyncAuditFreshMonthGoogleReadOnly(){','async function ccSyncCountOneProject(){');
 const sheetsToken=inside('function ccGoogleSheetsAccessToken(','async function ccGoogleSyncAuth(){');
 assert.match(source,/autoLoadPaymentActualMonth\(month,\{force:true\}\)/);
 assert.match(source,/buildMonthlyExportManifest\(/);
 assert.match(source,/paymentAutoActualRowsByMonth/);
 assert.match(source,/finally/);
 assert.match(audit,/isCashControlOwner\(\)/);
 assert.match(audit,/ccSyncLoadMonthlyExport\(month,uid,\{batch:true\}\)/);
 assert.match(audit,/\/api\/cash-sync-source-readonly/);
 assert.match(audit,/scanMonthlyGoogleReadOnly\(/);
 assert.match(audit,/spreadsheets\.readonly/);
 assert.match(audit,/CASH_SYNC_MONTH_READONLY_SUMMARY_V1/);
 assert.match(audit,/navigator\.locks\.request/);
 assert.match(sheetsToken,/initTokenClient/);
 assert.doesNotMatch(source+audit,/setDoc\(|addDoc\(|updateDoc\(|writeBatch\(|\/api\/cash-sync-multi-project|action:'commit'|method:'PUT'|method:'DELETE'/);
});
test('batch output contains no transaction payload, user private amounts or spreadsheet IDs',()=>{
 const audit=inside('async function ccSyncAuditFreshMonthGoogleReadOnly(){','async function ccSyncCountOneProject(){');
 const start=audit.indexOf('const shareSummary='),end=audit.indexOf('const copy=',start);
 assert.ok(start>0&&end>start);
 const summary=audit.slice(start,end);
 assert.doesNotMatch(summary,/spreadsheetId|historySheetId|\.values\b|\.source\b|\.hash\b|salaryRecords|accessToken|row\.id\b|googleToken/);
 assert.match(summary,/writeApproved:false/);
 assert.match(summary,/googleWrites:0/);
});
