'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {buildSite,validateStagingConfig}=require('../../deployment/build-site.cjs');
const config={apiKey:'synthetic-staging-key',projectId:'payment-master-staging-test',authDomain:'payment-master-staging-test.firebaseapp.com',storageBucket:'payment-master-staging-test.firebasestorage.app',messagingSenderId:'123',appId:'1:123:web:test'};
test('preview rejects missing, production or mixed staging config',()=>{for(const c of [null,{...config,projectId:'cscecmep-payment'},{...config,authDomain:'cscecmep-payment.firebaseapp.com'},{...config,storageBucket:'cscecmep-payment.firebasestorage.app'}])assert.throws(()=>validateStagingConfig(c));});
test('staging includes TEST-only S13 page and preserves isolated configuration; site assets retained',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'payment-staging-build-')),out=path.join(dir,'site');const result=buildSite({source:path.resolve(__dirname,'../../site'),output:out,target:'staging',stagingConfig:config});assert.equal(result.configs,10);assert.equal(result.contractV2ReadyToActivate,false);for(const file of fs.readdirSync(out).filter(x=>x.endsWith('.html'))){const text=fs.readFileSync(path.join(out,file),'utf8');assert(!text.includes('cscecmep-payment.firebaseapp.com'));assert(!text.includes('projectId:"cscecmep-payment"'));}assert(fs.existsSync(path.join(out,'assets/js/firestore-payment.mjs')));for(const page of ['payment.html','payment-mobile-renderer.html'])assert.match(fs.readFileSync(path.join(out,page),'utf8'),/PAYMENT_INDEX_V2_QUERY_CODE_ENABLED = false/);for(const file of ['payment.html','payment-mobile-renderer.html','contract-master.html'])assert.match(fs.readFileSync(path.join(out,file),'utf8'),/INDEX_QUERY_CODE_ENABLED = false;/);});
test('production build preserves inherited source app configuration',()=>{const out=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'payment-production-build-')),'site');const built=buildSite({source:path.resolve(__dirname,'../../site'),output:out,target:'production'});assert.equal(built.configs,9);assert(!fs.existsSync(path.join(out,'s13-test-sync.html')));assert.equal(built.contractV2ReadyToActivate,true);const metadata=JSON.parse(fs.readFileSync(path.join(out,'release-environment.json'),'utf8'));assert.equal(metadata.contractV2ReadyToActivate,true);assert.equal(fs.readFileSync(path.join(out,'payment.html'),'utf8').replace('PAYMENT_INDEX_QUERY_CODE_ENABLED = false;','PAYMENT_INDEX_QUERY_CODE_ENABLED = true;'),require('../../deployment/payment-reminder-pilot-inject.cjs').injectPaymentReminder(fs.readFileSync(path.resolve(__dirname,'../../site/payment.html'),'utf8')));});

test('production Cash Control inline scripts remain parseable after PHU HUNG link restoration',()=>{
 const {verifyInlineScripts}=require('../deployment-gate.cjs');
 const out=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'cash-control-production-parse-')),'site');
 buildSite({source:path.resolve(__dirname,'../../site'),output:out,target:'production'});
 const html=fs.readFileSync(path.join(out,'cash-control.html'),'utf8');
 assert.ok(verifyInlineScripts(html,'cash-control.html')>0);
 assert.match(html,/const knownOriginalSheets=/);
 assert.match(html,/PHU HUNG/);
 assert.match(html,/ELYSIAN/);
 assert.match(html,/FOXCONN/);
 assert.match(html,/if\(!available\.has\(project\)\|\|ccSyncProjectLinkDraft\[project\]\)continue;/);
 assert.match(html,/if\(recovered\)ccSyncProjectCatalogSaveDraft\(\);/);
 assert.doesNotMatch(html,/FOXCONN_GOOGLE_TEST/);
 assert.doesNotMatch(html,/S19-3项目现金流表/);
 const panel=html.slice(html.indexOf('<div class="modal" id="ccGoogleSyncPreviewModal">'),
   html.indexOf('<div class="modal" id="exportRangeModal">'));
 assert.match(panel,/class="cc-sync-actions"[\s\S]*Đồng bộ sang Google[\s\S]*Chỉ đối chiếu[\s\S]*id="ccSyncBatchResults"/);
 assert.match(panel,/id="ccSyncSecondaryTools" hidden[\s\S]*Quản lý link dự án[\s\S]*Tải báo cáo Excel[\s\S]*Công cụ kỹ thuật/);
 assert.doesNotMatch(panel,/Chưa bật ghi đồng bộ chung/);
 assert.ok(fs.existsSync(path.join(out,'assets/js/cash-sync-panel.mjs')));
});
test('production refuses indexed V1 even when all environment approvals are present',()=>{
 const out=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'payment-index-release-')),'site');
 assert.throws(()=>buildSite({source:path.resolve(__dirname,'../../site'),output:out,target:'production',enableIndexQueries:true}),/release blocked/);
 assert.equal(fs.existsSync(out),false,'refuse before producing any deployable files');
 const safe=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'payment-index-safe-')),'site');
 buildSite({source:path.resolve(__dirname,'../../site'),output:safe,target:'production'});
 for(const name of ['payment.html','payment-mobile-renderer.html','contract-master.html'])assert.match(fs.readFileSync(path.join(safe,name),'utf8'),/INDEX_QUERY_CODE_ENABLED = false;/);
});
