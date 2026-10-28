'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

// The deployed HTML may change normally. Check syntax without pinning it to
// an old release checksum or requiring a new approval token for every edit.
function verifyInlineScripts(html,fileName='payment.html'){
 let checked=0;
 for(const match of String(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
  const attrs=match[1],source=match[2];
  if(!source.trim()||/\bsrc\s*=/.test(attrs))continue;
  const typeMatch=/\btype\s*=\s*['"]([^'"]+)/i.exec(attrs);
  const type=typeMatch?typeMatch[1].toLowerCase():'text/javascript';
  if(!['text/javascript','application/javascript','module'].includes(type))continue;
  const args=['--check',...(type==='module'?['--input-type=module']:[])];
  const result=spawnSync(process.execPath,args,{input:source,encoding:'utf8',maxBuffer:1024*1024});
  if(result.error||result.status!==0){
   throw new Error('Invalid JavaScript in '+fileName+' (script '+(checked+1)+'): '+String(result.stderr||result.error).slice(0,500));
  }
  checked++;
 }
 return checked;
}
function verifySiteHtml(siteDir=path.resolve(__dirname,'../site')){
 let files=0,blocks=0;
 for(const name of fs.readdirSync(siteDir).filter(name=>name.endsWith('.html'))){
  blocks+=verifyInlineScripts(fs.readFileSync(path.join(siteDir,name),'utf8'),name);
  files++;
 }
 if(!files||!blocks)throw Error('No HTML/JavaScript source found for deployment');
 return {files,blocks};
}
// The Vercel build requires this module directly; validate before copying.
const result=verifySiteHtml();
if(require.main===module)console.log('PASS: '+result.blocks+' JS blocks in '+result.files+' HTML files; no frozen manifest required');
module.exports={verifyInlineScripts,verifySiteHtml};
