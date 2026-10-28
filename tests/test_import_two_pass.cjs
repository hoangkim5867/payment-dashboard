'use strict';
// Exercise real first-stage preview routing extracted from both HTML pages.
// No Firebase SDK calls, network, company data, or UI renderer required.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'../site');
const begin='async function renderExcelImportPreview(){';
const endMarker='    }catch(error){';
const helper='function importPreviewContainsPaymentCandidate(rows){';
function extractFunction(src,signature){
  const beginPos=src.indexOf(signature); assert(beginPos>=0,signature);
  let depth=0,seen=false;
  for(let i=beginPos;i<src.length;i++){
    if(src[i]==='{'){depth++;seen=true;}
    else if(src[i]==='}'){depth--;if(seen&&depth===0)return src.slice(beginPos,i+1);}
  }
  throw Error('Unterminated function: '+signature);
}
(async()=>{
 let checks=0;
 for(const name of ['payment.html','payment-mobile-renderer.html']){
   const source=fs.readFileSync(path.join(root,name),'utf8');
   assert(source.includes('function buildExcelImportRows({skipHistoryDuplicateCheck = false} = {}){'));
   assert(source.includes('if(!skipHistoryDuplicateCheck){'));
   const helperSource=extractFunction(source,helper);
   const p=source.indexOf(begin),b=source.indexOf(endMarker,p);
   assert(p>=0&&b>p);
   const head=source.slice(p,b)+endMarker+'throw error;}'+'\n}';
   const scenarios=[
     {title:'No mapped contract payment: no full scan',valid:true,rows:[{data:null,errors:['missing contract']}],reads:0,builds:1},
     {title:'All rows invalid/unmatched: no full scan',valid:true,rows:[{data:null,errors:['invalid']},{data:null,errors:['invalid']}],reads:0,builds:1},
     {title:'Real contract row: preserve duplicate scan',valid:true,rows:[{data:{contractNo:'A'},errors:[]}],reads:1,builds:2},
     {title:'Payment candidate with error: preserve duplicate notices',valid:true,rows:[{data:{contractNo:'A'},errors:['invalid amount']}],reads:1,builds:2},
     {title:'Invalid header gate: no full scan',valid:false,rows:[{data:null,errors:['missing header']}],reads:0,builds:1},
     {title:'Empty clipboard: no full scan',valid:false,rows:[],reads:0,builds:1,empty:true},
   ];
   for(const scenario of scenarios){
     let reads=0,builds=0;
     const sandbox={
       Array,clearTimeout,confirmExcelImportBtn:{disabled:false},excelPasteArea:{value:scenario.empty?'':'contractNo\tipcNo\tamount\nA\tIPC001\t100'},
       excelImportStatus:{innerHTML:''},previewExcelPasteBtn:{disabled:false},
       importPreviewNeedsHistoryScan:()=>scenario.valid,
       buildExcelImportRows:(options={})=>{builds++;
         if(options.skipHistoryDuplicateCheck)return scenario.rows;
         return scenario.rows.map(r=>({...r,crossMonthDuplicate:r.data?{id:'old'}:null}));
       },
       ensureImportDuplicateHistory:async()=>{reads++},
       ensureImportDuplicateHistoryForRows:async()=>{reads++},
     };
     vm.createContext(sandbox);vm.runInContext(helperSource+'\n'+source.slice(source.indexOf('let excelImportPreviewGeneration = 0;'),p)+'\n'+head,sandbox);
     assert.strictEqual(sandbox.importPreviewContainsPaymentCandidate(scenario.rows),scenario.rows.some(x=>!!x.data));checks++;
     await sandbox.renderExcelImportPreview();
     assert.strictEqual(reads,scenario.reads,`${name} ${scenario.title} read`);checks++;
     assert.strictEqual(builds,scenario.builds,`${name} ${scenario.title} parse`);checks++;
   }
 }
 console.log(`PASS: ${checks} two-pass import route assertions (desktop + mobile; offline)`);
})().catch(e=>{console.error(e);process.exit(1)});
