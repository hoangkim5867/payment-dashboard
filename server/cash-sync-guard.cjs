'use strict';
/* TEST-only Cash Control write authorization.
 * No private key, Firebase Admin SDK or extra Firestore reads.
 * Reject all writes unless a trusted Firebase project + Admin UID are supplied
 * as server-side Vercel environment variables.
 */
const {createPublicKey,verify}=require('node:crypto');
const TEST_SPREADSHEET_ID='1bxY6jQ3qHJ0oTiWDmbH4eeFgZR7goqX3_s1Kz9UlfD4';
const PUBLIC_KEYS_URL='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const HEADER=['sourceId','projectKey','month','date','company','contractNo',
  'content','ipc','type','income','subcontract','material','otherDirect',
  'indirect','financial','otherPayable','balance','sourceHash','syncStatus'];
const COMPUTED_HEADER=['date','company','contractNo','content','ipc','type','income',
  'subcontract','material','otherDirect','indirect','financial','otherPayable',
  'balance','origin','sourceId','openingBalance'];
let cachedKeys=null,cachedUntil=0;
function block(reason){const err=new Error(reason);err.statusCode=403;throw err}
function decodeJsonSegment(input){
  if(typeof input!=='string'||input.length>8192||!/^[A-Za-z0-9_-]+$/.test(input))block('Invalid ID token.');
  try{return JSON.parse(Buffer.from(input,'base64url').toString('utf8'))}catch{block('Invalid ID token.')}
}
function readConfig(env){
  const project=String(env.CASH_SYNC_FIREBASE_PROJECT_ID||'');
  const uid=String(env.CASH_SYNC_ADMIN_UID||'');
  if(!/^[a-z0-9][a-z0-9-]{3,80}$/.test(project)||!/^[A-Za-z0-9_-]{4,128}$/.test(uid))
    throw Object.assign(new Error('Admin server gate is not configured.'),{statusCode:503});
  if(env.VERCEL_ENV==='production'&&env.CASH_SYNC_PRODUCTION_ENABLED!=='YES')
    throw Object.assign(new Error('Production Cash Sync has not been approved.'),{statusCode:503});
  return {project,uid};
}
async function getPublicKeys(fetcher=fetch,now=Date.now()){
  if(cachedKeys&&now<cachedUntil)return cachedKeys;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),5000);
  try{
    const response=await fetcher(PUBLIC_KEYS_URL,{signal:controller.signal});
    if(!response.ok)throw Error('Firebase public keys unavailable.');
    const data=await response.json();
    if(!Array.isArray(data.keys)||!data.keys.length||data.keys.length>12)
      throw Error('Unexpected Firebase public keys.');
    const keys=new Map();
    for(const k of data.keys){
      if(k.kty==='RSA'&&k.alg==='RS256'&&typeof k.kid==='string'&&
         typeof k.n==='string'&&typeof k.e==='string')keys.set(k.kid,k);
    }
    if(!keys.size)throw Error('No supported Firebase public key.');
    // Explicitly bound cache; refresh if the signing key rotates.
    cachedKeys=keys;cachedUntil=now+15*60*1000;
    return keys;
  }finally{clearTimeout(timer)}
}
async function verifyFirebaseAdminToken(jwt,config,{fetcher=fetch,now=Date.now()}={}){
  if(typeof jwt!=='string'||jwt.length<100||jwt.length>8192)block('Missing Firebase ID token.');
  const parts=jwt.split('.');
  if(parts.length!==3)block('Malformed Firebase ID token.');
  const header=decodeJsonSegment(parts[0]),payload=decodeJsonSegment(parts[1]);
  if(header.alg!=='RS256'||typeof header.kid!=='string'||!header.kid||
     header.typ&&header.typ!=='JWT')block('Unexpected Firebase token algorithm.');
  const nowSeconds=Math.floor(now/1000);
  if(payload.aud!==config.project||
     payload.iss!=='https://securetoken.google.com/'+config.project||
     payload.sub!==config.uid||
     typeof payload.sub!=='string'||payload.sub.length>128||
     !Number.isFinite(payload.exp)||payload.exp<=nowSeconds||
     !Number.isFinite(payload.iat)||payload.iat>nowSeconds+60||
     !Number.isFinite(payload.auth_time)||payload.auth_time>nowSeconds+60||
     payload.auth_time<=0)block('Not an authorized Cash Control Admin.');
  const keys=await getPublicKeys(fetcher,now);
  const key=keys.get(header.kid);
  if(!key)block('Firebase ID token key is not trusted.');
  let valid=false;
  try{
    valid=verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),
      createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url'));
  }catch{block('Invalid Firebase ID token signature.')}
  if(!valid)block('Invalid Firebase ID token signature.');
  return {uid:payload.sub,project:payload.aud};
}
function isMirrorTab(tab,project){
  return tab==='DATA_CASHCONTROL'||
    (project==='cash-control-staging'&&tab==='DATA_CASHCONTROL_DEMO');
}
const isAutoTab=tab=>/^AUTO_PHU_HUNG_TEST_\d{8}T\d{6}$/.test(tab);
const STABLE_TEST_VIEW='PHU_HUNG_VIEW_TEST';
const safeRows=(rows,columns,max=5000)=>Array.isArray(rows)&&rows.length>0&&rows.length<=max&&
  rows.every(r=>Array.isArray(r)&&r.length===columns&&r.every(v=>
    v===null||typeof v==='string'||typeof v==='number'||typeof v==='boolean'));
function validateWrite(method,path,body,project,stableSheetId=null){
  if(typeof path!=='string'||path.length>350||path.includes('..')||
     !body||typeof body!=='object'||Array.isArray(body))block('Disallowed Sheets write.');
  let decoded;
  try{decoded=decodeURIComponent(path)}catch{block('Invalid Sheets path.')}
  if(method==='POST'&&decoded===':batchUpdate'){
    const items=body.requests;
    if(!Array.isArray(items)||items.length!==1)block('Only one new TEST tab is allowed.');
    // Atomic replacement is limited to a derived TEST tab, never history.
    if(items[0]?.updateCells){
      const op=items[0].updateCells,range=op.range;
      if(!Number.isInteger(stableSheetId)||stableSheetId<0||
         Object.keys(items[0]).length!==1||
         Object.keys(op).sort().join(',')!=='fields,range,rows'||
         op.fields!=='userEnteredValue'||
         !range||range.sheetId!==stableSheetId||
         range.startRowIndex!==0||range.startColumnIndex!==0||
         range.endColumnIndex!==17||
         !Number.isInteger(range.endRowIndex)||range.endRowIndex<2||
         range.endRowIndex>10001||
         !Array.isArray(op.rows)||op.rows.length<2||
         op.rows.length>range.endRowIndex||op.rows.length>10001)
        block('Only a bounded TEST view may be replaced atomically.');
      const rowCount=op.rows.length;
      for(let i=0;i<rowCount;i++){
        const cells=op.rows[i]?.values;
        if(!Array.isArray(cells)||cells.length!==17)
          block('Invalid TEST view grid.');
        for(let col=0;col<17;col++){
          const cell=cells[col];
          if(!cell||typeof cell!=='object'||Array.isArray(cell)||
             Object.keys(cell).some(k=>k!=='userEnteredValue'))
            block('Unexpected Google grid cell.');
          const v=cell.userEnteredValue;
          if(!v)continue;
          if(typeof v!=='object'||Array.isArray(v)||
             Object.keys(v).length!==1||
             !['numberValue','stringValue','boolValue','formulaValue'].includes(Object.keys(v)[0]))
            block('Unsupported Google grid value.');
          const type=Object.keys(v)[0],value=v[type];
          if(type==='numberValue'&&!(typeof value==='number'&&Number.isFinite(value))||
             type==='stringValue'&&typeof value!=='string'||
             type==='boolValue'&&typeof value!=='boolean')
            block('Invalid Google grid value.');
          if(type==='formulaValue'){
            const expected=i===1?'=$Q$2+G2-SUM(H2:M2)':
              '=N'+i+'+G'+(i+1)+'-SUM(H'+(i+1)+':M'+(i+1)+')';
            if(i===0||col!==13||value!==expected)
              block('Only the approved balance formula is allowed.');
          }else if(i>0&&col===13)
            block('Every balance cell must contain the running formula.');
          if(i===0&&(type!=='stringValue'||value!==COMPUTED_HEADER[col]))
            block('Unexpected TEST view header.');
        }
      }
      return;
    }
    const props=items[0]?.addSheet?.properties,tab=props?.title;
    if(typeof tab!=='string'||!isMirrorTab(tab,project)&&!isAutoTab(tab)&&tab!==STABLE_TEST_VIEW||
       Object.keys(items[0]).length!==1||Object.keys(props||{}).length!==1)
      block('Cannot create a non-TEST tab.');
    return;
  }
  if(method==='POST'&&decoded==='/values:batchUpdate'){
    if(body.valueInputOption!=='RAW'||!Array.isArray(body.data)||
       !body.data.length||body.data.length>1000)block('Invalid mirror batch.');
    for(const change of body.data){
      const match=String(change.range||'').match(/^'([A-Z_]+)'!A([2-9]\d*):S\2$/);
      if(!match||!isMirrorTab(match[1],project)||
         !safeRows(change.values,19,1))
        block('Only machine-controlled mirror rows may be updated.');
    }
    return;
  }
  const match=decoded.match(/^\/values\/'([A-Z0-9_]+)'!([A-Z0-9:]+)(:append)?\?valueInputOption=(RAW|USER_ENTERED)(?:&insertDataOption=(INSERT_ROWS))?$/);
  if(!match||!['PUT','POST'].includes(method))block('Disallowed Google Sheets range.');
  const [,tab,range,append,input,insert]=match;
  if(isMirrorTab(tab,project)){
    if(method==='PUT'&&range==='A1:S1'&&!append&&input==='RAW'&&!insert&&
       Array.isArray(body.values)&&body.values.length===1&&
       JSON.stringify(body.values[0])===JSON.stringify(HEADER))return;
    if(method==='POST'&&range==='A:S'&&append&&input==='RAW'&&insert==='INSERT_ROWS'&&
       safeRows(body.values,19))return;
    block('Unsupported mirror write.');
  }
  if(!isAutoTab(tab)||method!=='PUT'||append||insert)block('Historic tab cannot be written.');
  const raw=range.match(/^A1:Q([2-9]\d*)$/);
  if(raw&&input==='RAW'){
    const last=Number(raw[1]);
    if(last>10001||!safeRows(body.values,17,10001)||body.values.length!==last||
       JSON.stringify(body.values[0])!==JSON.stringify(COMPUTED_HEADER))
      block('Invalid generated ledger rows.');
    return;
  }
  const formulas=range.match(/^N2:N([2-9]\d*)$/);
  if(formulas&&input==='USER_ENTERED'){
    const last=Number(formulas[1]);
    if(last>10001||!safeRows(body.values,1,10000)||body.values.length!==last-1)
      block('Invalid generated ledger formulas.');
    for(let i=0;i<body.values.length;i++){
      const row=i+2;
      const expected=i===0?'=$Q$2+G2-SUM(H2:M2)':
        '=N'+(row-1)+'+G'+row+'-SUM(H'+row+':M'+row+')';
      if(body.values[i][0]!==expected)block('Only approved running-balance formulas are allowed.');
    }
    return;
  }
  block('Unsupported generated sheet write.');
}
module.exports={TEST_SPREADSHEET_ID,STABLE_TEST_VIEW,readConfig,verifyFirebaseAdminToken,validateWrite,
  isMirrorTab,isAutoTab};
