'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {verifyInlineScripts}=require('../deployment-gate.cjs');
const gateSource=fs.readFileSync(path.resolve(__dirname,'../deployment-gate.cjs'),'utf8');
test('regular HTML updates no longer require frozen RC manifest or approval token',()=>{
 assert.doesNotMatch(gateSource,/RC1_FILE_MANIFEST|PAYMENT_APPROVED_MANIFEST_SHA256|RELEASE_STATUS/);
 assert.equal(verifyInlineScripts('<script>const amount = 1 + 2;</script>'),1);
});
test('invalid JavaScript is blocked before deploy',()=>{
 assert.throws(()=>verifyInlineScripts('<script>const broken = ;</script>'),/Invalid JavaScript/);
});
test('module JavaScript is validated and non-JS script types are ignored',()=>{
 assert.equal(verifyInlineScripts('<script type="module">import {x} from "module";</script><script type="application/json">{ "ok": true }</script>'),1);
});
test('external scripts are not parsed as inline JavaScript',()=>{
 assert.equal(verifyInlineScripts('<script src="app.js"></script>'),0);
});
