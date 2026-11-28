'use strict';
// Payload-free Web Push pilot: VAPID per RFC 8292. No subscriptions persisted,
// no financial data, no Firestore calls. Only a fixed trusted push origin.
const {createPrivateKey,createPublicKey,sign}=require('node:crypto');
const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
function pushEndpoint(value){
 if(typeof value!=='string'||value.length>2048)throw Error('Unsupported push endpoint');
 const u=new URL(value);
 if(u.origin!=='https://fcm.googleapis.com'||u.username||u.password||u.search||u.hash||
    !/^\/fcm\/send\/[A-Za-z0-9_:%.-]{20,1900}$/.test(u.pathname)||u.pathname.includes('%'))
   throw Error('Only Chrome FCM push endpoints are allowed in this pilot');
 return u;
}
function vapidConfig(env){
 if(env.PAYMENT_REMINDER_PUSH_PILOT!=='YES'||env.VERCEL_ENV!=='production')throw Error('Web Push pilot disabled');
 const key=createPrivateKey({key:JSON.parse(env.PAYMENT_REMINDER_VAPID_JWK||'null'),format:'jwk'});
 const publicJwk=createPublicKey(key).export({format:'jwk'});
 if(publicJwk.kty!=='EC'||publicJwk.crv!=='P-256')throw Error('Invalid VAPID key');
 const publicKey=Buffer.concat([Buffer.from([4]),Buffer.from(publicJwk.x,'base64url'),Buffer.from(publicJwk.y,'base64url')]).toString('base64url');
 return {key,publicKey};
}
function vapidAuthorization(config,endpoint,now=Date.now()){
 const u=pushEndpoint(endpoint);
 const input=encode({typ:'JWT',alg:'ES256'})+'.'+encode({aud:u.origin,exp:Math.floor(now/1000)+300,sub:'https://cscecmep-payment.vercel.app'});
 const signature=sign('sha256',Buffer.from(input),{key:config.key,dsaEncoding:'ieee-p1363'}).toString('base64url');
 return 'vapid t='+input+'.'+signature+', k='+config.publicKey;
}
async function sendPilot(config,endpoint,fetcher=fetch){
 const u=pushEndpoint(endpoint);
 const response=await fetcher(u.href,{method:'POST',redirect:'error',headers:{Authorization:vapidAuthorization(config,endpoint),TTL:'120',Urgency:'normal','Content-Length':'0'},signal:AbortSignal.timeout(8000)});
 if(![200,201,202,204].includes(response.status))throw Error('Push service rejected request: '+response.status);
 return {accepted:true};
}
module.exports={pushEndpoint,vapidConfig,vapidAuthorization,sendPilot};
