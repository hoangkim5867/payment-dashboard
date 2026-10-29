'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.resolve(__dirname,'../../site/cash-control.html'),'utf8');
test('Cash Control uses owner-scoped listener as initial existence check without a duplicate getDoc',()=>{
 const start=source.indexOf('async function subscribeCashCloud()');
 const end=source.indexOf('async function mergeLegacyLocalIntoCloud()',start);
 assert.ok(start>0 && end>start,'Cash Control subscription exists');
 const scope=source.slice(start,end);
 assert.doesNotMatch(scope,/await ensureCashCloudDocument\(\);/);
 assert.match(scope,/cashCloudUnsubscribe=onSnapshot\(\s*cashPrivateRef/);
 assert.match(scope,/if\(!snap\.exists\(\)\)/);
 assert.match(scope,/ensureCashCloudDocument\(\)\.then\(/);
 assert.match(scope,/cashCloudState=normalizeCashCloudState\(snap\.data\(\)\)/);
});
test('Missing Cash Control document is rechecked and only initialized for owner',()=>{
 const start=source.indexOf('async function ensureCashCloudDocument()');
 const end=source.indexOf('async function subscribeCashCloud()',start);
 const scope=source.slice(start,end);
 assert.match(scope,/if\(!isCashControlOwner\(\)\)return false/);
 assert.match(scope,/await getDoc\(cashPrivateRef\)/);
 assert.match(scope,/if\(!snap\.exists\(\)\)/);
 assert.match(scope,/await setDoc\(cashPrivateRef/);
});

test('Missing document initialization is not repeated during overlapping server snapshots',()=>{
 const start=source.indexOf('async function subscribeCashCloud()');
 const end=source.indexOf('async function mergeLegacyLocalIntoCloud()',start);
 const scope=source.slice(start,end);
 assert.match(scope,/let cashCloudInitializationPending=false/);
 assert.match(scope,/snap\.metadata\?\.fromCache \|\| cashCloudInitializationPending/);
 assert.match(scope,/cashCloudInitializationPending=true/);
 assert.match(scope,/\.finally\(\(\)=>\{\s*cashCloudInitializationPending=false/);
 assert.match(scope,/currentAuthUser\?\.uid===subscriptionUid/);
});
