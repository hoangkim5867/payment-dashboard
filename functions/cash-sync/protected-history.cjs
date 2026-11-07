'use strict';
/*
 * Reproduce the protected legacy-seed integrity rule from Cash Control.
 * This module NEVER embeds or exports the private legacy records.
 * A caller must supply the server-fetched protected document through
 * an explicitly authorized source; no production Firebase reads here.
 */
const {createHash,timingSafeEqual}=require('node:crypto');
const LEGACY_SEED_ID='legacy_seed_20261021_v1';
const EXPECTED_SHA256='c1a3fdf298b2b5cbec9dd293fa5a199a3cee086fbe35984b0bebbdc8b9b58f12';
const LEGACY_KEYS=['LEGACY_SALARY','LEGACY_FINANCE','LEGACY_VNB','LEGACY_CASH_SPECIAL'];
const MAX_BYTES=3000000;
function verifyProtectedHistory(document){
  if(!document||typeof document!=='object'||Array.isArray(document)||
     document.schemaVersion!==1||typeof document.payload!=='string'||
     !/^[a-f0-9]{64}$/.test(String(document.sha256||'')))
    throw Error('Missing or malformed Cash Control protected history.');
  if(Buffer.byteLength(document.payload,'utf8')>MAX_BYTES)
    throw Error('Protected history is unexpectedly large.');
  const actual=createHash('sha256').update(document.payload,'utf8').digest();
  const expected=Buffer.from(EXPECTED_SHA256,'hex');
  const declared=Buffer.from(document.sha256,'hex');
  if(!timingSafeEqual(actual,expected)||!timingSafeEqual(declared,expected))
    throw Error('Protected Cash Control history SHA256 mismatch.');
  let parsed;
  try{parsed=JSON.parse(document.payload)}
  catch{throw Error('Protected history payload is not valid JSON.')}
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))
    throw Error('Protected Cash Control history must be an object.');
  const result={};
  for(const key of LEGACY_KEYS){
    if(!Array.isArray(parsed[key])||parsed[key].length>10000)
      throw Error('Protected history has an invalid '+key+' dataset.');
    result[key]=parsed[key];
  }
  return {history:result,digest:EXPECTED_SHA256,integrityVerified:true,
    authoritative:false,
    blocker:'Source freshness, Cash Control revision and Payment completeness require independent verification.'};
}
module.exports={LEGACY_SEED_ID,EXPECTED_SHA256,LEGACY_KEYS,MAX_BYTES,
  verifyProtectedHistory};
