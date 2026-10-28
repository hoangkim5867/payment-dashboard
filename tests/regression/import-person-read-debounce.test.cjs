'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
for(const page of ['payment.html','payment-mobile-renderer.html']){
 const source=fs.readFileSync(path.resolve(__dirname,'../../site',page),'utf8');
 const slice=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
 const setup=slice('let excelImportPreviewGeneration = 0;','async function renderExcelImportPreview(){');
 function harness(){
  const timers=new Map();let next=0,input,reads=0;
  const ctx={clearTimeout:id=>timers.delete(id),setTimeout:fn=>{timers.set(++next,fn);return next;},
   confirmExcelImportBtn:{disabled:false},excelPasteArea:{value:'fake payment'},
   pasteExcelModal:{classList:{contains:()=>true}},
   importDefaultPerson:{addEventListener:(_,fn)=>input=fn},
   renderExcelImportPreview:()=>{reads++;vm.runInContext('cancelPendingImportPersonPreview()',ctx);}};
  vm.createContext(ctx);vm.runInContext(setup+slice('importDefaultPerson.addEventListener(','pasteExcelBtn.addEventListener('),ctx);
  return {ctx,input:()=>input(),timers,reads:()=>reads,flush:()=>{for(const [id,fn] of [...timers]){timers.delete(id);fn();}}};
 }
 test(page+': typing a name runs one complete check after the burst, with confirmation blocked',()=>{
  const h=harness();for(let i=0;i<10;i++)h.input();
  assert.equal(h.reads(),0);assert.equal(h.timers.size,1);assert.equal(h.ctx.confirmExcelImportBtn.disabled,true);
  h.flush();assert.equal(h.reads(),1);
  h.input();h.flush();assert.equal(h.reads(),2,'Later edits must still recheck fresh history');
 });
 test(page+': explicit preview, clear and close cancel queued automatic preview',()=>{
  const h=harness();h.input();h.ctx.renderExcelImportPreview();h.flush();assert.equal(h.reads(),1);
  h.input();vm.runInContext('cancelPendingImportPersonPreview()',h.ctx);h.flush();assert.equal(h.reads(),1);
  assert.match(slice('function closeExcelPasteImportModal(){','importDefaultMonth.addEventListener('),/cancelPendingImportPersonPreview\(\)/);
  assert.match(slice('clearExcelPasteBtn.addEventListener(','previewExcelPasteBtn.addEventListener('),/cancelPendingImportPersonPreview\(\)/);
 });
 test(page+': a previous history scan cannot publish a stale preview after another edit',async()=>{
  const h=harness();let release,builds=0;
  const history=new Promise(r=>release=r);
  Object.assign(h.ctx,{importPreviewNeedsHistoryScan:()=>true,
   importPreviewContainsPaymentCandidate:()=>true,
   buildExcelImportRows:()=>{builds++;return [{data:{contractNo:'FAKE'},errors:[]}];},
   previewExcelPasteBtn:{disabled:false},excelImportStatus:{innerHTML:''},
   ensureImportDuplicateHistoryForRows:()=>history});
  const start=source.indexOf('async function renderExcelImportPreview(){');
  const end=source.indexOf('    }catch(error){',start);
  vm.runInContext(source.slice(start,end)+'}catch(error){throw error;}}',h.ctx);
  const pending=h.ctx.renderExcelImportPreview();h.input();release();await pending;
  assert.equal(builds,1,'Discard the previous result before rebuilding or publishing');
  assert.equal(h.ctx.confirmExcelImportBtn.disabled,true);
 });
}
