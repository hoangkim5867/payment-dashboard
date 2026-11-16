'use strict';
const fs=require('node:fs'),path=require('node:path');
const PRODUCTION_PROJECT='cscecmep-payment';
function validateStagingConfig(config){
 if(!config||typeof config!=='object'||typeof config.projectId!=='string'||!/^[-a-z0-9]*staging[-a-z0-9]*$/.test(config.projectId)||config.projectId===PRODUCTION_PROJECT)throw Error('A separate Firebase staging project is required');
 for(const key of ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'])if(typeof config[key]!=='string'||!config[key])throw Error('Missing Firebase staging field: '+key);
 if(config.authDomain!==config.projectId+'.firebaseapp.com')throw Error('Auth domain must belong to staging project');
 if(![config.projectId+'.firebasestorage.app',config.projectId+'.appspot.com'].includes(config.storageBucket))throw Error('Storage must belong to staging project');
 return config;
}
function buildSite({source,output,target,stagingConfig,enableIndexQueries=false}){
 // Never enable against staging; production needs an explicit audited release gate.
 if(enableIndexQueries && target!=='production')throw Error('Indexed Payment reads may only be enabled after production audit');
 // Security hold: V1 client-derived keys are not validated by production Rules.
 // Three environment approvals cannot substitute for server-side enforcement.
 if(enableIndexQueries)throw Error('Payment index V1 release blocked: untrusted client keys are not validated by production Rules');
 if(!['staging','production'].includes(target))throw Error('Unknown deployment target');
 if(target==='staging')validateStagingConfig(stagingConfig);
 const src=path.resolve(source),out=path.resolve(output);if(out===src||out.startsWith(src+path.sep))throw Error('Output cannot overwrite or nest within source');
 fs.mkdirSync(out,{recursive:true});fs.cpSync(src,out,{recursive:true});
 // This Admin TEST page must never be bundled into the production site.
 if(target==='production')fs.rmSync(path.join(out,'s13-test-sync.html'),{force:true});
 let configs=0,indexReadGuards=0,v2PageGuards=0;
 for(const name of fs.readdirSync(out).filter(n=>n.endsWith('.html'))){const file=path.join(out,name);let text=fs.readFileSync(file,'utf8');const pattern=/const firebaseConfig\s*=\s*\{[\s\S]*?\};/g;
 text=text.replace(pattern,original=>{configs++;return target==='staging'?'const firebaseConfig='+JSON.stringify(stagingConfig)+';':original});
 if(target==='production'&&name==='cash-control.html'){
   // The catalog may include a legacy/external project without activity.
   // Limit the actual monthly audit to 35 ACTIVE projects, not 35 names.
   const oldGuard='manifest.month!==month||manifest.catalogProjects>35||';
   const newGuard='manifest.month!==month||manifest.catalogProjects>150||manifest.activeProjects>35||';
   if(!text.includes(oldGuard))throw Error('Monthly audit guard moved; refuse unsafe build');
   text=text.replace(oldGuard,newGuard);
   const oldHint='TEST không tự có dữ liệu production; không được xem 0 dòng là không phát sinh.';
   if(!text.includes(oldHint))throw Error('Monthly audit environment hint moved; refuse unsafe build');
   text=text.replace(oldHint,'Production: chỉ kiểm tra nguồn Cash Control theo tháng đã xác thực; chưa cấp phép ghi Google.');

   // Explain read-only outcomes without weakening any backend commit gate.
   const oldReview="item.result==='REVIEW_REQUIRED'?'Cần đối chiếu lịch sử / giao dịch':";
   const newReview="item.result==='REVIEW_REQUIRED'?(item.reviewCategory==='NEWER_CANDIDATES_ONLY'?('Có '+item.newerCandidates+' ứng viên mới; chưa cấp phép ghi'):item.reviewCategory==='DATE_ORDER_ONLY'?'Khớp dòng trong tháng; cảnh báo thứ tự ngày (chưa cấp phép ghi)':'Cần đối chiếu lịch sử / giao dịch'):";
   const oldNotReady="item.result==='SOURCE_NOT_READY'?'Nguồn chưa đủ điều kiện đọc Google':";
   const newNotReady="item.result==='SOURCE_NOT_READY'?('Nguồn chưa đủ điều kiện: '+String(item.reason||'chưa xác minh')):";
   if(!text.includes(oldReview)||!text.includes(oldNotReady))
     throw Error('Read-only report UI changed; refusing unchecked build');
   text=text.replace(oldReview,newReview).replace(oldNotReady,newNotReady);

   // Distinguish a missing opening balance from malformed source rows.
   // Never turn a blocked project's source into an eligible candidate.
   const oldGroup="g:{...g,state:'SOURCE_REVIEW_REQUIRED'};";
   const newGroup="g:{...g,state:'SOURCE_REVIEW_REQUIRED',sourceBlockReason:g.state!=='HISTORY_COMPARISON_CANDIDATE'?g.state:(r?.needsReview?'READINESS_REVIEW_REQUIRED':!Number.isFinite(balances[g.project])?'OPENING_BALANCE_NOT_VERIFIED':'SOURCE_REVIEW_REQUIRED')};";
   if(!text.includes(oldGroup))throw Error('Monthly source blocker moved; refusing unchecked build');
   text=text.replace(oldGroup,newGroup);

   // Show row positions and diagnostic categories for owner-only, read-only
   // review. These details remain in the browser, not the copied JSON.
   const oldDetailAnchor="        table.append(tr);\n      }\n      // Share only aggregate";
   const newDetailAnchor=`        table.append(tr);
        if(['ELYSIAN','EATON','FOXCONN','C17-2'].includes(item.project)&&
           Array.isArray(item.reviewRows)&&item.reviewRows.length){
          const detailTr=document.createElement('tr');
          const cell=document.createElement('td');cell.colSpan=6;
          const details=document.createElement('details');
          const summary=document.createElement('summary');
          summary.textContent='Xem '+item.reviewRows.length+' vị trí cần đối chiếu trong phiên Admin (chỉ đọc)';
          details.append(summary);
          const list=document.createElement('ol');
          for(const entry of item.reviewRows){
            const li=document.createElement('li');
            li.textContent=(entry.origin==='CASH_CONTROL'?'Xuất Excel dòng '+entry.sourceRow:
              'Google dòng '+entry.googleRow)+' · '+entry.date+
              ' · '+entry.code+
              (entry.googleRow&&entry.origin==='CASH_CONTROL'?' · đối chiếu Google dòng '+entry.googleRow:'')+
              (entry.changedFields?.length?' · khác: '+entry.changedFields.join(', '):'')+
              (entry.financialDifference===true?' · KHÁC CỘT TIỀN; KHÔNG GHI':'');
            list.append(li);
          }
          details.append(list);
          if(item.detailsTruncated){
            const note=document.createElement('p');
            note.textContent='Chỉ hiển thị tối đa 100 vị trí; không cấp phép ghi.';
            details.append(note);
          }
          cell.append(details);detailTr.append(cell);table.append(detailTr);
        }
        if(item.project==='PHU HUNG'&&item.result==='SOURCE_NOT_READY'){
          const detailTr=document.createElement('tr');
          const cell=document.createElement('td');cell.colSpan=6;
          const source=byProject.get('PHU HUNG');
          const readinessRow=readies.get('PHU HUNG');
          const reasons=[];
          if(source?.issues?.length){
            const counts=new Map();
            for(const issue of source.issues)counts.set(issue.code,(counts.get(issue.code)||0)+1);
            for(const [code,count] of counts)reasons.push(code+' ('+count+')');
          }
          if(readinessRow?.needsReview)reasons.push('READINESS_REVIEW_REQUIRED ('+readinessRow.needsReview+')');
          if(!Number.isFinite(balances['PHU HUNG']))reasons.push('OPENING_BALANCE_NOT_VERIFIED');
          cell.textContent='PHU HUNG · '+(reasons.join(' · ')||String(item.reason||'SOURCE_NOT_READY'))+
            ' · Không ghi Google; cần xác minh nguồn, không suy ra 0 phát sinh.';
          detailTr.append(cell);table.append(detailTr);
        }
      }
      // Share only aggregate`;
   if(!text.includes(oldDetailAnchor))throw Error('Monthly audit table moved; refuse unsafe build');
   text=text.replace(oldDetailAnchor,newDetailAnchor);

   // Include only safe row location/code diagnostics in the owner's copied
   // report: no amounts, transaction IDs, descriptions or Google sheet IDs.
   const oldSummaryTail="          dateReview:row.dateReview===true\n        }))";
   const newSummaryTail="          dateReview:row.dateReview===true,\n          reviewRows:['ELYSIAN','EATON','FOXCONN','C17-2'].includes(row.project)&&Array.isArray(row.reviewRows)?row.reviewRows.map(entry=>({origin:entry.origin,sourceRow:entry.sourceRow??null,googleRow:entry.googleRow??null,date:entry.date,code:entry.code,changedFields:entry.changedFields||[],financialDifference:entry.financialDifference===true})):[]\n        }))";
   if(!text.includes(oldSummaryTail))
     throw Error('Aggregate report shape changed; refusing unsafe build');
   text=text.replace(oldSummaryTail,newSummaryTail);

   // The owner explicitly supplied the already-tested PHU HUNG sheet URL.
   // Restore it when the Production browser has no local link.
   // Auth often initializes AFTER catalog bootstrap; do not require Admin\n   // identity for setting this inert browser-local URL.\n   // Never overwrite an existing draft, inspect Google on page load, or
   // grant production writer permission. The read-only scan checks gid/title.
   const loadDraft='  ccSyncProjectCatalogLoadDraft();';
   if(!text.includes(loadDraft))throw Error('Link draft bootstrap changed');
   const phuHungLink='https://docs.google.com/spreadsheets/d/1gOEvJmOCW9EV5zfBNyJZ35a8EtMZihI2yZyuKj93dVg/edit?gid=1049774332#gid=1049774332';
   // Join using an actual line feed. An escaped backslash-n in output would
   // become invalid JavaScript and blank the entire Cash Control page.
   const restoredLinkCode=[
     loadDraft,
     "  if(firebaseConfig.projectId==='cscecmep-payment'&&",
     "     !ccSyncProjectLinkDraft['PHU HUNG']&&ccSyncProjectLinkValid("+JSON.stringify(phuHungLink)+")){",
     "    ccSyncProjectLinkDraft['PHU HUNG']="+JSON.stringify(phuHungLink)+";",
     "    ccSyncProjectCatalogSaveDraft();",
     "  }"
   ].join(String.fromCharCode(10));
   text=text.replace(loadDraft,restoredLinkCode);





 }
 if(target==='staging'&&text.includes('cscecmep-payment.firebaseapp.com'))throw Error('Production Auth endpoint left in staging output');
 // Indexed V2 requires BOTH pages to ship the guarded query. Staging
 // always disables it, even when source has the release-ready code.
 if(['payment.html','payment-mobile-renderer.html'].includes(name)){
   if(!text.includes('const PAYMENT_INDEX_V2_QUERY_CODE_ENABLED = true;'))
     throw Error('Missing guarded Payment V2 query from '+name);
   v2PageGuards++;
   if(target==='staging')
     text=text.replace('const PAYMENT_INDEX_V2_QUERY_CODE_ENABLED = true;',
       'const PAYMENT_INDEX_V2_QUERY_CODE_ENABLED = false;');
 }
 // The server marker is a runtime safety gate, but a marker alone is not
 // authority to enable queries. A separate explicit *build* release gate is
 // required after a clean full backfill + production Rules verification.
 text=text.replace(/const (PAYMENT|MEP)_INDEX_QUERY_CODE_ENABLED = true;/g,(_,name)=>{indexReadGuards++;return 'const '+name+'_INDEX_QUERY_CODE_ENABLED = '+(enableIndexQueries && name==='PAYMENT'?'true':'false')+';'});
 fs.writeFileSync(file,text);
 }
 if(indexReadGuards!==3)throw Error('Expected three safe-read guards');
 const expectedConfigs=target==='staging'?10:9;
 if(configs!==expectedConfigs)throw Error('Unexpected Firebase app configurations: expected '+expectedConfigs+', got '+configs);
 if(v2PageGuards!==2)throw Error('Expected two guarded V2 pages');
 // Validate the actual HTML module after all build-time substitutions.
 // Checking only source modules does not catch accidentally injected tokens.
 if(target==='production'){
   const finalHtml=fs.readFileSync(path.join(out,'cash-control.html'),'utf8');
   const mainModule=finalHtml.split('<script type="module">')[1]?.split('</script>')[0];
   if(!mainModule)throw Error('Missing Cash Control main module in production build');
   require('node:child_process').execFileSync(process.execPath,
     ['--input-type=module','--check'],{input:mainModule,timeout:15000});
 }
 const writerSource=fs.readFileSync(path.join(out,'assets/js/firestore-payment.mjs'),'utf8');
 const contractV2ReadyToActivate=target==='production' &&
   writerSource.includes('PAYMENT_V2_WRITERS_ENABLED=true') && v2PageGuards===2;
 fs.writeFileSync(path.join(out,'release-environment.json'),JSON.stringify({target,firebaseProject:target==='staging'?stagingConfig.projectId:PRODUCTION_PROJECT,indexOptimizationEnabledByDefault:Boolean(enableIndexQueries),contractMasterMEPIndexEnabledByDefault:false,contractV2ReadyToActivate},null,2));
 return {target,configs,indexReadGuards,v2PageGuards,contractV2ReadyToActivate,firebaseProject:target==='staging'?stagingConfig.projectId:PRODUCTION_PROJECT};
}
module.exports={buildSite,validateStagingConfig};
if(require.main===module){
 require('../tests/deployment-gate.cjs');
 // Preserve the current main Payment V2 safeguards while validating only
 // the manually-triggered PHU HUNG Sheets code on this isolated release branch.
 require('node:child_process').execFileSync(process.execPath,[
   '--test',path.join(__dirname,'../tests/cash-sync-gate.test.cjs'),
   path.join(__dirname,'../tests/cash-payment-project-readonly.test.cjs'),
   path.join(__dirname,'../tests/cash-payment-google-readonly.test.cjs'),
   path.join(__dirname,'../tests/cash-sync-original-audit.test.cjs'),
   path.join(__dirname,'../tests/cash-sync-live-core.test.cjs'),
   path.join(__dirname,'../tests/cash-multi-project-core.test.cjs'),
   path.join(__dirname,'../tests/cash-multi-project-adapter.test.cjs'),
   path.join(__dirname,'../tests/cash-multi-project-api.test.cjs'),
   path.join(__dirname,'../tests/cash-shared-test-history-audit.test.cjs'),
   path.join(__dirname,'../tests/cash-shared-test-idempotency.test.cjs'),
   path.join(__dirname,'../tests/cash-google-ui-layout.test.cjs'),
   path.join(__dirname,'../tests/cash-sync-batch-readiness.test.mjs'),
   path.join(__dirname,'../tests/cash-sync-monthly-export-manifest.test.mjs'),
   path.join(__dirname,'../tests/cash-sync-monthly-google-readonly.test.mjs'),
   path.join(__dirname,'../tests/cash-sync-month-review-package.test.mjs'),
   path.join(__dirname,'../tests/cash-sync-source-readonly.test.cjs'),
   path.join(__dirname,'../tests/cash-sync-project-source-coverage.test.mjs'),
   path.join(__dirname,'../tests/cash-shared-test-real-compare.test.cjs'),
   path.join(__dirname,'../google-sheets-sync/pilot.test.cjs')
 ],{stdio:'inherit',timeout:60000});
 const target=process.env.VERCEL_ENV==='production'?'production':'staging';
 const stagingConfig=target==='staging'?JSON.parse(process.env.PAYMENT_FIREBASE_STAGING_CONFIG||'null'):null;
 const enableIndexQueries=target==='production' && process.env.PAYMENT_INDEX_PROD_OPTIMIZATION_APPROVED==='YES' &&
   process.env.PAYMENT_INDEX_PROD_RULES_VERIFIED==='YES' && process.env.PAYMENT_INDEX_PROD_BACKFILL_VERIFIED==='YES';
 console.log(JSON.stringify(buildSite({source:path.join(__dirname,'../site'),output:path.join(__dirname,'../build/site'),target,stagingConfig,enableIndexQueries})));
}
