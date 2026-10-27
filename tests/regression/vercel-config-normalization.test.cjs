'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const command=JSON.parse(fs.readFileSync(path.join(root,'deployment/vercel-project-settings.json'),'utf8')).installCommand;
assert(command.length<=256);
const script=command.match(/^node -e "(.*)"$/s)[1];
const reviewed=fs.readFileSync(path.join(root,'vercel.json'),'utf8');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function run(config,alterManifest=false){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'payment-vercel-json-'));
 const originalManifest=JSON.stringify({files:[{path:'vercel.json',sha256:hash(reviewed)}]});
 fs.mkdirSync(path.join(dir,'tests'));fs.mkdirSync(path.join(dir,'empty-hooks'));
 for(const file of ['deployment-gate.cjs','verify-release-files.cjs','RELEASE_STATUS.json'])fs.copyFileSync(path.join(root,'tests',file),path.join(dir,'tests',file));
 fs.writeFileSync(path.join(dir,'RC1_FILE_MANIFEST.json'),alterManifest?originalManifest+' ':originalManifest);
 fs.writeFileSync(path.join(dir,'vercel.json'),reviewed);
 const git=args=>execFileSync('git',['-c','core.autocrlf=false','-c','core.hooksPath='+path.join(dir,'empty-hooks'),'-c','commit.gpgsign=false',...args],{cwd:dir,encoding:'utf8',stdio:'pipe'});
 git(['init','-q']);git(['add','vercel.json']);git(['-c','user.name=Payment Test','-c','user.email=local@example.invalid','commit','-qm','fixture']);
 fs.writeFileSync(path.join(dir,'vercel.json'),config);
 const opts={cwd:dir,encoding:'utf8',timeout:10000,env:{...process.env,VERCEL_ENV:'production',PAYMENT_APPROVED_MANIFEST_SHA256:hash(originalManifest)}};
 const install=spawnSync(process.execPath,['-e',script],opts);
 const gate=install.status===0?spawnSync(process.execPath,['tests/deployment-gate.cjs'],opts):null;
 const after=fs.readFileSync(path.join(dir,'vercel.json'),'utf8');
 assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));assert(path.basename(dir).startsWith('payment-vercel-json-'));
 fs.rmSync(dir,{recursive:true,force:true});return {install,gate,after};
}
test('Vercel compact JSON restores frozen Git bytes and the original gate passes',()=>{
 const {install,gate,after}=run(JSON.stringify(JSON.parse(reviewed))+'\n');
 assert.equal(install.status,0,install.stderr);assert.equal(gate.status,0,gate.stderr);assert.equal(after,reviewed);
});
test('already reviewed JSON stays byte-identical and passes the gate',()=>{
 const {install,gate,after}=run(reviewed);assert.equal(install.status,0,install.stderr);assert.equal(gate.status,0,gate.stderr);assert.equal(after,reviewed);
});
test('semantic platform config changes fail without overwriting the changed file',()=>{
 const changed=JSON.stringify({...JSON.parse(reviewed),outputDirectory:'.'})+'\n';const {install,gate,after}=run(changed);
 assert.notEqual(install.status,0);assert.match(install.stderr,/Config drift/);assert.equal(gate,null);assert.equal(after,changed);
});
test('an unapproved manifest is rejected by the unchanged production gate',()=>{
 const {install,gate}=run(JSON.stringify(JSON.parse(reviewed))+'\n',true);
 assert.equal(install.status,0,install.stderr);assert.notEqual(gate.status,0);assert.match(gate.stderr,/Production blocked/);
});
test('malformed JSON fails without modifying the file or running the build gate',()=>{
 const {install,gate,after}=run('{broken');assert.notEqual(install.status,0);assert.equal(gate,null);assert.equal(after,'{broken');
});
