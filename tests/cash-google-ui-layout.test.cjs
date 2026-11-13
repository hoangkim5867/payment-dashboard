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
 assert.match(modal,/<details id="ccGoogleSyncProjectLinkCatalog" open hidden/);
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
