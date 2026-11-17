'use strict';
/* UI-only regression guard. No browser, Google, Firebase, or real data accessed. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../site/cash-control.html'),'utf8');
const begin=html.indexOf('<div class="modal" id="ccGoogleSyncPreviewModal">');
const finish=html.indexOf('\n</div>\n\n',begin);
const modal=html.slice(begin,finish+7);
const count=s=>(modal.match(new RegExp(s,'g'))||[]).length;
const index=id=>modal.indexOf('id="'+id+'"');
test('one primary Google connection and a 35-project catalog before legacy PHU HUNG tools',()=>{
 assert.ok(begin>0&&finish>begin&&finish-begin<30000);
 for(const id of ['ccGoogleSyncAuthorize','ccGoogleSyncGoogleStatus',
   'ccGoogleSyncProjectLinkCatalog','ccGoogleSyncLegacyPilot',
   'ccGoogleSyncProjects','ccGoogleSyncDirectSync','ccGoogleSyncCommit']){
   assert.ok(index(id)>0,'missing existing button/input '+id);
   assert.equal(count('id="'+id+'"'),1,'duplicate button/input '+id);
 }
 assert.ok(index('ccGoogleSyncAuthorize')<index('ccGoogleSyncProjectLinkCatalog'));
 assert.ok(index('ccGoogleSyncProjectLinkCatalog')<index('ccGoogleSyncLegacyPilot'));
 assert.ok(index('ccGoogleSyncLegacyPilot')<index('ccGoogleSyncProjects'));
 assert.ok(index('ccGoogleSyncLegacyPilot')<index('ccGoogleSyncDirectSync'));
 assert.match(modal,/<details id="ccGoogleSyncProjectLinkCatalog" hidden open/);
 assert.match(modal,/<details id="ccGoogleSyncLegacyPilot"/);
 assert.match(modal,/Chỉ ghi dự án đã đối chiếu số dư và được máy chủ cấp phép/);
});
test('FOXCONN TEST is collapsed inside catalog with old actions retained',()=>{
 assert.ok(index('ccSyncFoxconnTestProbeArea')>index('ccGoogleSyncProjectLinkCatalog'));
 assert.ok(index('ccSyncFoxconnTestProbeArea')<index('ccGoogleSyncLegacyPilot'));
 assert.match(modal,/<details id="ccSyncFoxconnTestProbeArea"/);
 for(const id of ['ccSyncFoxconnTestProbe','ccSyncFoxconnTestHistoryAudit',
   'ccSyncFoxconnTestIdempotency','ccSyncFoxconnTestProbeStatus',
   'ccSyncFoxconnTestHistoryStatus','ccSyncFoxconnTestIdempotencyStatus']){
   assert.equal(count('id="'+id+'"'),1);
 }
 assert.ok(index('ccSyncFoxconnTestIdempotency')<index('ccGoogleSyncLegacyPilot'));
});
test('35-project mapping and JSON recovery remain usable with no duplicated IDs',()=>{
 for(const id of ['ccSyncProjectCatalogSearch','ccSyncProjectCatalogRefresh',
  'ccSyncProjectCatalogExport','ccSyncProjectCatalogImport',
  'ccSyncProjectCatalogImportFile','ccSyncProjectCatalogEntries',
  'ccSyncPaymentPreflight','ccSyncMultiProjectManual']){
   assert.equal(count('id="'+id+'"'),1,'missing '+id);
 }
 assert.match(modal,/<summary[^>]*>Sao lưu \/ khôi phục danh sách link \(JSON\)<\/summary>/);
 assert.ok(index('ccSyncProjectCatalogSearch')<index('ccSyncProjectCatalogEntries'));
 const ids=[...modal.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(new Set(ids).size,ids.length);
 const detailsOpen=count('<details\\b'),detailsClose=count('<\\/details>');
 assert.equal(detailsOpen,detailsClose);
 const sectionOpen=count('<section\\b'),sectionClose=count('<\\/section>');
 assert.equal(sectionOpen,sectionClose);
});

test('35-project readiness button is Admin-only and read-only',()=>{
 const page=html;
 for(const id of ['ccSyncBatchAnalyze','ccSyncBatchMonth','ccSyncBatchStatus',
   'ccSyncBatchResults'])assert.equal(count('id="'+id+'"'),1);
 assert.ok(index('ccSyncBatchAnalyze')>index('ccGoogleSyncProjectLinkCatalog'));
 assert.ok(index('ccSyncBatchAnalyze')<index('ccGoogleSyncLegacyPilot'));
 const start=page.indexOf('async function ccSyncBatchAnalyzeInMemory(){');
 const end=page.indexOf('function ccSyncProjectCatalogRender(){',start);
 assert.ok(start>0&&end>start);
 const body=page.slice(start,end);
 assert.match(body,/isCashControlOwner\(\)/);
 assert.match(body,/ccSyncProjectCatalogNames\(\)/);
 assert.match(body,/ccSyncFoxconnAuditRows\(month\)/);
 assert.match(body,/legacyCashExportRows\(month,project\)/);
 assert.match(body,/buildBatchReadiness\(/);
 assert.doesNotMatch(body,/getDocs\(|getCountFromServer\(|onSnapshot\(|setDoc\(|addDoc\(|ccGoogleSyncOriginalRequest\(|:batchUpdate/);
 assert.equal((body.match(/fetch\(/g)||[]).length,1);
 assert.match(body,/fetch\('\/api\/cash-sync-source-readonly'/);
 assert.match(body,/body:JSON\.stringify\(\{action:'metadata'\}\)/);
 assert.match(body,/evidence\.sourceComplete!==false/);
 assert.match(page,/import \{buildBatchReadiness\} from "\.\/assets\/js\/cash-sync-batch-readiness\.mjs"/);
});

test('isolated Preview cannot show false zero-transaction conclusion',()=>{
 const start=html.indexOf('async function ccSyncBatchAnalyzeInMemory(){');
 const end=html.indexOf('function ccSyncProjectCatalogRender(){',start);
 const code=html.slice(start,end);
 assert.match(code,/firebaseConfig\.projectId!=='cscecmep-payment'/);
 assert.match(code,/KHÔNG kết luận 0 giao dịch/);
 assert.match(code,/Không thể đếm phát sinh tháng/);
 assert.match(code,/paymentMonths\.size/);
 assert.match(code,/plan\.linkedProjects/);
 assert.match(code,/plan\.unlinkedProjects/);
 assert.match(html,/btn\.disabled=false;\s*btn\.textContent='Đối chiếu Google · chỉ đọc'/);
 assert.ok(code.indexOf("firebaseConfig.projectId!=='cscecmep-payment'")<
   code.indexOf('buildBatchReadiness('));
});

test('production source verification only compares metadata, not claims full Payment load',()=>{
 const start=html.indexOf('async function ccSyncBatchAnalyzeInMemory(){');
 const stop=html.indexOf('function ccSyncProjectCatalogRender(){',start);
 const code=html.slice(start,stop);
 assert.match(code,/await currentAuthUser\.getIdToken\(\)/);
 assert.match(code,/evidence\.revision!==localRevision/);
 assert.match(code,/evidence\.manualRecords!==/);
 assert.match(code,/evidence\.salaryRecords!==/);
 assert.match(code,/evidence\.projectMasters!==/);
 assert.match(code,/firebaseConfig\.projectId!=='cscecmep-payment'/);
 assert.match(code,/sourceMetadata/);
 assert.doesNotMatch(code,/sourceComplete\s*:\s*true|canSync\s*:\s*true/);
});

test('real-data TEST importer is Admin-only, read-only and keeps links and PHU HUNG controls',()=>{
 for(const id of ['ccSyncFoxconnTestSourceFile','ccSyncFoxconnTestRealCompareStatus',
 'ccSyncExportSourceForTest'])assert.equal(count('id="'+id+'"'),1);
 assert.ok(index('ccSyncFoxconnTestSourceFile')>index('ccSyncFoxconnTestProbeArea'));
 assert.ok(index('ccSyncExportSourceForTest')>index('ccSyncPaymentPreflight'));
 assert.ok(index('ccSyncExportSourceForTest')<index('ccGoogleSyncLegacyPilot'));
 const a=html.indexOf('async function ccSyncExportSourceForTest(){');
 const b=html.indexOf('async function ccSyncCompareImportedRealSource(){',a);
 const c=html.indexOf('async function ccSyncMultiProjectManual(){',b);
 assert.ok(a>0&&b>a&&c>b);
 const exporter=html.slice(a,b),importer=html.slice(b,c);
 assert.match(exporter,/firebaseConfig\.projectId!=='cscecmep-payment'/);
 assert.match(exporter,/isCashControlOwner\(\)/);
 assert.match(exporter,/loadProjectPayments\(project,\{force:true,quiet:true,refresh:false\}\)/);
 assert.match(exporter,/ccSyncFoxconnAuditRows\(month\)/);
 assert.match(exporter,/CASH_SYNC_REAL_SOURCE_REVIEW_V1/);
 assert.match(exporter,/sourceAuthenticated:false,sourceComplete:false/);
 assert.doesNotMatch(exporter,/setDoc\(|addDoc\(|writeBatch\(|updateDoc\(|fetch\(/);
 assert.match(importer,/firebaseConfig\.projectId!=='cash-control-staging'/);
 assert.match(importer,/api\/cash-shared-test-real-compare/);
 assert.match(importer,/result\.canWrite!==false/);
 assert.match(importer,/result\.googleWrites!==0/);
 assert.doesNotMatch(importer,/setDoc\(|addDoc\(|writeBatch\(|updateDoc\(|ccGoogleSyncOriginalRequest\(/);
});

test('one-click Google audit only uses readonly OAuth and never writes or loads Payment globally',()=>{
 const start=html.indexOf('async function ccSyncBatchAnalyzeInMemory(){');
 const stop=html.indexOf('function ccSyncProjectCatalogRender(){',start);
 const code=html.slice(start,stop);
 assert.match(html,/import \{scanMonthlyGoogleReadOnly\} from "\.\/assets\/js\/cash-sync-monthly-google-readonly\.mjs"/);
 assert.match(code,/scanMonthlyGoogleReadOnly\(/);
 assert.match(code,/https:\/\/www\.googleapis\.com\/auth\/spreadsheets\.readonly/);
 assert.match(code,/includeGrantedScopes:false/);
 assert.match(code,/manifest\.groups\.map\(/);
 assert.match(code,/ready\?\.needsReview/);
 assert.match(code,/googleByProject/);
 assert.doesNotMatch(code,/setDoc\(|addDoc\(|writeBatch\(|updateDoc\(|:batchUpdate|:append/);
});

test('the complete in-page module parses as modern JavaScript after bridge installation',()=>{
 const {spawnSync}=require('node:child_process');
 const begin=html.indexOf('<script type="module">');
 const end=html.indexOf('</script>',begin);
 assert.ok(begin>=0&&end>begin);
 const script=html.slice(begin+'<script type="module">'.length,end);
 const check=spawnSync(process.execPath,['--input-type=module','--check'],{
   input:script,encoding:'utf8',maxBuffer:3*1024*1024
 });
 assert.equal(check.status,0,check.stderr||check.stdout);
});
test('source bridge requires explicit Admin and one scoped actual month query, not 35 Payment project scans',()=>{
 const a=html.indexOf('async function ccSyncExportMonthSourceReview(){');
 const b=html.indexOf('async function ccSyncImportMonthSourceReview(){',a);
 const c=html.indexOf('async function ccSyncBatchAnalyzeInMemory(){',b);
 assert.ok(a>0&&b>a&&c>b);
 const load=html.indexOf('async function ccSyncLoadMonthlyExport(',0);
 assert.ok(load>0&&load<a);
 const exporter=html.slice(load,b), importer=html.slice(b,c);
 const scanStart=html.indexOf('async function ccSyncScanImportedMonthReview(){',a);
 assert.ok(scanStart>a&&scanStart<b);
 const scanner=html.slice(scanStart,b);
 assert.match(exporter,/firebaseConfig\.projectId!=='cscecmep-payment'/);
 assert.match(exporter,/isCashControlOwner\(\)/);
 assert.match(exporter,/autoLoadPaymentActualMonth\(month,\{force:true\}\)/);
 assert.match(exporter,/buildMonthlyExportManifest\(/);
 assert.match(exporter,/buildMonthReviewPackage\(/);
 assert.doesNotMatch(exporter,/loadProjectPayments\(|setDoc\(|addDoc\(|writeBatch\(|updateDoc\(/);
 assert.match(importer,/inspectMonthReviewPackage\(/);
 assert.match(scanner,/scanMonthlyGoogleReadOnly\(/);
 assert.doesNotMatch(importer,/ccSyncScanImportedMonthReview\(/);
 assert.match(html.slice(c),/await ccSyncScanImportedMonthReview\(/);
 assert.match(importer,/buildLegacyExcelReviewPackage\(/);
 assert.match(scanner,/spreadsheets\.readonly/);
 assert.match(importer,/isCashControlOwner\(\)/);
 assert.doesNotMatch(importer,/setDoc\(|addDoc\(|writeBatch\(|updateDoc\(/);
 for(const id of ['ccSyncMonthSourceBridge','ccSyncMonthSourceExport',
   'ccSyncMonthSourceImport','ccSyncMonthSourceFile','ccSyncMonthSourceStatus']){
   assert.equal(count('id="'+id+'"'),1,'missing or duplicated '+id);
 }
});

test('manual Admin batch uses the selected month, skips projects independently, and requires server and user approval',()=>{
 const start=html.indexOf('async function ccSyncMultiProjectManual(){');
 const end=html.indexOf('async function ccSyncLoadMonthlyExport(',start);
 const batch=html.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.ok(index('ccSyncMultiProjectManual')<index('ccSyncMonthSourceBridge'));
 assert.match(batch,/ccSyncLoadMonthlyExport\(month,uid,\{batch:true\}\)/);
 assert.match(batch,/navigator\.locks\.request/);
 assert.match(batch,/isCashControlOwner\(\)/);
 assert.match(batch,/expectedMonthClosing/);
 assert.match(batch,/runManualMonthlySync\(/);
 assert.match(batch,/preview:post,commit:post/);
 assert.match(batch,/confirmBatch:async review=>/);
 assert.match(batch,/requireFresh\(\)/);
 assert.match(batch,/group\.state==='HISTORY_COMPARISON_CANDIDATE'/);
 assert.match(batch,/sourceComplete/);
 assert.match(batch,/t\.previewOnly/);
 assert.match(batch,/Bỏ qua/);
 assert.match(html,/import \{runManualMonthlySync\} from "\.\/assets\/js\/cash-sync-monthly-manual-runner\.mjs"/);
 assert.doesNotMatch(batch,/loadProjectPayments\(/);
 assert.match(html,/syncBatch\.hidden=firebaseConfig\.projectId!=='cscecmep-payment'/);
});

test('fresh indexed-month production audit checks all active projects in Google with read-only scope and zero writes',()=>{
 const start=html.indexOf('async function ccSyncAuditFreshMonthGoogleReadOnly(){');
 const end=html.indexOf('async function ccSyncBatchAnalyzeInMemory(){',start);
 const block=html.slice(start,end);
 assert.ok(start>0&&end>start,'fresh-month audit function present');
 assert.equal(count('id="ccSyncBatchAnalyze"'),1,'reuse existing Admin-only read audit button');
 assert.match(block,/firebaseConfig\.projectId!=='cscecmep-payment'/);
 assert.match(block,/isCashControlOwner\(\)/);
 assert.match(block,/ccSyncLoadMonthlyExport\(month,uid,\{batch:true\}\)/);
 assert.match(block,/\/api\/cash-sync-source-readonly/);
 assert.match(block,/evidence\.revision!==revision/);
 assert.match(block,/navigator\.locks\.request\('cash-control-google-sync'/);
 assert.match(block,/scanMonthlyGoogleReadOnly\(/);
 assert.match(block,/https:\/\/www\.googleapis\.com\/auth\/spreadsheets\.readonly/);
 assert.match(block,/Number\(cashCloudState\.revision\|\|0\)===revision/);
 assert.match(block,/KHÔNG ghi Google\/Firebase/);
 assert.match(block,/CASH_SYNC_MONTH_READONLY_SUMMARY_V1/);
 assert.match(block,/sourceComplete:false,writeApproved:false/);
 assert.match(block,/Sao chép báo cáo đối chiếu/);
 assert.doesNotMatch(block,/shareSummary[\\s\\S]{0,4000}?(?:spreadsheetId:|sourceRecords:|sourceValues:)/);

 assert.doesNotMatch(block,/setDoc\(|addDoc\(|writeBatch\(|updateDoc\(|\/api\/cash-sync-multi-project|action:'commit'/);
 assert.match(html,/ccSyncAuditFreshMonthGoogleReadOnly\(\):ccSyncBatchAnalyzeInMemory\(\)/);
});

test('completed S13-2 replay shows already-synced and never offers a second write',()=>{
 const build=fs.readFileSync(path.join(__dirname,'../deployment/build-site.cjs'),'utf8');
 assert.match(build,/if\(preview\.summary\.changes===0\)/);
 assert.match(build,/preview\.summary\.generated!==261/);
 assert.match(build,/S13-2 tháng 10\/2026 · ĐÃ ĐỒNG BỘ/);
 assert.match(build,/if\(commitButton\)commitButton\.hidden=true/);
 assert.match(build,/0 Google writes, KHÔNG BẤM GHI LẠI/);
 assert.match(build,/preview\.summary\.changes!==3/);
});
test('next project ELYSIAN uses only the existing one-project readonly comparator',()=>{
 const build=fs.readFileSync(path.join(__dirname,'../deployment/build-site.cjs'),'utf8');
 const a=build.indexOf('const nextProjectSource=String.raw');
 const b=build.indexOf('text=text.replace(s13FunctionAnchor,',a);
 assert.ok(a>0&&b>a);
 const handoff=build.slice(a,b);
 assert.match(build,/id="ccSyncNextProjectReadOnly"/);
 assert.match(handoff,/const project="ELYSIAN"/);
 assert.match(handoff,/https:\/\/www\.googleapis\.com\/auth\/spreadsheets\.readonly/);
 assert.match(handoff,/includeGrantedScopes:false/);
 assert.match(handoff,/await ccSyncCompareProjectGoogleReadOnly\(\)/);
 assert.doesNotMatch(handoff,/writeBatch\(|setDoc\(|updateDoc\(|:batchUpdate|action:"commit"|action:'commit'/);
});

test('ELYSIAN one-project compare replaces misleading second planner totals without changing Google writes',()=>{
 const build=fs.readFileSync(path.join(__dirname,'../deployment/build-site.cjs'),'utf8');
 assert.match(build,/reviewElysianExceptions\(payload\.values,source,matched\)/);
 assert.match(build,/project!=='FOXCONN'&&project!=='ELYSIAN'/);
 assert.match(build,/14\/62 là bộ thuật toán khác/);
 assert.match(build,/Nhân sự: khác metadata, không yêu cầu HĐ\/IPC/);
 assert.match(build,/Hoàn vay FOXCONN: ứng viên đối ứng Google, chưa xác minh ID/);
 assert.match(build,/KHÔNG TỰ GHI \/ GHÉP TRÙNG/);
 assert.match(build,/Sổ gốc giữ nguyên; chưa cấp phép đồng bộ/);
});

test('unified 35-project batch uses existing one-click readonly scan, no misplaced Excel button',()=>{
 const build=fs.readFileSync(path.join(__dirname,'../deployment/build-site.cjs'),'utf8');
 assert.doesNotMatch(build,/id="ccSyncDownloadMainOnly"|async function ccSyncDownloadMainOnly/);
 assert.match(build,/buildBatchReleasePlan/);
 assert.ok(build.includes('cash-sync-batch-release.mjs'));
 assert.match(build,/batchRelease\\.readyToCommit!==0/);
 assert.match(build,/CHUẨN BỊ ĐỒNG BỘ CHUNG/);
 assert.match(build,/batchRelease:\\{schema:batchRelease\\.schema/);
});
