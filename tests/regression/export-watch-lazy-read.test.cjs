'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.resolve(__dirname,'../../site/payment.html'),'utf8');
const section = (start,end) => {
    const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
    assert.ok(a>=0 && b>a, 'Missing Payment source markers: '+start);
    return html.slice(a,b);
};

test('Export Watch has no scheduled Firestore reads after sign-in, payment edits or Excel export',()=>{
    assert.equal((html.match(/scheduleExportWatchRefresh\s*\(/g)||[]).length,0);
    assert.equal((html.match(/exportWatchRefreshTimer/g)||[]).length,0);
    // Definition and exactly two user-initiated paths: manual view and workbook export.
    assert.equal((html.match(/loadExportWatchChanges\s*\(/g)||[]).length,3);
    assert.equal((html.match(/refreshExportWatchPanel\s*\(/g)||[]).length,2);
    const actualRead=section('async function loadExportWatchChanges(', 'function exportWatchScopeMatchesPayment(');
    assert.match(actualRead,/getDocs\(query\(activityLogsRef/);
    const manual=section('async function toggleExportWatchDetails()', 'exportWatchSummaryBar?.addEventListener("click"');
    assert.match(manual,/await refreshExportWatchPanel\(\)/);
    const excel=section('async function exportSelectedExcelScopes()', 'function ');
    assert.match(excel,/loadExportWatchChanges\(exportContext,\{force:true,cutoffMs\}\)/);
    assert.match(excel,/acknowledgeExportWatch\(exportContext,cutoffMs,acknowledgedIds\)/);
    const audit=section('async function logActivity(', 'async function logInlinePaymentChange(');
    assert.match(audit,/await addDoc\(/);
    assert.doesNotMatch(audit,/getDocs\(/);
    assert.doesNotMatch(audit,/scheduleExportWatchRefresh/);
});

test('collapsed View Changes control is renderable with zero Activity Log reads',()=>{
    const src=section('function renderExportWatchPanel(', 'async function refreshExportWatchPanel()');
    const bar={attributes:{},setAttribute(k,v){this.attributes[k]=v;}};
    const el=()=>({hidden:false,textContent:'',title:'',innerHTML:'',classList:{remove(){},add(){}}});
    const panel={hidden:true,querySelector:()=>bar};
    const details={hidden:false};
    const elems={panel,details,title:el(),add:el(),edit:el(),remove:el(),
        delta:el(),toggle:el(),head:el(),body:el()};
    const marker=el(),status=el();
    let readCount=0;
    const context={
        currentAuthUser:{uid:'admin'},currentUserProfile:{role:'Admin'},
        currentLanguage:'vi',exportWatchUserAllowed:()=>true,
        exportWatchContextCurrent:()=>true,
        exportWatchPanelEls:()=>elems,
        getExportWatchMarkerMs:()=>1000,exportWatchMarkerText:()=> '10:00 28/10',
        exportWatchEventRows:()=>[],
        exportWatchUiCopy:()=>({open:'Xem thay đổi'}),
        syncExportWatchTheme:()=>{},
        loadExportWatchChanges:()=>{readCount++;throw Error('Unexpected read');},
        document:{getElementById:id=>id==='exportWatchCopyStatus'?status:marker}
    };
    vm.createContext(context);
    vm.runInContext('let exportWatchPanelCache = null;\n'+src,context);
    vm.runInContext('renderExportWatchPanel(null)',context);
    assert.equal(panel.hidden,false);
    assert.equal(details.hidden,true);
    assert.equal(elems.toggle.textContent,'Xem thay đổi');
    assert.equal(elems.add.hidden,true);
    assert.equal(elems.edit.hidden,true);
    assert.equal(elems.remove.hidden,true);
    assert.equal(readCount,0);
});

test('only user-triggered click loads changes; subsequent expand/collapse stays local',async()=>{
    const src=section('const exportWatchSummaryBar =', 'function buildExcelWorksheetForScope(');
    const listeners=new Map();
    const bar={addEventListener:(type,callback)=>listeners.set(type,callback)};
    const details={hidden:true};
    const elems={panel:{hidden:false},details,toggle:{textContent:''}};
    let calls=0,renders=0;
    const context={
        currentLanguage:'vi',
        exportWatchPanelLoading:false,
        exportWatchPanelCache:null,
        exportWatchUserAllowed:()=>true,
        exportWatchPanelEls:()=>elems,
        exportWatchContext:()=>({uid:'u',month:'2026-10'}),
        exportWatchContextCurrent:c=>c?.uid==='u'&&c?.month==='2026-10',
        exportWatchEventRows:obj=>obj?.logs||[],
        renderExportWatchPanel:()=>{renders++;},
        refreshExportWatchPanel:async()=>{calls++;context.exportWatchPanelCache={
            context:{uid:'u',month:'2026-10'},logs:[{id:'log1',action:'ADD'}]};},
        document:{querySelector:()=>bar},
        console:{warn(){}},
        alert:()=>{throw Error('Unexpected alert');}
    };
    vm.createContext(context);
    vm.runInContext(src,context);
    assert.equal(calls,0,'Page boot must not fetch Activity Log');
    assert.equal(listeners.has('click'),true);
    await listeners.get('click')();
    assert.equal(calls,1);
    assert.equal(details.hidden,false);
    await listeners.get('click')();
    assert.equal(details.hidden,true);
    await listeners.get('click')();
    assert.equal(details.hidden,false);
    assert.equal(calls,1,'Expand/collapse must use existing loaded snapshot');
    assert.ok(renders>=3);
});
