'use strict';
const fs=require('node:fs'),path=require('node:path');
const PRODUCTION_PROJECT='cscecmep-payment';
function validateStagingConfig(config){
 if(!config||typeof config!=='object'||typeof config.projectId!=='string'||!/^[-a-z0-9]*staging[-a-z0-9]*$/.test(config.projectId)||config.projectId===PRODUCTION_PROJECT)throw Error('A separate Firebase staging project is required');
 for(const key of ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'])if(typeof config[key]!=='string'||!config[key])throw Error('Missing Firebase staging field: '+key);
 if(config.authDomain!==config.projectId+'.firebaseapp.com')throw Error('Auth domain must belong to staging project');
 if(![config.projectId+'.firebasestorage.app',config.projectId+'.appspot.com'].includes(config.storageBucket))throw Error('Storage must belong to staging project');
 return config;
}
function buildSite({source,output,target,stagingConfig,enableIndexQueries=false}){
 // Never enable against staging; production needs an explicit audited release gate.
 if(enableIndexQueries && target!=='production')throw Error('Indexed Payment reads may only be enabled after production audit');
 // Security hold: V1 client-derived keys are not validated by production Rules.
 // Three environment approvals cannot substitute for server-side enforcement.
 if(enableIndexQueries)throw Error('Payment index V1 release blocked: untrusted client keys are not validated by production Rules');
 if(!['staging','production'].includes(target))throw Error('Unknown deployment target');
 if(target==='staging')validateStagingConfig(stagingConfig);
 const src=path.resolve(source),out=path.resolve(output);if(out===src||out.startsWith(src+path.sep))throw Error('Output cannot overwrite or nest within source');
 fs.mkdirSync(out,{recursive:true});fs.cpSync(src,out,{recursive:true});let configs=0,indexReadGuards=0,v2PageGuards=0;
 for(const name of fs.readdirSync(out).filter(n=>n.endsWith('.html'))){const file=path.join(out,name);let text=fs.readFileSync(file,'utf8');const pattern=/const firebaseConfig\s*=\s*\{[\s\S]*?\};/g;
 text=text.replace(pattern,original=>{configs++;return target==='staging'?'const firebaseConfig='+JSON.stringify(stagingConfig)+';':original});
 if(target==='staging'&&text.includes('cscecmep-payment.firebaseapp.com'))throw Error('Production Auth endpoint left in staging output');
 // Indexed V2 requires BOTH pages to ship the guarded query. Staging
 // always disables it, even when source has the release-ready code.
 if(['payment.html','payment-mobile-renderer.html'].includes(name)){
   if(!text.includes('const PAYMENT_INDEX_V2_QUERY_CODE_ENABLED = true;'))
     throw Error('Missing guarded Payment V2 query from '+name);
   v2PageGuards++;
   if(target==='staging')
     text=text.replace('const PAYMENT_INDEX_V2_QUERY_CODE_ENABLED = true;',
       'const PAYMENT_INDEX_V2_QUERY_CODE_ENABLED = false;');
 }
 // The server marker is a runtime safety gate, but a marker alone is not
 // authority to enable queries. A separate explicit *build* release gate is
 // required after a clean full backfill + production Rules verification.
 text=text.replace(/const (PAYMENT|MEP)_INDEX_QUERY_CODE_ENABLED = true;/g,(_,name)=>{indexReadGuards++;return 'const '+name+'_INDEX_QUERY_CODE_ENABLED = '+(enableIndexQueries && name==='PAYMENT'?'true':'false')+';'});
 fs.writeFileSync(file,text);
 }
 if(indexReadGuards!==3)throw Error('Expected three safe-read guards');
 if(configs!==9)throw Error('Expected nine Firebase app configurations, got '+configs);
 if(v2PageGuards!==2)throw Error('Expected two guarded V2 pages');
 const writerSource=fs.readFileSync(path.join(out,'assets/js/firestore-payment.mjs'),'utf8');
 const contractV2ReadyToActivate=target==='production' &&
   writerSource.includes('PAYMENT_V2_WRITERS_ENABLED=true') && v2PageGuards===2;
 fs.writeFileSync(path.join(out,'release-environment.json'),JSON.stringify({target,firebaseProject:target==='staging'?stagingConfig.projectId:PRODUCTION_PROJECT,indexOptimizationEnabledByDefault:Boolean(enableIndexQueries),contractMasterMEPIndexEnabledByDefault:false,contractV2ReadyToActivate},null,2));
 return {target,configs,indexReadGuards,v2PageGuards,contractV2ReadyToActivate,firebaseProject:target==='staging'?stagingConfig.projectId:PRODUCTION_PROJECT};
}
module.exports={buildSite,validateStagingConfig};
if(require.main===module){
 require('../tests/deployment-gate.cjs');
 // Preserve the current main Payment V2 safeguards while validating only
 // the manually-triggered PHU HUNG Sheets code on this isolated release branch.
 require('node:child_process').execFileSync(process.execPath,[
   '--test',path.join(__dirname,'../tests/cash-sync-gate.test.cjs'),
   path.join(__dirname,'../tests/cash-payment-project-readonly.test.cjs'),
   path.join(__dirname,'../tests/cash-payment-google-readonly.test.cjs'),
   path.join(__dirname,'../tests/cash-sync-original-audit.test.cjs'),
   path.join(__dirname,'../tests/cash-sync-live-core.test.cjs'),
   path.join(__dirname,'../tests/cash-shared-test-sync-planner.test.cjs'),
   path.join(__dirname,'../tests/cash-shared-test-sync-integration.test.cjs'),
   path.join(__dirname,'../tests/cash-shared-source-adapter.test.cjs'),
   path.join(__dirname,'../tests/cash-shared-test-write-coordinator.test.cjs'),
   path.join(__dirname,'../tests/cash-shared-google-test-transport.test.cjs'),
   path.join(__dirname,'../google-sheets-sync/pilot.test.cjs')
 ],{stdio:'inherit',timeout:60000});
 const target=process.env.VERCEL_ENV==='production'?'production':'staging';
 const stagingConfig=target==='staging'?JSON.parse(process.env.PAYMENT_FIREBASE_STAGING_CONFIG||'null'):null;
 const enableIndexQueries=target==='production' && process.env.PAYMENT_INDEX_PROD_OPTIMIZATION_APPROVED==='YES' &&
   process.env.PAYMENT_INDEX_PROD_RULES_VERIFIED==='YES' && process.env.PAYMENT_INDEX_PROD_BACKFILL_VERIFIED==='YES';
 console.log(JSON.stringify(buildSite({source:path.join(__dirname,'../site'),output:path.join(__dirname,'../build/site'),target,stagingConfig,enableIndexQueries})));
}
