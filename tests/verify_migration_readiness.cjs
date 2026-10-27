'use strict';
// Read-only, offline preflight. Never connects to production or prints financial records.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const input=process.argv[2];
if(!input)throw Error('Usage: node tests/verify_migration_readiness.cjs /private/original/payment.html');
const html=fs.readFileSync(input,'utf8');
const expected=require('../security/history2026_metadata.json').documents;
function canonical(v){return Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;}
const detail={};
for(const [symbol,id] of [['HISTORY_2026_EMBEDDED','raw'],['HISTORY_2026_CLEAN_SOURCE','clean']]){
 const m=html.match(new RegExp('^window\\.'+symbol+'\\s*=\\s*(\\[.*?\\]);','m'));
 if(!m)throw Error('Missing '+symbol);
 const rows=JSON.parse(m[1]);
 const sha256=crypto.createHash('sha256').update(JSON.stringify(canonical(rows))).digest('hex');
 if(rows.length!==812||sha256!==expected[id].sha256)throw Error('Integrity check failed for '+id);
 detail[id]={rows:rows.length,checksumMatches:true,serializedJsonBytes:Buffer.byteLength(JSON.stringify(rows))};
}
for(const p of ['site/payment.html','site/payment-mobile-renderer.html']){
 const s=fs.readFileSync(path.join(root,p),'utf8');
 if(/window\.HISTORY_2026_(EMBEDDED|CLEAN_SOURCE)\s*=\s*\[/.test(s))throw Error('Embedded financial history found in '+p);
}
const gate=JSON.parse(fs.readFileSync(path.join(root,'tests/ACTIVATION_GATE_STATUS.json'),'utf8'));
const report={mode:'OFFLINE_READ_ONLY',filesChecked:2,history:detail,siteHistoryEmbedded:false,productionDeploymentAllowed:!(!gate.productionDeployAllowed),firebaseEmulatorExecuted:false,liveBackfillExecuted:false,indexEnabled:false};
if(report.productionDeploymentAllowed)throw Error('Unexpected production enablement');
console.log(JSON.stringify(report,null,2));
