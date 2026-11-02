'use strict';
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../../site/index.html'),'utf8');
test('Homepage shows account name only, never a redundant Admin/Staff label',()=>{
 assert.match(html, /<strong id="accountName">—<\/strong>/);
 assert.doesNotMatch(html, /id="accountRole"/);
 assert.doesNotMatch(html, /accountRole\.textContent/);
});
test('Removing role label does not remove access checks or internal login',()=>{
 assert.match(html, /if\(!profile\|\|!\['admin','staff'\]\.includes\(role\)\)/);
 assert.match(html, /card\.hidden=role!=='admin'/);
 assert.match(html, /const privateAccess=isPrivateOwner\(user,profile\)/);
 assert.match(html, /accountBar\.hidden=false/);
});
