'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {buildSite,validateStagingConfig}=require('../../deployment/build-site.cjs');
const config={apiKey:'synthetic-staging-key',projectId:'payment-master-staging-test',authDomain:'payment-master-staging-test.firebaseapp.com',storageBucket:'payment-master-staging-test.firebasestorage.app',messagingSenderId:'123',appId:'1:123:web:test'};
test('preview rejects missing, production or mixed staging config',()=>{for(const c of [null,{...config,projectId:'cscecmep-payment'},{...config,authDomain:'cscecmep-payment.firebaseapp.com'},{...config,storageBucket:'cscecmep-payment.firebasestorage.app'}])assert.throws(()=>validateStagingConfig(c));});
test('all eight apps receive one isolated staging configuration; site assets retained',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'payment-staging-build-')),out=path.join(dir,'site');const result=buildSite({source:path.resolve(__dirname,'../../site'),output:out,target:'staging',stagingConfig:config});assert.equal(result.configs,8);for(const file of fs.readdirSync(out).filter(x=>x.endsWith('.html'))){const text=fs.readFileSync(path.join(out,file),'utf8');assert(!text.includes('cscecmep-payment.firebaseapp.com'));assert(!text.includes('projectId:"cscecmep-payment"'));}assert(fs.existsSync(path.join(out,'assets/js/firestore-payment.mjs')));for(const file of ['payment.html','payment-mobile-renderer.html','contract-master.html'])assert.match(fs.readFileSync(path.join(out,file),'utf8'),/INDEX_QUERY_CODE_ENABLED = false;/);});
test('production build preserves inherited source app configuration',()=>{const out=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'payment-production-build-')),'site');assert.equal(buildSite({source:path.resolve(__dirname,'../../site'),output:out,target:'production'}).configs,8);assert.equal(fs.readFileSync(path.join(out,'payment.html'),'utf8').replace('PAYMENT_INDEX_QUERY_CODE_ENABLED = false;','PAYMENT_INDEX_QUERY_CODE_ENABLED = true;'),fs.readFileSync(path.resolve(__dirname,'../../site/payment.html'),'utf8'));});

test('verified production index activation requires separate explicit build opt-in and runtime marker',()=>{
 const out=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'payment-index-release-')),'site');
 const result=buildSite({source:path.resolve(__dirname,'../../site'),output:out,target:'production',enableIndexQueries:true});
 assert.equal(result.configs,8);
 assert.equal(result.indexReadGuards,3);
 for(const file of ['payment.html','payment-mobile-renderer.html']){
   const text=fs.readFileSync(path.join(out,file),'utf8');
   assert.match(text,/const PAYMENT_INDEX_QUERY_CODE_ENABLED = true;/);
   assert.match(text,/state\.ready===true && state\.schemaVersion===1/);
   assert.match(text,/state\.synchronousWritersVerified===true/);
   assert.match(text,/where\("duplicateKeyV1","in",keys\.slice/);
 }
 const contract=fs.readFileSync(path.join(out,'contract-master.html'),'utf8');
 assert.match(contract,/const MEP_INDEX_QUERY_CODE_ENABLED = true;/);
 const release=JSON.parse(fs.readFileSync(path.join(out,'release-environment.json'),'utf8'));
 assert.equal(release.indexOptimizationEnabledByDefault,true);
 assert.throws(()=>buildSite({
  source:path.resolve(__dirname,'../../site'),
  output:path.join(fs.mkdtempSync(path.join(os.tmpdir(),'payment-index-stage-reject-')),'site'),
  target:'staging',stagingConfig:config,enableIndexQueries:true
 }),/may only be enabled/);
 const src=fs.readFileSync(path.resolve(__dirname,'../../deployment/build-site.cjs'),'utf8');
 for(const flag of ['PAYMENT_INDEX_PROD_OPTIMIZATION_APPROVED','PAYMENT_INDEX_PROD_RULES_VERIFIED',
                   'PAYMENT_INDEX_PROD_BACKFILL_VERIFIED']){
   assert.ok(src.includes("process.env."+flag+"==='YES'"),flag);
 }
});
