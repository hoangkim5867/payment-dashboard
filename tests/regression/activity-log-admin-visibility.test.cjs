'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.resolve(__dirname,'../../site',file),'utf8');
for(const file of ['payment.html','payment-mobile-renderer.html']){
    test(file+' admin-only visibility is explicit and does not perform a Firestore read',()=>{
        const code=read(file);
        assert.match(code,/function activityLogsVisibleToViewer\(rows,includeAdmin=false\)/);
        assert.match(code,/\(isAdmin\(\) && includeAdmin\) \|\| !isAdminActivityLog\(item\)/);
        const js=code.slice(code.indexOf('function activityLogsVisibleToViewer('),code.indexOf('function activityLogsVisibleToViewer(')+200);
        const scope={isAdmin:()=>false,isAdminActivityLog:item=>item.operatorRole==='Admin'};
        vm.createContext(scope);vm.runInContext(js.slice(0,js.indexOf('\n}')+2),scope);
        const entries=[{operatorRole:'Admin',id:'a'},{operatorRole:'Staff',id:'s'}];
        assert.deepEqual(Array.from(scope.activityLogsVisibleToViewer(entries,true)).map(x=>x.id),['s'],'Staff may never reveal Admin logs');
        scope.isAdmin=()=>true;
        assert.deepEqual(Array.from(scope.activityLogsVisibleToViewer(entries,false)).map(x=>x.id),['s'],'Admin default hides own logs');
        assert.deepEqual(Array.from(scope.activityLogsVisibleToViewer(entries,true)).map(x=>x.id),['a','s'],'Admin can explicitly reveal logs');
    });
}
test('desktop retains raw pages and the visibility click only rerenders cached data',()=>{
 const html=read('payment.html');
 assert.match(html,/id="activityLogIncludeAdminBtn" hidden/);
 assert.match(html,/rawLogs: \[\]/);
 assert.match(html,/activityLogState\.rawLogs = reset/);
 const start=html.indexOf('activityLogIncludeAdminBtn.addEventListener("click"');
 const end=html.indexOf('activityLogMonthTrigger.addEventListener(',start);
 assert.ok(start>0&&end>start);
 const block=html.slice(start,end);
 assert.match(block,/if\(!isAdmin\(\)\) return/);
 assert.match(block,/renderActivityLogRows\(\)/);
 assert.doesNotMatch(block.replace(/\/\/[^\n]*/g,''),/getDocs|renderActivityLog\(/);
 assert.match(html,/docs\.length === ACTIVITY_LOG_PAGE_SIZE/);
});
test('mobile cached-only toggle avoids network and resets on reopening',()=>{
 const html=read('payment-mobile-renderer.html');
 assert.match(html,/id="mobileActivityLogIncludeAdminBtn" hidden/);
 assert.match(html,/if\(!cachedOnly\)\{/);
 const a=html.indexOf('mobileActivityLogIncludeAdminBtn.addEventListener("click"');
 const b=html.indexOf('activityLogBtn.addEventListener(',a);
 assert.ok(a>0&&b>a);
 const block=html.slice(a,b);
 assert.match(block,/renderActivityLog\(\{cachedOnly:true\}\)/);
 assert.doesNotMatch(block,/getDocs/);
 assert.match(html,/mobileActivityLogRawLogs = \[\];\s*mobileActivityLogShowAdmin = false/);
});
