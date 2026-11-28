'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const {pushEndpoint,vapidConfig,vapidAuthorization,sendPilot}=require('../../server/payment-reminder-push.cjs');
const endpoint='https://fcm.googleapis.com/fcm/send/abcdefghijklmnopqrstuv:APA91b-example';
function config(){const {privateKey}=crypto.generateKeyPairSync('ec',{namedCurve:'prime256v1'});return vapidConfig({PAYMENT_REMINDER_PUSH_PILOT:'YES',VERCEL_ENV:'production',PAYMENT_REMINDER_VAPID_JWK:JSON.stringify(privateKey.export({format:'jwk'}))})}
test('push endpoint allowlist rejects non-FCM hosts, credentials, redirect-like paths',()=>{
 assert.equal(pushEndpoint(endpoint).hostname,'fcm.googleapis.com');
 for(const v of ['http://fcm.googleapis.com/fcm/send/abcdefghijklmnopqrstuv','https://fcm.googleapis.com.evil.test/fcm/send/abcdefghijklmnopqrstuv','https://127.0.0.1/fcm/send/abcdefghijklmnopqrstuv','https://fcm.googleapis.com:444/fcm/send/abcdefghijklmnopqrstuv','https://a@fcm.googleapis.com/fcm/send/abcdefghijklmnopqrstuv','https://fcm.googleapis.com/fcm/send/abcdefghijklmnopqrstuv?x=1','https://fcm.googleapis.com/v1/projects/test/messages:send','https://fcm.googleapis.com/fcm/send/abcdefghijklmnopqrstuv%2fother'])assert.throws(()=>pushEndpoint(v))
});
test('production pilot fails closed unless explicitly enabled; ES256 VAPID signature and audience',()=>{
 assert.throws(()=>vapidConfig({}));assert.throws(()=>vapidConfig({PAYMENT_REMINDER_PUSH_PILOT:'YES',VERCEL_ENV:'preview'}));
 const cfg=config(),now=Date.now(),header=vapidAuthorization(cfg,endpoint,now);
 const m=header.match(/^vapid t=([^,]+), k=([A-Za-z0-9_-]+)$/);assert.ok(m);assert.equal(m[2],cfg.publicKey);const [a,b,s]=m[1].split('.');
 assert.deepEqual(JSON.parse(Buffer.from(a,'base64url')),{typ:'JWT',alg:'ES256'});const p=JSON.parse(Buffer.from(b,'base64url'));assert.equal(p.aud,'https://fcm.googleapis.com');assert.equal(p.exp,Math.floor(now/1000)+300);
 assert.equal(Buffer.from(m[2],'base64url').length,65);assert.ok(crypto.verify('sha256',Buffer.from(a+'.'+b),{key:crypto.createPublicKey(cfg.key),dsaEncoding:'ieee-p1363'},Buffer.from(s,'base64url')));
});
test('one payloadless push, fixed host, no redirects or retry; errors fail closed',async()=>{
 let calls=0;assert.deepEqual(await sendPilot(config(),endpoint,async(url,options)=>{calls++;assert.equal(url,endpoint);assert.equal(options.method,'POST');assert.equal(options.redirect,'error');assert.equal(options.headers.TTL,'120');assert.equal(options.body,undefined);return {status:201}}),{accepted:true});assert.equal(calls,1);
 await assert.rejects(sendPilot(config(),endpoint,async()=>({status:410})));await assert.rejects(sendPilot(config(),'https://127.0.0.1/',async()=>{throw Error('must not fetch')}));
});
test('admin settings no longer keep an idle floating panel; pilot contains no Firestore or schedule',()=>{
 const ui=fs.readFileSync(require.resolve('../../site/assets/js/payment-reminder-pilot.mjs'),'utf8');
 assert.match(ui,/!items.length&&!weeklyPending&&!settingsOpen/);assert.match(ui,/data.admin&&settingsOpen/);assert.match(ui,/menuBtn\?\.remove\(\)/);assert.equal((ui.match(/setInterval\(/g)||[]).length,1);
 const worker=fs.readFileSync(require.resolve('../../site/payment-reminder-push/sw.js'),'utf8');assert.match(worker,/showNotification/);assert.doesNotMatch(worker,/addEventListener\("fetch"/);assert.doesNotMatch(worker,/getDocs\(|setDoc\(|onSnapshot\(/);
});
