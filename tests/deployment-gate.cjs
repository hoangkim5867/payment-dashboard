'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),status=JSON.parse(fs.readFileSync(path.join(__dirname,'RELEASE_STATUS.json'),'utf8'));
if(status.status!=='READY_FOR_REVIEW'||Object.values(status.checks).some(x=>x!=='PASS')||status.releaseReadMode!=='COMPLETE_HISTORY'||status.indexMarkerActivated!==false){console.error('Deployment blocked: release evidence or safe read mode is incomplete.');process.exit(1)}
require('./verify-release-files.cjs');
if(process.env.VERCEL_ENV==='production'){
 const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'RC1_FILE_MANIFEST.json'))).digest('hex');
 if(process.env.PAYMENT_APPROVED_MANIFEST_SHA256!==hash){console.error('Production blocked: separate user approval for this exact RC manifest is required.');process.exit(1)}
}
console.log('RC evidence verified; production still requires separate approval for the exact manifest.');
