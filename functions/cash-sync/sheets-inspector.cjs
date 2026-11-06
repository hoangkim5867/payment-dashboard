'use strict';
/*
 * Server-only Google Sheets inspection adapter.
 * Uses the Cloud Function's Google service identity through ADC, never the
 * owner's browser OAuth token and never a downloaded private key.
 * This file intentionally exposes NO write method until complete source /
 * conflict / historical-balance proof is implemented and tested.
 */
const TEST_ID='1bxY6jQ3qHJ0oTiWDmbH4eeFgZR7goqX3_s1Kz9UlfD4';
const ALLOWED_TABS=new Set(['PHU HUNG','DATA_CASHCONTROL','PHU_HUNG_VIEW_TEST']);
function validateMetadata(metadata){
  if(metadata?.spreadsheetId!==TEST_ID||
     !/TEST/i.test(String(metadata?.properties?.title||''))||
     !metadata?.sheets?.some(s=>s.properties?.title==='PHU HUNG'))
    throw Error('Unexpected spreadsheet or missing protected historical sheet.');
  const tabIds=new Set();
  for(const s of metadata.sheets){
    const id=s.properties?.sheetId;
    if(Number.isInteger(id)){
      if(tabIds.has(id))throw Error('Duplicate sheet identity.');
      tabIds.add(id);
    }
  }
  return metadata;
}
function safeRange(tab,range){
  if(!ALLOWED_TABS.has(tab)||!['A1:N10001','N1:N10001','A1:S10001','A1:Q10001'].includes(range))
    throw Error('Read not allowed outside verified TEST ranges.');
  return "'"+tab.replace(/'/g,"''")+"'!"+range;
}
function createTestSheetsInspector({request}={}){
  // Inject an HTTP request implementation in tests; production uses ADC.
  if(typeof request!=='function')throw Error('Authorized server request adapter required.');
  const base='https://sheets.googleapis.com/v4/spreadsheets/'+TEST_ID;
  async function get(path){
    const response=await request({url:base+path,timeout:12000});
    const data=response?.data??response;
    if(!data||typeof data!=='object')throw Error('Google Sheets returned an invalid response');
    return data;
  }
  async function metadata(){
    return validateMetadata(await get('?fields=spreadsheetId,properties(title),sheets(properties(title,sheetId))'));
  }
  async function read(tab,range){
    await metadata();
    const name=safeRange(tab,range);
    const url='/values/'+encodeURIComponent(name)+'?valueRenderOption=UNFORMATTED_VALUE';
    const data=await get(url);
    if(!Array.isArray(data.values)||data.values.length>10001)
      throw Error('Sheet data missing or exceeds verified range.');
    return data.values;
  }
  return {metadata,read};
}
async function createAdcInspector(){
  // Lazy import: pure regression tests and Vercel code never load credentials.
  const {GoogleAuth}=require('google-auth-library');
  const auth=new GoogleAuth({
    scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']
  });
  const client=await auth.getClient();
  return createTestSheetsInspector({request:opts=>client.request(opts)});
}
module.exports={TEST_ID,ALLOWED_TABS,validateMetadata,safeRange,
  createTestSheetsInspector,createAdcInspector};
