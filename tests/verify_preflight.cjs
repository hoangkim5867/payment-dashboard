// Test the actual helper extracted from both production page sources.
// No browser, network, Firebase project, personal data or authentication involved.
const fs=require('fs'), path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.join(__dirname,'..','site');
const begin='function importPreviewNeedsHistoryScan(){';
function extract(src){
 const pos=src.indexOf(begin);assert(pos>=0);
 let braces=0,open=false;
 for(let i=pos;i<src.length;i++){
  if(src[i]==='{'){braces++;open=true;} else if(src[i]==='}'){braces--;if(open&&!braces)return src.slice(pos,i+1)}
 }
 throw Error('not found');
}
let tests=0;
for(const name of ['payment.html','payment-mobile-renderer.html']){
 const html=fs.readFileSync(path.join(root,name),'utf8');
 assert(html.includes('excelPasteArea.value.trim() && importPreviewNeedsHistoryScan()'),name);
 let txt=extract(html);
 const context={
  excelPasteArea:{value:''},excelImportMode:'auto',excelManualMapping:[],
  parseExcelClipboard(v){return String(v).split('\n').filter(x=>x.trim()).map(x=>x.split('\t'))},
  looksLikeHeaderRow(row){return row.filter(x=>['contractNo','ipcNo','amount','project'].includes(x)).length>=2},
  buildImportHeaderMap(row){let out={};row.forEach((x,i)=>{if(['contractNo','ipcNo','amount','project'].includes(x))out[x]=i});return out},
  buildManualHeaderMap(n){let out={};for(let i=0;i<n;i++){const k=this.excelManualMapping[i];if(k&&out[k]===undefined)out[k]=i;}return out}
 };
 // Provide normal free functions, matching site's use (not this-binding).
 context.buildManualHeaderMap=function(n){let o={};for(let i=0;i<n;i++){const k=context.excelManualMapping[i];if(k && o[k]===undefined)o[k]=i;}return o};
 vm.createContext(context);vm.runInContext(txt,context);
 const cases=[
  ['','auto',[],false,'empty'],
  ['contractNo\tipcNo\tamount','auto',[],false,'header only'],
  ['contractNo\tipcNo\tproject\nC\tI\tX','auto',[],false,'missing amount'],
  ['contractNo\tipcNo\tamount\nC\tI\t100','auto',[],true,'valid header'],
  ['C\tI\t100','auto',[],true,'valid headerless autodetect'],
  ['C\tI\t100','no-header',['contractNo','ipcNo','amount'],true,'valid manual'],
  ['C\tI\t100','no-header',['contractNo','ipcNo',''],false,'missing manual mapping'],
 ];
 for(const [value,mode,map,expected,why] of cases){
  context.excelPasteArea.value=value;context.excelImportMode=mode;context.excelManualMapping=map;
  let actual=context.importPreviewNeedsHistoryScan();assert.strictEqual(actual,expected,`${name} ${why}`);tests++;
 }
}
console.log('PASS',tests,'preflight scenarios; full scan preserved for valid inputs (2 pages)');
