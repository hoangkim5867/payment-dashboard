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
 assert.match(modal,/Đồng bộ giao dịch Cash Control thật và nút chạy chung 35 dự án vẫn khóa/);
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

test('35-project batch readiness button is primary, Admin-only, and read-only',()=>{
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
 assert.match(html,/btn\.disabled=true;\s*btn\.textContent='Chưa có nguồn Payment thật trên TEST'/);
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
