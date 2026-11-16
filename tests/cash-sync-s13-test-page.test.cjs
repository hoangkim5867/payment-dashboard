'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const html=readFileSync(path.join(__dirname,'../site/s13-test-sync.html'),'utf8');
test('isolated S13 TEST page is built with staging Firebase config, never embeds prod Firebase origin',()=>{
 assert.match(html,/const firebaseConfig=\{/);
 assert.match(html,/getAuth\(app\)/);
 assert.doesNotMatch(html,/cscecmep-payment\.firebaseapp\.com/);
 assert.match(html,/https:\/\/www\.googleapis\.com\/auth\/spreadsheets/);
 assert.match(html,/1vmWWQVInXPtT95n5G-tHEY66YobMO0jLCxFftyAKD9k/);
 assert.doesNotMatch(html,/1s7-EZqTfS_6raZDxpK74m5gxDoAbRwBIJptCkG2lyUg/);
});
test('S13 TEST page performs signed preview-commit-readback and idempotent repeat with no original ledger mutation',()=>{
 for(const needle of ["/api/cash-sync-s13-test","getIdToken()",
  "await call('preview',rows)","await call('commit',rows",
  "await call('preview',rows)","noWrite.mode!=='unchanged'",
  "saved.mode!=='verified'","saved.writes!==1",
  "noWrite.writes!==0","expectedMonthClosing=-72663856"
 ])assert.ok(html.includes(needle),'missing '+needle);
 assert.doesNotMatch(html,/setDoc\(|addDoc\(|writeBatch\(|:batchUpdate|:\s*append/);
});
test('S13 TEST inline JavaScript parses',()=>{
 const a=html.indexOf('<script type="module">'),b=html.indexOf('</script>',a);
 assert.ok(a>=0&&b>a);
 const script=html.slice(a+'<script type="module">'.length,b);
 const parsed=spawnSync(process.execPath,['--check','--input-type=module'],{input:script,encoding:'utf8'});
 assert.equal(parsed.status,0,parsed.stderr||parsed.stdout);
});
