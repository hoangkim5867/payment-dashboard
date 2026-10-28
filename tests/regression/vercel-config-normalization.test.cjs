'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
const command=JSON.parse(fs.readFileSync(path.join(root,'deployment/vercel-project-settings.json'),'utf8')).installCommand;
assert(command.length<=256);
const match=command.match(/^node -e "(.*)"$/s);
assert(match,'Vercel installCommand must remain a standalone Node script');
const script=match[1];
const reviewed=fs.readFileSync(path.join(root,'vercel.json'),'utf8');
function run(config){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'payment-vercel-json-'));
 try{
  fs.mkdirSync(path.join(dir,'empty-hooks'));
  const git=args=>execFileSync('git',['-c','core.autocrlf=false','-c','core.hooksPath='+path.join(dir,'empty-hooks'),'-c','commit.gpgsign=false',...args],{cwd:dir,encoding:'utf8',stdio:'pipe'});
  fs.writeFileSync(path.join(dir,'vercel.json'),reviewed);
  git(['init','-q']);git(['add','vercel.json']);git(['-c','user.name=Payment Test','-c','user.email=local@example.invalid','commit','-qm','fixture']);
  fs.writeFileSync(path.join(dir,'vercel.json'),config);
  const result=spawnSync(process.execPath,['-e',script],{cwd:dir,encoding:'utf8',timeout:10000});
  return {result,after:fs.readFileSync(path.join(dir,'vercel.json'),'utf8')};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('compact Vercel JSON restores committed bytes, without any RC manifest approval',()=>{
 const {result,after}=run(JSON.stringify(JSON.parse(reviewed))+'\n');
 assert.equal(result.status,0,result.stderr);assert.equal(after,reviewed);
});
test('existing Vercel JSON is preserved exactly',()=>{
 const {result,after}=run(reviewed);assert.equal(result.status,0,result.stderr);assert.equal(after,reviewed);
});
test('changed Vercel build/output settings are blocked',()=>{
 const changed=JSON.stringify({...JSON.parse(reviewed),outputDirectory:'.'})+'\n';
 const {result,after}=run(changed);
 assert.notEqual(result.status,0);assert.match(result.stderr,/Config drift/);assert.equal(after,changed);
});
test('malformed JSON is rejected without rewriting the file',()=>{
 const {result,after}=run('{broken');assert.notEqual(result.status,0);assert.equal(after,'{broken');
});
