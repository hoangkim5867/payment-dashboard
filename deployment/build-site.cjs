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
function buildSite({source,output,target,stagingConfig}){
 if(!['staging','production'].includes(target))throw Error('Unknown deployment target');
 if(target==='staging')validateStagingConfig(stagingConfig);
 const src=path.resolve(source),out=path.resolve(output);if(out===src||out.startsWith(src+path.sep))throw Error('Output cannot overwrite or nest within source');
 fs.mkdirSync(out,{recursive:true});fs.cpSync(src,out,{recursive:true});let configs=0,indexReadGuards=0;
 for(const name of fs.readdirSync(out).filter(n=>n.endsWith('.html'))){const file=path.join(out,name);let text=fs.readFileSync(file,'utf8');const pattern=/const firebaseConfig\s*=\s*\{[\s\S]*?\};/g;
 text=text.replace(pattern,original=>{configs++;return target==='staging'?'const firebaseConfig='+JSON.stringify(stagingConfig)+';':original});
 if(target==='staging'&&text.includes('cscecmep-payment.firebaseapp.com'))throw Error('Production Auth endpoint left in staging output');
 // This RC retains index writers but uses complete reads until external writers
 // are certified. A server marker alone cannot enable unsafe indexed reads.
 text=text.replace(/const (PAYMENT|MEP)_INDEX_QUERY_CODE_ENABLED = true;/g,(_,name)=>{indexReadGuards++;return 'const '+name+'_INDEX_QUERY_CODE_ENABLED = false;'});
 fs.writeFileSync(file,text);
 }
 if(indexReadGuards!==3)throw Error('Expected three safe-read guards');
 if(configs!==7)throw Error('Expected seven Firebase app configurations, got '+configs);
 fs.writeFileSync(path.join(out,'release-environment.json'),JSON.stringify({target,firebaseProject:target==='staging'?stagingConfig.projectId:PRODUCTION_PROJECT,indexOptimizationEnabledByDefault:false},null,2));
 return {target,configs,indexReadGuards,firebaseProject:target==='staging'?stagingConfig.projectId:PRODUCTION_PROJECT};
}
module.exports={buildSite,validateStagingConfig};
if(require.main===module){
 require('../tests/deployment-gate.cjs');
 const target=process.env.VERCEL_ENV==='production'?'production':'staging';
 const stagingConfig=target==='staging'?JSON.parse(process.env.PAYMENT_FIREBASE_STAGING_CONFIG||'null'):null;
 console.log(JSON.stringify(buildSite({source:path.join(__dirname,'../site'),output:path.join(__dirname,'../build/site'),target,stagingConfig})));
}
