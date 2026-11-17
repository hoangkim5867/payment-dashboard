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
   // PHU HUNG uses its ALREADY ACTIVATED original-live pipeline:
   // visible "PHU HUNG" + hidden "DATA_CASHCONTROL" +
   // hidden "PHU_HUNG_HISTORY_BACKUP". Do not drive that workbook through
   // the new "CASHCONTROL_VIEW" writer: it misdiagnoses a healthy pilot
   // as a half-created technical-tab pair. Other projects use shared sync.
   const pilotStandalone="const sourceComplete=project!=='PHU HUNG'&&\n          group.state==='HISTORY_COMPARISON_CANDIDATE'&&";
   const pilotShared="const sourceComplete=group.state==='HISTORY_COMPARISON_CANDIDATE'&&";
   if(!text.includes(pilotStandalone)&&!text.includes(pilotShared))
     throw Error('PHU HUNG monthly source branch anchor moved');
   text=text.replace(pilotShared,pilotStandalone);

   if(!text.includes("          return {id:row.id,project,month,values,hash:await ccGoogleSyncSha(values)};"))throw Error('Monthly Google runner contract 0 moved');
   text=text.replace("          return {id:row.id,project,month,values,hash:await ccGoogleSyncSha(values)};","          return {id:row.id,project,month,values,hash:await ccGoogleSyncSha(values),\n            sourceClass:row.sourceClass,members:row.members};");
   if(!text.includes("        targets.push({project,month,source,activityConfirmed:true,"))throw Error('Monthly Google runner contract 1 moved');
   text=text.replace("        targets.push({project,month,source,activityConfirmed:true,","        targets.push({project,month,revision,source,activityConfirmed:true,");
   if(!text.includes("        if(!response.ok)throw Error(String(result.error||'Máy chủ chặn đồng bộ')+\n          (result.blocked?.length?' · '+result.blocked.length+' khoản cần kiểm tra':''));"))throw Error('Monthly Google runner contract 2 moved');
   text=text.replace("        if(!response.ok)throw Error(String(result.error||'Máy chủ chặn đồng bộ')+\n          (result.blocked?.length?' · '+result.blocked.length+' khoản cần kiểm tra':''));","        if(!response.ok){\n          const blocked=Error(String(result.error||'Máy chủ chặn đồng bộ')+\n            (result.blocked?.length?' · '+result.blocked.length+' khoản cần kiểm tra':'')+\n            (Array.isArray(result.sourceBlockers)&&result.sourceBlockers.length?\n              ' · MÃ NGUỒN: '+result.sourceBlockers.join(', '):''));\n          // A signed, same-origin pre-write refusal is safe to skip. Network\n          // failures or missing evidence still halt remaining Google writes.\n          blocked.safeBeforeWrite=input.action==='commit'&&\n            result.writeAttempted===false&&result.writes===0;\n          throw blocked;\n        }");
   const oldWrongPayment="        const wrongPayment=records.some(r=>r.sourceClass==='PAYMENT'&&\n          (!r.values[2].trim()||!r.values[4].trim()));\n        const sourceComplete=project!=='PHU HUNG'&&\n          group.state==='HISTORY_COMPARISON_CANDIDATE'&&\n          !sourceIssues.length&&!ready?.needsReview&&\n          !ready?.transferCounterpartsUnverified&&!wrongPayment;";
   const newerPaymentEligibility="        // Not every paid Payment is a contract/IPC item (e.g. bank fees).\n        // The server checks immutable Payment IDs, paid dates and money types.\n        const sourceComplete=project!=='PHU HUNG'&&\n          group.state==='HISTORY_COMPARISON_CANDIDATE'&&\n          !sourceIssues.length&&!ready?.needsReview&&\n          !ready?.transferCounterpartsUnverified;";
   if(!text.includes(oldWrongPayment))throw Error('Shared Payment eligibility anchor moved');
   text=text.replace(oldWrongPayment,newerPaymentEligibility);
   const oldPilotMessage="        if(!sourceComplete)mark(project,'Nguồn chưa đủ điều kiện, sẽ bỏ qua.');";
   const newPilotMessage="        if(!sourceComplete)mark(project,project==='PHU HUNG'?\n          'Đã kích hoạt Google bằng luồng PHU HUNG riêng; không ghi lặp qua luồng chung.':\n          'Nguồn chưa đủ điều kiện, sẽ bỏ qua.');";
   if(!text.includes(oldPilotMessage))throw Error('PHU HUNG pilot status anchor moved');
   text=text.replace(oldPilotMessage,newPilotMessage);
   // Distinguish PREVIEW READY from a user-approved real Google commit.
   const batchStatusBase="      status.textContent=month+' · '+manifest.activeProjects+'/'+manifest.catalogProjects+";
   if(!text.includes(batchStatusBase))
     throw Error('Monthly Google commit status anchor moved');
   text=text.replace(batchStatusBase,
     "      status.textContent=(result.mode==='NOT_APPROVED'?" +
     "'CHƯA GHI: đã hủy hộp xác nhận; bấm Đồng bộ và chọn OK nếu muốn ghi các dự án READY. · ':'' )+"+
     "month+' · '+manifest.activeProjects+'/'+manifest.catalogProjects+");
   // The catalog may include a legacy/external project without activity.
   // Limit the actual monthly audit to 35 ACTIVE projects, not 35 names.
   const oldGuard='manifest.month!==month||manifest.catalogProjects>35||';
   const newGuard='manifest.month!==month||manifest.catalogProjects>150||manifest.activeProjects>35||';
   if(!text.includes(oldGuard))throw Error('Monthly audit guard moved; refuse unsafe build');
   text=text.replace(oldGuard,newGuard);
   const oldHint='TEST không tự có dữ liệu production; không được xem 0 dòng là không phát sinh.';
   if(!text.includes(oldHint))throw Error('Monthly audit environment hint moved; refuse unsafe build');
   text=text.replace(oldHint,'Production: dùng nguồn Cash Control đã xác thực; ghi khi vượt kiểm tra mã chứng từ, số dư và quyền file Google.');

   // Classify the single scoped month audit in memory: zero new network calls.
   // The S13-2 October owner-confirmed write is a release checkpoint, not
   // new source candidates returned by a historical-only Google scan.
   const decisionImport="import {scanMonthlyGoogleReadOnly} from \"./assets/js/cash-sync-monthly-google-readonly.mjs\";";
   if(!text.includes(decisionImport))throw Error('Monthly audit import moved');
   text=text.replace(decisionImport,decisionImport+'\n'+"import {classifyMonthlyAudit} from \"./assets/js/cash-sync-batch-decisions.mjs\";");
   const releaseFunction='import {buildBatchReleasePlan,executeCertifiedBatch} from "./assets/js/cash-sync-batch-release.mjs";';
   // Keep one user click: release planning consumes the very same grouped
   // Export Excel snapshot & Google readonly scan, no extra browser actions.
   text=text.replace('import {classifyMonthlyAudit} from "./assets/js/cash-sync-batch-decisions.mjs";',
     'import {classifyMonthlyAudit} from "./assets/js/cash-sync-batch-decisions.mjs";\n'+releaseFunction);
   const auditEndAnchor="      if(!requireOwner())throw Error('Phiên Admin thay đổi sau khi đối chiếu.');\n      const table=document.createElement('table');";
   if(!text.includes(auditEndAnchor))throw Error('Monthly audit display moved');
   text=text.replace(auditEndAnchor,
     "      if(!requireOwner())throw Error('Phiên Admin thay đổi sau khi đối chiếu.');\n"+"\n      const actionQueue=classifyMonthlyAudit({month,results:scan.results});\n      const batchRelease=buildBatchReleasePlan({month,revision,manifest,scan});\n      if(batchRelease.googleWrites!==0||batchRelease.readyToCommit!==0||batchRelease.canCommit!==false)\n        throw Error('Kế hoạch đồng bộ chung chưa được khóa an toàn.');\n      if(actionQueue.canWrite!==false||actionQueue.sourceComplete!==false||\n         actionQueue.googleWrites!==0||actionQueue.writeReadyProjects!==0)\n        throw Error('Bảng công việc theo lô chưa an toàn: khóa ghi chưa đóng.');\n      const summaryArea=document.createElement('div');\n      summaryArea.style.cssText='border:1px solid #dbe4f0;border-radius:9px;padding:10px;margin-bottom:10px;background:#fff';\n      const intro=document.createElement('p');\n      intro.style.cssText='font-size:13px;font-weight:750;margin:0 0 6px';\n      intro.textContent='KẾT QUẢ 1 LƯỢT / '+month+' · '+actionQueue.projects+\n        ' dự án có phát sinh · '+actionQueue.counts.completed+\n        ' hoàn tất theo nhật ký Admin · '+actionQueue.counts.noDifference+\n        ' không phát hiện dòng mới trong sổ gốc · '+\n        actionQueue.counts.newCandidateReview+' có ứng viên cần xác minh · '+\n        actionQueue.counts.historyReview+' cần đối chiếu lịch sử/ID (trong đó '+\n        actionQueue.dateOrderOnly.length+' chỉ cảnh báo thứ tự ngày) · '+\n        actionQueue.counts.needsSetup+' thiếu nguồn/link · 0 dự án được phép ghi.';\n      summaryArea.append(intro);\n      const releaseLine=document.createElement('p');\n      releaseLine.style.cssText='font-size:12px;color:#374151;margin:3px 0 6px';\n      releaseLine.textContent='CHUẨN BỊ ĐỒNG BỘ CHUNG · '+batchRelease.activeProjects+\n       ' dự án có phát sinh: '+batchRelease.counts.alreadyComplete+' đã xong, '+\n       batchRelease.counts.historyEqual+' không cần ghi, '+batchRelease.counts.dateOnly+\n       ' chỉ cảnh báo thứ tự ngày, '+batchRelease.counts.needsSourceProof+\n       ' chờ xác minh ID nguồn, '+batchRelease.counts.needsReconciliation+\n       ' cần đối chiếu giao dịch, '+batchRelease.counts.missingSetup+\n       ' thiếu nguồn/link. Chỉ lập kế hoạch, chưa ghi.';\n      summaryArea.append(releaseLine);\n      const hint=document.createElement('p');\n      hint.style.cssText='font-size:12px;color:#546276;margin:0 0 5px';\n      hint.textContent='Chỉ nhóm từ dữ liệu vừa đọc, không quét lại; các dự án chưa đủ bằng chứng không được tự chuyển sang ghi. S13-2 đã ghi 3 khoản tháng 10 theo xác nhận Admin, không ghi lại.';\n      summaryArea.append(hint);\n      const categories=[\n       ['completed','Đã hoàn tất, không ghi lại'],\n       ['noDifference','Không có dòng mới trong lịch sử đã đọc'],\n       ['newCandidateReview','Ứng viên mới, chưa đủ điều kiện ghi'],\n       ['historyReview','Cần đối chiếu lịch sử, ID hoặc số dư'],\n       ['needsSetup','Cần link/nguồn trước khi đọc Google']\n      ];\n      for(const [key,title] of categories){\n        const entries=actionQueue.groups[key];\n        if(!entries.length)continue;\n        const details=document.createElement('details');\n        details.style.cssText='font-size:12px;margin-top:5px';\n        const head=document.createElement('summary');\n        head.style.cssText='cursor:pointer;font-weight:650';\n        head.textContent=title+' ('+entries.length+')';\n        details.append(head);\n        const rows=document.createElement('p');\n        rows.style.cssText='padding:3px 0 1px 12px;margin:0;color:#4b5563;line-height:1.65';\n        rows.textContent=entries.map(x=>x.project).join(' · ');\n        details.append(rows);\n        summaryArea.append(details);\n      }\n"+"\n      const table=document.createElement('table');");
   // Source examination uses one bounded Payment-date query, never a background listener.
   const originalSummaryAnchor="      const summaryArea=document.createElement('div');";
   const sourceProofSnippet="\n      // Exactly ONE Admin-triggered independent source request for the entire\n      // selected month, not 35 per-project Payment collection scans.\n      // Admin's browser sends ORIGINAL member IDs; server compares those\n      // against protected cash/legacy and indexed paid-date Payment docs.\n      // A success is NARROW evidence, NEVER permission to write.\n      let independentSource=null,projectsForProof=[];\n      try{\n        const candidatesByProject=new Map(batchRelease.groups.needsSourceProof\n          .map(row=>[row.project,row.candidateSourceRows]));\n        const proofGroups=manifest.groups.filter(g=>\n          candidatesByProject.has(g.project)&&g.records?.length===g.groupedExcelRows&&\n          g.records.length<=1000&&\n          candidatesByProject.get(g.project).length>0);\n        if(proofGroups.length&&proofGroups.length<=35){\n          status.textContent='Đang xác minh ID nguồn tháng '+month+\n            ' độc lập trên máy chủ; 0 Google writes…';\n          projectsForProof=await Promise.all(proofGroups.map(async group=>{\n            const records=await Promise.all(group.records.map(async rec=>{\n              const payload=rec.values.length===13?[...rec.values,0]:rec.values;\n              const digest=await crypto.subtle.digest('SHA-256',\n                new TextEncoder().encode(JSON.stringify(payload)));\n              const hash=Array.from(new Uint8Array(digest),\n                n=>n.toString(16).padStart(2,'0')).join('');\n              return {id:rec.id,project:rec.project,month:rec.month,\n                sourceClass:rec.sourceClass,values:rec.values,\n                members:rec.members,hash};\n            }));\n            return {project:group.project,records};\n          }));\n          if(!requireOwner()||Number(cashCloudState.revision||0)!==revision)\n            throw Error('Phiên Admin hoặc nguồn đã đổi trong lúc xác minh.');\n          const proofResponse=await fetch('/api/cash-sync-source-readonly',{\n            method:'POST',headers:{\n              'Content-Type':'application/json',\n              'X-Firebase-ID-Token':await currentAuthUser.getIdToken()\n            },body:JSON.stringify({action:'verify_monthly_projects',\n              candidateOnly:true,month,revision,\n              projects:projectsForProof.map(group=>({project:group.project,\n                records:group.records.filter((_,i)=>\n                  candidatesByProject.get(group.project).includes(i+1))}))})\n          });\n          const proofData=await proofResponse.json().catch(()=>({}));\n          if(!proofResponse.ok)\n            throw Error(String(proofData.error||'Lỗi kiểm tra nguồn.').slice(0,130));\n          if(proofData.kind!=='INDEPENDENT_MONTHLY_SOURCE_BATCH_READONLY_V1'||\n             proofData.month!==month||proofData.revision!==revision||\n             proofData.checkedProjects!==proofGroups.length||\n             proofData.newlyAppendedOnly!==true||\n             proofData.sourceComplete!==false||\n             proofData.canWrite!==false||proofData.googleWrites!==0)\n            throw Error('Máy chủ trả chứng nhận nguồn không hợp lệ.');\n          independentSource=proofData;\n        }\n      }catch(error){\n        independentSource={checkedProjects:0,eligibleForFurtherReview:0,\n          error:String(error?.message||error).slice(0,130)};\n      }\n      if(!requireOwner()||Number(cashCloudState.revision||0)!==revision)\n        throw Error('Phiên Admin hoặc nguồn đã thay đổi sau xác minh nguồn.');\n";
   if(!text.includes(originalSummaryAnchor))throw Error('Batch release summary anchor moved');
   text=text.replace(originalSummaryAnchor,sourceProofSnippet+'\n'+originalSummaryAnchor);
   const independentSummaryAnchor="      summaryArea.append(releaseLine);";
   if(!text.includes(independentSummaryAnchor))throw Error('Batch release summary element moved');
   text=text.replace(independentSummaryAnchor,independentSummaryAnchor+"\n      const proofLine=document.createElement('p');\n      proofLine.style.cssText='font-size:12px;color:#374151;margin:3px 0 6px';\n      proofLine.textContent='NGUỒN MÁY CHỦ: '+(independentSource?.error?('CHƯA XÁC MINH: '+independentSource.error):\n       ((independentSource?.eligibleForFurtherReview||0)+'/'+(independentSource?.checkedProjects||0)+\n        ' dự án qua bước kiểm tra Payment tháng theo ID; nguồn lương/thuế/điều chuyển vẫn phải xử lý riêng.'))+\n        ' · Cấp phép ghi: 0.'+\n        ((independentSource?.projects||[]).filter(x=>x.verified!==true).length?\n          ' · MÃ LỖI NGUỒN: '+(independentSource.projects||[]).filter(x=>x.verified!==true)\n            .slice(0,12).map(x=>x.project+' ['+(Array.isArray(x.blockers)?\n              x.blockers.filter(code=>/^[A-Z0-9_]{3,96}$/.test(code)).slice(0,6).join(', '):\n              'SOURCE_CHECK_FAILED')+']').join(' | '):'');\n      summaryArea.append(proofLine);");
   // Final manual release button is physically hidden unless Firebase source,
   // signed Google preview and exact server allowlist all agree.
   const finalBatchButton="\n      const freshProofs=new Map((independentSource?.projects||[])\n        .filter(x=>x?.verified===true&&typeof x.sourceFingerprint==='string'&&\n          /^[a-f0-9]{64}$/.test(x.sourceFingerprint))\n        .map(x=>[x.project,x]));\n      const originalRowsByProject=new Map(projectsForProof\n        .map(g=>[g.project,g.records]));\n      const sessionStable=()=>requireOwner()&&\n        Number(cashCloudState.revision||0)===revision&&\n        String($('ccSyncBatchMonth')?.value||'')===month;\n      const batchGoogleTarget=project=>{\n        const raw=links[project];\n        if(!ccSyncProjectLinkValid(raw))return null;\n        const u=new URL(raw);\n        const spreadsheetId=u.pathname.match(/\\/spreadsheets\\/d\\/([A-Za-z0-9_-]{20,100})/)?.[1];\n        const gidRaw=u.hash.match(/(?:^|[&#])gid=(\\d+)/)?.[1]||\n          u.searchParams.get('gid');\n        if(!spreadsheetId||!/^\\d{1,10}$/.test(String(gidRaw||'')))return null;\n        const historySheetId=Number(gidRaw);\n        return Number.isSafeInteger(historySheetId)?\n          {spreadsheetId,historySheetId}:null;\n      };\n      const scopedGoogleAPI=async(body,googleToken)=>{\n        if(!sessionStable())throw Error('Phiên hoặc tháng đã thay đổi');\n        const response=await fetch('/api/cash-sync-multi-project',{\n          method:'POST',\n          headers:{'Content-Type':'application/json',\n            Authorization:'Bearer '+googleToken,\n            'X-Firebase-ID-Token':await currentAuthUser.getIdToken()},\n          body:JSON.stringify(body)\n        });\n        const result=await response.json().catch(()=>({}));\n        if(!response.ok)throw Error(String(result.error||'API Google không xác minh được').slice(0,130));\n        return result;\n      };\n      const prepareGooglePayload=(project)=>{\n        const rows=originalRowsByProject.get(project),destination=batchGoogleTarget(project);\n        const closing=balances[project];\n        if(!Array.isArray(rows)||!rows.length||rows.length>1000||\n           !destination||!Number.isFinite(closing))return null;\n        return {project,month,revision,...destination,\n          source:rows,openingBalance:null,expectedMonthClosing:closing};\n      };\n      // This list is empty unless three INDEPENDENT gates agree:\n      // Cash source against live Firestore, Google preview matching new row\n      // count/closing, and server's exact project+month release allowlist.\n      const readyBatchItems=[];\n      const verifiedPreviews=[];\n      const previewFailures=[];\n      for(const candidate of batchRelease.groups.needsSourceProof){\n        const project=candidate.project,evidence=freshProofs.get(project);\n        if(!evidence||!sessionStable())continue;\n        const payload=prepareGooglePayload(project);\n        const expectedNew=(candidate.newerCandidates||0)+(candidate.backfillCandidates||0);\n        if(!payload||expectedNew<1)continue;\n        try{\n          const signed=await scopedGoogleAPI({...payload,action:'preview'},token);\n          if(signed.mode!=='preview'||signed.writes!==0||\n             signed.summary?.project!==project||\n             signed.summary?.month!==month||signed.summary?.originalUntouched!==true||\n             signed.summary?.newRows!==expectedNew||\n             signed.summary?.changes<expectedNew||\n             !Number.isFinite(signed.summary?.monthClosingBalance)||\n             Math.abs(signed.summary.monthClosingBalance-payload.expectedMonthClosing)>0.001){\n            previewFailures.push(project+' · Kết quả xem trước chưa khớp');\n            continue;\n          }\n          verifiedPreviews.push(project+' · '+signed.summary.newRows+' dòng mới · số dư '+\n            signed.summary.monthClosingBalance.toLocaleString('vi-VN')+' đ');\n          if(signed.writeConfigured!==true)continue;\n          readyBatchItems.push({...payload,writeConfigured:true,\n            newRows:signed.summary.newRows,\n            sourceCertification:{verified:true,project,month,revision,\n              serverProof:evidence.sourceFingerprint}});\n        }catch(error){\n          previewFailures.push(project+' · '+String(error?.message||error).slice(0,130));\n        }\n      }\n      if(!sessionStable())throw Error('Phiên Admin hoặc nguồn đã thay đổi.');\n      const batchCommitButton=document.createElement('button');\n      batchCommitButton.type='button';\n      batchCommitButton.className='btn';\n      batchCommitButton.hidden=readyBatchItems.length===0;\n      batchCommitButton.style.marginTop='9px';\n      batchCommitButton.textContent='Xác nhận ghi '+readyBatchItems.length+\n        ' dự án đã được chứng nhận · Production';\n      releaseLine.textContent+=' · SẴN SÀNG CHỜ ADMIN XÁC NHẬN: '+\n        readyBatchItems.length+' dự án, chỉ đúng tháng và file được máy chủ mở.';\n      batchCommitButton.addEventListener('click',async()=>{\n        if(batchCommitButton.disabled||!sessionStable())return;\n        batchCommitButton.disabled=true;\n        try{\n          if(!navigator.locks)throw Error('Trình duyệt không hỗ trợ khóa thao tác đồng bộ.');\n          await navigator.locks.request('cash-control-google-sync',\n            {ifAvailable:true},async lock=>{\n              if(!lock)throw Error('Có một tab khác đang đồng bộ, KHÔNG ghi lại.');\n              if(!sessionStable())throw Error('Nguồn/tháng thay đổi; KHÔNG ghi.');\n              const googleWriteToken=await ccGoogleSheetsAccessToken(\n                'https://www.googleapis.com/auth/spreadsheets',\n                {includeGrantedScopes:false,prompt:'consent'});\n              if(!sessionStable())throw Error('Phiên Admin thay đổi trước khi xác nhận.');\n              const result=await executeCertifiedBatch({\n                items:readyBatchItems,month,revision,\n                sessionCurrent:sessionStable,\n                confirm:async list=>{\n                  const lines=list.map(item=>{\n                    const original=readyBatchItems.find(x=>x.project===item.project);\n                    return item.project+' · '+item.newRows+' dòng mới · số dư tháng dự kiến '+\n                      Number(original.expectedMonthClosing).toLocaleString('vi-VN')+' đ';\n                  });\n                  return window.confirm('GHI GOOGLE PRODUCTION CHỈ '+month+\n                    '\\n'+lines.join('\\n')+\n                    '\\nChỉ ghi tab kỹ thuật, giữ nguyên sổ lịch sử. '+\n                    'Nếu một lần ghi có trạng thái không chắc chắn, hệ thống dừng và KHÔNG thử lại.'+\n                    '\\nBấm OK để chấp thuận thực sự ghi.');\n                },\n                preview:async item=>scopedGoogleAPI({\n                  action:'preview',project:item.project,month:item.month,\n                  revision:item.revision,spreadsheetId:item.spreadsheetId,\n                  historySheetId:item.historySheetId,source:item.source,\n                  openingBalance:item.openingBalance,\n                  expectedMonthClosing:item.expectedMonthClosing\n                },googleWriteToken),\n                commit:async(item,signature)=>scopedGoogleAPI({\n                  action:'commit',project:item.project,month:item.month,\n                  revision:item.revision,spreadsheetId:item.spreadsheetId,\n                  historySheetId:item.historySheetId,source:item.source,\n                  openingBalance:item.openingBalance,\n                  expectedMonthClosing:item.expectedMonthClosing,\n                  signature,confirm:'SYNC_THIS_PROJECT'\n                },googleWriteToken)\n              });\n              if(result.status==='verified'||result.status==='verified_partial'||result.status==='cancelled'){\n                status.textContent='ĐỒNG BỘ CHUNG · '+result.status+\n                  ' · đã xác minh ghi '+(result.written||[]).length+\n                  ' dự án · đã có/bỏ qua '+(result.skipped||[]).length+\n                  ' dự án · lỗi xem trước (CHƯA GHI) '+(result.blocked||[]).length+\n                  ((result.blocked||[]).length?' · '+result.blocked.map(x=>x.project+': '+x.reason).join(' | '):'')+\n                  ' · không tự ghi lại S13-2.';\n              }else{\n                status.textContent='DỪNG AN TOÀN · '+result.status+\n                  ' · dự án '+String(result.project||'')+\n                  ' · đã ghi '+(result.written||[]).length+\n                  ' dự án. Nếu có ghi không chắc chắn: CHỈ ĐỌC LẠI, KHÔNG BẤM GHI LẦN HAI.';\n              }\n            });\n        }catch(e){\n          status.textContent='DỪNG đồng bộ chung: '+\n            String(e?.message||e).slice(0,160)+\n            '. Không tự thử lại; nếu đã gửi lệnh hãy kiểm tra trạng thái Google.';\n        }finally{\n          // Do not allow a stale second click after any successful or\n          // uncertain attempt. A new signed Admin audit is mandatory.\n          batchCommitButton.hidden=true;\n          batchCommitButton.disabled=true;\n        }\n      });\n      for(const [title,items] of [\n        ['Nguồn độc lập chưa đạt', (independentSource?.projects||[])\n          .filter(item=>!item.verified)\n          .map(item=>item.project+' · '+(item.blockers||[]).join(', '))],\n        ['Xem trước Google chưa khớp',previewFailures],\n        ['Đã đối chiếu nguồn, số dư và giao dịch thiếu',verifiedPreviews]\n      ]){\n        if(!items.length)continue;\n        const details=document.createElement('details');\n        const heading=document.createElement('summary');\n        heading.textContent=title+' ('+items.length+')';\n        details.append(heading);\n        const list=document.createElement('ul');\n        for(const item of items){\n          const entry=document.createElement('li');\n          entry.textContent=item;\n          list.append(entry);\n        }\n        details.append(list);\n        summaryArea.append(details);\n      }\n      summaryArea.append(batchCommitButton);\n";
   const proofSummaryAnchor="      summaryArea.append(proofLine);";
   if(!text.includes(proofSummaryAnchor))throw Error('Batch proof summary hook moved');
   text=text.replace(proofSummaryAnchor,proofSummaryAnchor+'\n'+finalBatchButton);
   const oldOutput="output.replaceChildren(table,copy);output.hidden=false;";
   if(!text.includes(oldOutput))throw Error('Monthly audit output moved');
   text=text.replace(oldOutput,"output.replaceChildren(summaryArea,table,copy);output.hidden=false;");
   const oldShare="        sourceComplete:false,writeApproved:false,\n        projects:scan.results.map(row=>({";
   if(!text.includes(oldShare))throw Error('Monthly audit share metadata moved');
   text=text.replace(oldShare,
    "        sourceComplete:false,writeApproved:false,\n        batchRelease:{schema:batchRelease.schema,counts:batchRelease.counts,\n          readyToCommit:0,googleWrites:0},\n        actionQueue:{schema:actionQueue.schema,counts:actionQueue.counts,\n          writeReadyProjects:0,googleWrites:0,\n          projects:Object.values(actionQueue.groups).flat().map(x=>({project:x.project,stage:x.stage}))},\n        projects:scan.results.map(row=>({");
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
   // ELYSIAN: distinguish true 6/1 one-sided rows from alternate plan 14/62.
   // Reuse in-memory Google source and Payment; never change matching counts.
   const elysianStart="    if(independentSummary)independentSummary.hidden=true;";
   if(!text.includes(elysianStart))throw Error('ELYSIAN comparison UI anchor moved');
   text=text.replace(elysianStart,elysianStart+"\n    const elysianReview=project==='ELYSIAN'?\n      auditor.reviewElysianExceptions(payload.values,source,matched):null;\n    if(elysianReview&&independentSummary){\n      const monthLine=elysianReview.oneSidedByMonth\n        .map(r=>r.month+': Cash Control riêng '+r.cash+', Google riêng '+r.google)\n        .join(' · ');\n      const possible=elysianReview.possibleTransferCounterparts;\n      const transferLine=possible.map(r=>{\n        const fmt=n=>n===null?'không xác định':Number(n).toLocaleString('vi-VN')+' đ';\n        const changes=r.differingCategories.map(c=>\n          c.category+' (Cash '+fmt(c.source)+' / Google '+fmt(c.google)+')').join('; ');\n        return 'Hoàn vay dòng Cash '+r.sourcePosition+\n          ' ↔ Google '+r.googleRow+': Cash ròng '+fmt(r.sourceNet)+\n          ', Google ròng '+fmt(r.googleNet)+\n          (r.oppositeNet?' · NGƯỢC DẤU':r.sameAbsoluteNet?' · CÙNG ĐỘ LỚN':'')+\n          ', khác cột: '+(changes||'không có')+\n          '. Chưa xác minh ID; KHÔNG TỰ GHI / GHÉP TRÙNG.';\n      }).join(' ');\n      independentSummary.textContent=\n        'ELYSIAN · CHỈ ĐỌC / 0 GHI · '+\n        monthLine+'. Tổng phạm vi từ 10/2026: '+\n        matched.matched+' ứng viên cùng ngày và 7 cột tiền (chưa là ID khớp), '+\n        matched.cashOnly+' chỉ Cash Control, '+\n        matched.historicalOnly+' chỉ Google. '+\n        elysianReview.payrollMetadataPositions.length+\n        ' khoản nhân sự khác metadata, KHÔNG yêu cầu HĐ/IPC; '+\n        elysianReview.leaveIdentityPositions.length+\n        ' khoản nghỉ phép cần xác minh nhân sự. '+\n        (transferLine||'Chưa phát hiện cặp hoàn vay có mô tả cùng ngày.')+\n        ' Các mục cần kiểm chứng: thuế TNCN quý III và bốn khoản thầu phụ 13/11; '+\n        'không đưa khoản tháng 11 vào danh sách ghi tháng 10. '+\n        'Payment 630 đã tải so với 631 tên chuẩn chưa chứng minh mất hồ sơ. '+\n        'Lịch sử có 3 ngày đảo thứ tự, 0 sai số dư. '+\n        'Kế hoạch 14/62 là bộ thuật toán khác, KHÔNG phải 14 khoản mới. '+\n        'Sổ gốc giữ nguyên; chưa cấp phép đồng bộ.';\n      independentSummary.hidden=false;\n    }");
   const plannerGuard="if(independentSummary&&generalPlanner?.planProject&&project!=='FOXCONN'){";
   if(!text.includes(plannerGuard))throw Error('Independent monthly planner moved');
   text=text.replace(plannerGuard,"if(independentSummary&&generalPlanner?.planProject&&project!=='FOXCONN'&&project!=='ELYSIAN'){");
   const issueAnchor="        const descriptionCandidate=kind==='cash'?";
   if(!text.includes(issueAnchor))throw Error('ELYSIAN exception table moved');
   text=text.replace(issueAnchor,"\n        if(project==='ELYSIAN'&&kind==='cash'&&elysianReview){\n          if(issue==='Xung đột HĐ/IPC'&&\n             elysianReview.payrollMetadataPositions.includes(position))\n            values[0]='Nhân sự: khác metadata, không yêu cầu HĐ/IPC';\n          else if(issue==='Thiếu danh tính'&&\n             elysianReview.leaveIdentityPositions.includes(position))\n            values[0]='Nghỉ phép/thăm thân: kiểm ID nhân sự';\n          else if(issue==='Chỉ Cash Control'&&\n             elysianReview.transferSourcePositions.includes(position))\n            values[0]='Hoàn vay FOXCONN: ứng viên đối ứng Google, chưa xác minh ID';\n        }\n"+issueAnchor);
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

   // Include source attestation blockers in the owner's copied read-only summary.
   // No amounts, Firestore IDs, signed fingerprints, links, or secrets.
   const reportOriginalScope="        googleReads:scan.googleReads,googleWrites:0,\n        sourceComplete:false,writeApproved:false,";
   const reportWithProof="        googleReads:scan.googleReads,googleWrites:0,\n        // Read-only scan covers original history, not existing machine tabs.\n        comparisonScope:'ORIGINAL_HISTORY_ONLY',technicalMirrorChecked:false,\n        sourceProof:{checkedProjects:independentSource?.checkedProjects??0,\n          eligibleForFurtherReview:independentSource?.eligibleForFurtherReview??0,\n          error:String(independentSource?.error||'').slice(0,130)||null,\n          projects:(independentSource?.projects||[]).map(p=>({\n            project:p.project,verified:p.verified===true,\n            blockers:Array.isArray(p.blockers)?p.blockers.filter(code=>\n              typeof code==='string'&&/^[A-Z0-9_]{3,96}$/.test(code)).slice(0,12):[],\n            sourceRowsChecked:Number.isSafeInteger(p.sourceRowsChecked)?p.sourceRowsChecked:null\n          }))},\n        sourceComplete:false,writeApproved:false,";
   if(!text.includes(reportOriginalScope))throw Error('Read-only report scope anchor moved');
   text=text.replace(reportOriginalScope,reportWithProof);
   // Existing H14-3/SSIS technical mirrors were not part of this original-only read.
   // Include only safe row location/code diagnostics in the owner's copied
   // report: no amounts, transaction IDs, descriptions or Google sheet IDs.
   const oldSummaryTail="          dateReview:row.dateReview===true\n        }))";
   const newSummaryTail="          dateReview:row.dateReview===true,\n          reviewRows:['ELYSIAN','EATON','FOXCONN','C17-2'].includes(row.project)&&Array.isArray(row.reviewRows)?row.reviewRows.map(entry=>({origin:entry.origin,sourceRow:entry.sourceRow??null,googleRow:entry.googleRow??null,date:entry.date,code:entry.code,changedFields:entry.changedFields||[],financialDifference:entry.financialDifference===true})):[]\n        }))";
   if(!text.includes(oldSummaryTail))
     throw Error('Aggregate report shape changed; refusing unsafe build');
   text=text.replace(oldSummaryTail,newSummaryTail);

   // S13-2 independent original Google history preflight. Production UI only:
   // exact destination fixed on server; one explicit Admin OAuth read-only click.
   const s13OldButton='<button class="btn" id="ccSyncExportSourceForTest" type="button">Đối chiếu nguồn TEST · 1 dự án</button>';
   const s13NewButton=s13OldButton+
     '<button class="btn" id="ccSyncS13OriginalProof" type="button">Xác minh sổ gốc S13-2 · chỉ đọc</button>'+
     '<button class="btn" id="ccSyncS13DryRun" type="button">Xem trước 3 khoản S13-2 · 0 ghi</button>'+
     '<button class="btn" id="ccSyncS13Commit" type="button" hidden>Ghi 3 khoản S13-2 · cần xác nhận</button>'+
     '<button class="btn" id="ccSyncNextProjectReadOnly" type="button">Tiếp ELYSIAN · đối chiếu riêng, chỉ đọc</button>';
   const s13FunctionAnchor='async function ccSyncCheckS13OctoberSource(button,status){';
   if(!text.includes(s13OldButton)||!text.includes(s13FunctionAnchor))
     throw Error('S13 original preflight anchors moved; refuse unchecked build');
   text=text.replace(s13OldButton,s13NewButton);
   const s13ProofFunction=[
     'async function ccSyncS13OriginalHistoryReadOnly(){',
     ' const button=document.getElementById("ccSyncS13OriginalProof");',
     ' const status=document.getElementById("ccSyncPaymentPreflightStatus");',
     ' if(!button||!status||button.disabled)return;',
     ' if(!isCashControlOwner()||!currentAuthUser){status.textContent="Cần đăng nhập đúng Admin Cash Control.";return;}',
     ' if(String(document.getElementById("ccSyncPaymentPreflightProject")?.value||"")!=="S13-2"||String(document.getElementById("ccSyncBatchMonth")?.value||"")!=="2026-10"){',
     '   status.textContent="Chỉ hỗ trợ S13-2 tháng 10/2026.";return;',
     ' }',
     ' if(!window.google?.accounts?.oauth2){status.textContent="Google OAuth chưa tải; hãy kết nối Google Sheets và thử lại.";return;}',
     ' const admin=currentAuthUser;',
     ' button.disabled=true;',
     ' status.textContent="S13-2: đang yêu cầu quyền Google Sheets chỉ đọc để xác minh sổ gốc…";',
     ' let finished=false;',
     ' const finish=(message)=>{if(finished)return;finished=true;status.textContent=message;button.disabled=false;};',
     ' try{',
     '  const oauth=google.accounts.oauth2.initTokenClient({',
     '   client_id:"781332326791-s033knic9cmpf3h20altttsqmhjbot1t.apps.googleusercontent.com",',
     '   scope:"https://www.googleapis.com/auth/spreadsheets.readonly",',
     '   include_granted_scopes:false,',
     '   callback:async response=>{',
     '    if(!response?.access_token||response.error){finish("Google chưa cấp quyền chỉ đọc; không có dữ liệu nào bị ghi.");return;}',
     '    try{',
     '     if(currentAuthUser!==admin||!isCashControlOwner())throw Error("Phiên Admin đã thay đổi.");',
     '     const res=await fetch("/api/cash-sync-s13-original-readonly",{method:"POST",',
     '      headers:{"Content-Type":"application/json","Authorization":"Bearer "+response.access_token,',
     '       "X-Firebase-ID-Token":await admin.getIdToken()},',
     '      body:JSON.stringify({project:"S13-2",month:"2026-10"})});',
     '     const proof=await res.json();',
     '     if(!res.ok||proof?.kind!=="S13_ORIGINAL_HISTORY_READONLY"||proof.googleWrites!==0||proof.canSync!==false)',
     '       throw Error(String(proof?.error||"Chưa xác minh được sổ gốc."));',
     '     if(currentAuthUser!==admin||!isCashControlOwner())throw Error("Phiên Admin đã thay đổi.");',
     '     const report="S13-2 · Sổ gốc "+proof.historyTransactions+" giao dịch · "+proof.dateInversions+',
     '      " ngày đảo thứ tự · "+proof.octoberHistoryRows+" dòng từ 10/2026 · số dư lịch sử "+',
     '      Number(proof.historyClosingBalance).toLocaleString("vi-VN")+" đ · dự kiến sau 3 khoản "+',
     '      Number(proof.expectedClosingIfSourceVerified).toLocaleString("vi-VN")+" đ.";',
     '     finish(report+(proof.originalHistoryMatched?',
     '      " KHỚP MỐC LỊCH SỬ (CHỈ ĐỌC). Chưa chứng nhận nguồn; không cấp phép ghi.":',
     '      " CHƯA KHỚP MỐC LỊCH SỬ; KHÔNG GHI."));',
     '    }catch(error){finish("S13-2: chưa xác minh được Google gốc: "+String(error?.message||error).slice(0,110));}',
     '   },',
     '   error_callback:error=>finish("S13-2: lỗi xác thực Google OAuth "+String(error?.type||"").slice(0,90))',
     '  });',
     '  oauth.requestAccessToken({prompt:"select_account"});',
     ' }catch(error){finish("S13-2: Google chỉ đọc chưa sẵn sàng: "+String(error?.message||error).slice(0,120));}',
     '}',
     'document.getElementById("ccSyncS13OriginalProof")?.addEventListener("click",ccSyncS13OriginalHistoryReadOnly);'
   ].join(String.fromCharCode(10));
   // One verified, manual S13-only dry-run combining the previously separate
   // proofs into a signed no-write Google preview. No global source approval.
   const s13DryRunSource=String.raw`
async function ccSyncS13DryRunReadonly(){
 const commitButton=document.getElementById("ccSyncS13Commit");
 if(commitButton)commitButton.hidden=true;
 const button=document.getElementById("ccSyncS13DryRun");
 const status=document.getElementById("ccSyncPaymentPreflightStatus");
 if(!button||!status||button.disabled)return;
 const admin=currentAuthUser;
 if(!admin||!isCashControlOwner()||firebaseConfig.projectId!=="cscecmep-payment"){
  status.textContent="Chỉ Admin Production mới được xem trước S13-2.";return;
 }
 if(String(document.getElementById("ccSyncPaymentPreflightProject")?.value||"")!=="S13-2"||
    String(document.getElementById("ccSyncBatchMonth")?.value||"")!=="2026-10"){
  status.textContent="Chỉ hỗ trợ S13-2 tháng 10/2026.";return;
 }
 if(!cashCloudReady||!legacySeedReady||!paymentMonths.has("S13-2")){
  status.textContent="Cần tải Payment riêng S13-2 và nguồn Cash Control trước.";return;
 }
 if(!window.google?.accounts?.oauth2){
  status.textContent="Google OAuth chưa sẵn sàng; thử lại sau khi kết nối Sheets.";return;
 }
 const revision=Number(cashCloudState.revision||0);
 let rows;
 button.disabled=true;
 try{
  const lang=window.cashExportLang;
  try{
   window.cashExportLang="zh";
   rows=legacyCashExportRows("2026-10","S13-2").map(row=>({
    id:row._syncIds.map(id=>id.replace(/^expense:(?:legacy:)?/,"")).sort().join("+"),
    values:ccGoogleSyncPayloadCells(ccGoogleSyncRowValues(row))
   }));
  }finally{window.cashExportLang=lang;}
  if(rows.length!==3||rows.some(x=>x.values.length!==13))
   throw Error("Số dòng nguồn thay đổi; không thể xem trước.");
 }catch(e){
  status.textContent="S13-2: nguồn thay đổi: "+String(e?.message||e).slice(0,120);
  button.disabled=false;return;
 }
 let finished=false;
 const finish=msg=>{if(finished)return;finished=true;button.disabled=false;status.textContent=msg;};
 const request=async(url,body,token)=>{
  const res=await fetch(url,{method:"POST",
   headers:{"Content-Type":"application/json","X-Firebase-ID-Token":await admin.getIdToken(),
    ...(token?{"Authorization":"Bearer "+token}:{})},
   body:JSON.stringify(body)});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(String(data.error||"READONLY_PREFLIGHT_DENIED"));
  return data;
 };
 try{
  const source=await request("/api/cash-sync-source-readonly",
   {action:"s13_october_source",revision,source:rows});
  if(currentAuthUser!==admin||!isCashControlOwner()||
     Number(cashCloudState.revision||0)!==revision||
     source.revision!==revision||source.identitiesMatch!==true||
     source.postingMatches!==true||source.labelsMatch!==true||
     source.sourceComplete!==false||source.canSync!==false||source.googleWrites!==0)
   throw Error("Nguồn không còn khớp 3/3 hoặc phiên dữ liệu thay đổi.");
  const integrity=await request("/api/cash-sync-source-readonly",{
   action:"s13_integrity",revision,source:rows
  });
  if(integrity.kind!=="S13_FOUR_ORIGINAL_IDS_VERIFIED"||
     integrity.pinnedSourceMatched!==true||
     integrity.verifiedSourceItems!==4||integrity.groupedGoogleRows!==3||
     integrity.scopedCashEntriesMatched!==true||
     integrity.extraPrivateAndLegacyCashEntries!==0||
     integrity.sourceRevision!==revision||
     integrity.sourceComplete!==false||
     integrity.canSync!==false||integrity.googleWrites!==0||
     currentAuthUser!==admin||!isCashControlOwner()||
     Number(cashCloudState.revision||0)!==revision)
   throw Error("4 ID Cash Control chưa được xác minh độc lập hoặc nguồn tháng có thêm dòng.");
  status.textContent="S13-2: 4 ID nguồn đã xác minh từ Firestore; đang xem trước Google chỉ đọc…";
  const oauth=google.accounts.oauth2.initTokenClient({
   client_id:"781332326791-s033knic9cmpf3h20altttsqmhjbot1t.apps.googleusercontent.com",
   scope:"https://www.googleapis.com/auth/spreadsheets.readonly",
   include_granted_scopes:false,
   callback:async response=>{
    if(!response?.access_token||response.error){
     finish("Google không cấp quyền chỉ đọc; không ghi.");return;
    }
    try{
     const token=response.access_token;
     if(currentAuthUser!==admin||!isCashControlOwner()||
        Number(cashCloudState.revision||0)!==revision)
      throw Error("Nguồn hoặc phiên Admin đã thay đổi.");
     const historic=await request("/api/cash-sync-s13-original-readonly",
      {project:"S13-2",month:"2026-10"},token);
     if(historic.originalHistoryMatched!==true||historic.historyTransactions!==258||
        historic.historyClosingBalance!==65583133||historic.googleWrites!==0||
        historic.canSync!==false)
      throw Error("Lịch sử Google khác mốc đã xác nhận.");
     const digest=async values=>{
      const data=new TextEncoder().encode(JSON.stringify([...values,0]));
      const sha=await crypto.subtle.digest("SHA-256",data);
      return [...new Uint8Array(sha)].map(c=>c.toString(16).padStart(2,"0")).join("");
     };
     const records=await Promise.all(rows.map(async row=>({
      ...row,project:"S13-2",month:"2026-10",hash:await digest(row.values)
     })));
     const preview=await request("/api/cash-sync-multi-project",{
      action:"preview",project:"S13-2",month:"2026-10",
      spreadsheetId:"1s7-EZqTfS_6raZDxpK74m5gxDoAbRwBIJptCkG2lyUg",
      historySheetId:1543850344,source:records,openingBalance:null,
      expectedMonthClosing:-72663856
     },token);
     if(currentAuthUser!==admin||!isCashControlOwner()||
        Number(cashCloudState.revision||0)!==revision)
      throw Error("Nguồn/phiên Admin thay đổi trong lúc xem trước.");
     if(preview.mode!=="preview"||preview.writes!==0||
        preview.summary?.historical!==258||
        preview.summary?.monthClosingBalance!==-72663856||
        preview.summary?.originalUntouched!==true||
        ![true,false].includes(preview.writeConfigured))
      throw Error("Sổ gốc hoặc số dư thay đổi; không ghi Google.");
     // S13-2 has ALREADY been written, read back and the release relocked.
     // On fresh Google replay 0 changes, never report a false error or
     // encourage a second commit. A 261-line view is 258 original + 3 synced.
     if(preview.summary.changes===0){
      if(preview.summary.generated!==261)
       throw Error("Số dòng VIEW sau ghi khác 258+3; cần đối chiếu chỉ đọc.");
      if(commitButton)commitButton.hidden=true;
      finish("S13-2 tháng 10/2026 · ĐÃ ĐỒNG BỘ: 3 khoản đã có, "+
       "VIEW 261 dòng (258 lịch sử + 3 kỹ thuật), số dư -72.663.856 đ. "+
       "0 Google writes, KHÔNG BẤM GHI LẠI. Tiếp dự án khác bằng nút đối chiếu riêng.");
      return;
     }
     if(preview.summary.changes!==3)
      throw Error("Dòng Google mới không phải 0 hoặc 3, cần đối chiếu riêng.");
     if(preview.writeConfigured===true&&commitButton)
      commitButton.hidden=false;
     const statusText=preview.writeConfigured===true?
      "CỔNG GHI RIÊNG S13-2 ĐÃ MỞ; CHƯA GHI. Phải xác nhận riêng và máy chủ sẽ kiểm tra nguồn lại lúc ghi.":
      "CHƯA CHỨNG NHẬN ĐẦY ĐỦ PAYMENT/NGUỒN; CHƯA CẤP PHÉP GHI.";
     finish("S13-2 · XEM TRƯỚC THỰC TẾ ĐẠT: nguồn 3/3, lịch sử 258, 3 khoản mới, "+
      "số dư dự kiến -72.663.856 đ, Google writes 0. "+statusText);
    }catch(err){
     finish("S13-2 · XEM TRƯỚC BỊ CHẶN: "+String(err?.message||err).slice(0,140)+". 0 ghi.");
    }
   },
   error_callback:e=>finish("S13-2: Google OAuth lỗi "+String(e?.type||"").slice(0,80)+". 0 ghi.")
  });
  oauth.requestAccessToken({prompt:"select_account"});
 }catch(e){finish("S13-2 · DỪNG XEM TRƯỚC: "+String(e?.message||e).slice(0,140)+". 0 ghi.");}
}
document.getElementById("ccSyncS13DryRun")?.addEventListener("click",ccSyncS13DryRunReadonly);
`;
   // Prepared one-project release UI only; stays hidden until a signed
   // authenticated preview reports writeConfigured=true. The production
   // destination allowlist and release flag remain separately server-controlled.
   // Always require a SECOND explicit per-write confirmation.
   const s13CommitSource=String.raw`
async function ccSyncS13CommitVerified(){
 const button=document.getElementById("ccSyncS13Commit");
 const status=document.getElementById("ccSyncPaymentPreflightStatus");
 if(!button||button.hidden||button.disabled||!status)return;
 button.hidden=true;
 const admin=currentAuthUser,rev=Number(cashCloudState.revision||0);
 if(!admin||!isCashControlOwner()||firebaseConfig.projectId!=="cscecmep-payment"||
   document.getElementById("ccSyncPaymentPreflightProject")?.value!=="S13-2"||
   document.getElementById("ccSyncBatchMonth")?.value!=="2026-10"||
   !cashCloudReady||!legacySeedReady||!paymentMonths.has("S13-2")){
  status.textContent="S13-2: phiên Admin, nguồn hoặc tháng đã thay đổi. Không ghi.";return;
 }
 const getRows=()=>{
  const previous=window.cashExportLang;try{
   window.cashExportLang="zh";
   return legacyCashExportRows("2026-10","S13-2").map(row=>({
    id:row._syncIds.map(id=>id.replace(/^expense:(?:legacy:)?/,"")).sort().join("+"),
    values:ccGoogleSyncPayloadCells(ccGoogleSyncRowValues(row))
   }));
  }finally{window.cashExportLang=previous;}
 };
 let rows;
 try{rows=getRows();if(rows.length!==3)throw Error("Nguồn không còn 3 khoản");}
 catch(e){status.textContent="S13-2: không ghi, nguồn đã đổi: "+String(e?.message||e);return;}
 const stable=()=>currentAuthUser===admin&&isCashControlOwner()&&
  Number(cashCloudState.revision||0)===rev&&
  document.getElementById("ccSyncPaymentPreflightProject")?.value==="S13-2"&&
  document.getElementById("ccSyncBatchMonth")?.value==="2026-10";
 const make=async(data,token)=>{
  const response=await fetch(data.api,{method:"POST",
   headers:{"Content-Type":"application/json","X-Firebase-ID-Token":await admin.getIdToken(),
   ...(token?{"Authorization":"Bearer "+token}:{})},body:JSON.stringify(data.body)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(String(result.error||"PREFLIGHT_DENIED").slice(0,180));
  return result;
 };
 button.disabled=true;
 status.textContent="S13-2: kiểm tra lại 4 ID nguồn trước khi xin quyền ghi Google…";
 const done=text=>{status.textContent=text;button.disabled=false;};
 try{
  const source=await make({api:"/api/cash-sync-source-readonly",body:{
   action:"s13_integrity",revision:rev,source:rows
  }});
  if(!stable()||source.kind!=="S13_FOUR_ORIGINAL_IDS_VERIFIED"||
     source.verifiedSourceItems!==4||source.groupedGoogleRows!==3||
     source.scopedCashEntriesMatched!==true||source.sourceRevision!==rev||
     source.sourceComplete!==false||source.canSync!==false||source.googleWrites!==0)
   throw Error("4 ID nguồn không còn khớp; không ghi.");
  if(!window.google?.accounts?.oauth2)throw Error("Google OAuth không sẵn sàng");
  const oauth=google.accounts.oauth2.initTokenClient({
   client_id:"781332326791-s033knic9cmpf3h20altttsqmhjbot1t.apps.googleusercontent.com",
   scope:"https://www.googleapis.com/auth/spreadsheets",
   include_granted_scopes:false,
   callback:async response=>{
    if(!response?.access_token||response.error){done("Google không cấp quyền ghi; không ghi.");return;}
    let submitted=false;
    try{
     const token=response.access_token;
     const hash=async values=>{
      const bytes=new TextEncoder().encode(JSON.stringify([...values,0]));
      return [...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))]
       .map(n=>n.toString(16).padStart(2,"0")).join("");
     };
     const sourceRecords=await Promise.all(rows.map(async r=>({
      ...r,project:"S13-2",month:"2026-10",hash:await hash(r.values)
     })));
     const payload={project:"S13-2",month:"2026-10",
      spreadsheetId:"1s7-EZqTfS_6raZDxpK74m5gxDoAbRwBIJptCkG2lyUg",
      historySheetId:1543850344,source:sourceRecords,revision:rev,
      openingBalance:null,expectedMonthClosing:-72663856};
     const preflight=async()=>{
      if(!stable())throw Error("Phiên Admin hoặc revision đã thay đổi.");
      const history=await make({api:"/api/cash-sync-s13-original-readonly",
       body:{project:"S13-2",month:"2026-10"}},token);
      if(!history.originalHistoryMatched||history.historyTransactions!==258||
         history.historyClosingBalance!==65583133||history.googleWrites!==0)
       throw Error("Sổ gốc không còn đúng mốc đã xác minh.");
      const p=await make({api:"/api/cash-sync-multi-project",
       body:{...payload,action:"preview"}},token);
      if(!stable()||p.mode!=="preview"||p.writes!==0||
         p.writeConfigured!==true||p.summary?.project!=="S13-2"||
         p.summary?.month!=="2026-10"||
         p.summary?.monthClosingBalance!==-72663856||
         p.summary?.historical!==258||
         p.summary?.originalUntouched!==true||
         !/^[a-f0-9]{64}$/.test(p.signature||""))
       throw Error("Bản xem trước có chữ ký không hợp lệ hoặc khóa ghi chưa mở.");
      return p;
     };
     const before=await preflight();
     if(before.summary.changes===0){
      done("S13-2: Google đã có đủ 3 giao dịch, không cần ghi lại. 0 writes.");return;
     }
     if(before.summary.changes!==3)
      throw Error("Không đúng 3 giao dịch mới; không ghi.");
     if(!window.confirm("CHỈ S13-2 THÁNG 10/2026\n"+
       "Ghi 3 khoản: lương 81.463.753 đ, tiền ăn 3.859.500 đ, thuế TNCN 52.923.736 đ.\n"+
       "Tổng chi 138.246.989 đ. Số dư dự kiến -72.663.856 đ.\n"+
       "Sổ lịch sử gốc 258 dòng không được sửa. Có đồng ý ghi một lần vào tab kỹ thuật Google không?")){
      done("Đã hủy ghi S13-2; 0 Google writes.");return;
     }
     status.textContent="S13-2: đối chiếu lại Google lần cuối và kiểm tra revision trước khi ghi…";
     const fresh=await preflight();
     if(fresh.summary.changes===0){
      done("S13-2: dữ liệu đã có ở Google trước khi ghi, 0 writes.");return;
     }
     if(fresh.summary.changes!==3)throw Error("Lượt kiểm tra cuối không đúng 3 khoản.");
     submitted=true;
     const written=await make({api:"/api/cash-sync-multi-project",body:{
      ...payload,action:"commit",signature:fresh.signature,confirm:"SYNC_THIS_PROJECT"
     }},token);
     if(written.mode==="verified"&&written.writes===1&&
        written.summary?.changes===3&&
        written.summary?.monthClosingBalance===-72663856&&
        written.summary?.originalUntouched===true)
      done("S13-2 · GHI VÀ ĐỌC LẠI ĐẠT: 3 khoản, số dư -72.663.856 đ; "+
       "tab lịch sử 258 dòng giữ nguyên. Không bấm ghi lần nữa.");
     else
      done("S13-2: kết quả ghi chưa chắc chắn. KHÔNG THỬ LẠI. "+
       "Phải đối chiếu Google chỉ đọc trước khi thực hiện tiếp.");
    }catch(e){
     done("S13-2 · "+(submitted?"KẾT QUẢ GHI KHÔNG CHẮC CHẮN — KHÔNG BẤM LẠI: ":
       "CHƯA GHI: ")+String(e?.message||e).slice(0,170));
    }
   },
   error_callback:e=>done("Google OAuth bị từ chối; KHÔNG ghi: "+String(e?.type||"").slice(0,90))
  });
  oauth.requestAccessToken({prompt:"select_account"});
 }catch(e){done("S13-2: không ghi: "+String(e?.message||e).slice(0,170));}
}
document.getElementById("ccSyncS13Commit")?.addEventListener("click",ccSyncS13CommitVerified);
for(const key of ["ccSyncBatchMonth","ccSyncPaymentPreflightProject"])
 document.getElementById(key)?.addEventListener("change",()=>{
  const button=document.getElementById("ccSyncS13Commit");
  if(button)button.hidden=true;
 });
`;
   // One-project handoff: ELYSIAN has a known Google history / needs
   // manual reconciliation, not an approved write. A single click can
   // trigger existing ELYSIAN-only Payment/Google compare in readonly scope.
   const nextProjectSource=String.raw`
async function ccSyncNextProjectReadOnly(){
 const button=document.getElementById("ccSyncNextProjectReadOnly");
 const status=document.getElementById("ccSyncPaymentPreflightStatus");
 if(!button||button.disabled||!status)return;
 if(!currentAuthUser||!isCashControlOwner()||firebaseConfig.projectId!=="cscecmep-payment"){
  status.textContent="Chỉ Admin Production được kiểm tra dự án kế tiếp.";return;
 }
 const project="ELYSIAN";
 const link=ccSyncProjectLinkDraft[project];
 if(!link||!ccSyncProjectLinkValid(link)){
  status.textContent="ELYSIAN chưa có link Google trong danh mục ở tên miền này; "+
   "cần lưu link đúng file/tab trước khi kiểm tra. Chưa đọc/ghi dữ liệu.";return;
 }
 const selector=document.getElementById("ccSyncPaymentPreflightProject");
 const month=document.getElementById("ccSyncBatchMonth");
 if(!selector||![...selector.options].some(x=>x.value===project)){
  status.textContent="Danh mục chưa tải ELYSIAN; không tự suy diễn dự án.";return;
 }
 button.disabled=true;
 const original=ccGoogleSyncToken;
 try{
  status.textContent="ELYSIAN: xin Google quyền chỉ đọc; chỉ truy vấn đúng 1 dự án…";
  const token=await ccGoogleSheetsAccessToken(
   "https://www.googleapis.com/auth/spreadsheets.readonly",
   {includeGrantedScopes:false,prompt:""});
  if(!isCashControlOwner()||!currentAuthUser||
     firebaseConfig.projectId!=="cscecmep-payment")
   throw Error("Phiên Admin đã thay đổi");
  ccGoogleSyncToken=token;
  selector.value=project;
  if(month)month.value="2026-10";
  await ccSyncCompareProjectGoogleReadOnly();
 }catch(e){
  status.textContent="ELYSIAN: chưa đối chiếu được: "+
   String(e?.message||e).slice(0,140)+". Không ghi.";
 }finally{ccGoogleSyncToken=original;button.disabled=false;}
}
document.getElementById("ccSyncNextProjectReadOnly")
 ?.addEventListener("click",ccSyncNextProjectReadOnly);
`;
   text=text.replace(s13FunctionAnchor,
     s13ProofFunction+String.fromCharCode(10)+s13DryRunSource+
     String.fromCharCode(10)+s13CommitSource+
     String.fromCharCode(10)+nextProjectSource+
     String.fromCharCode(10)+s13FunctionAnchor);

   // The owner explicitly supplied the already-tested PHU HUNG sheet URL.
   // Restore it when the Production browser has no local link.
   // Auth often initializes AFTER catalog bootstrap; do not require Admin\n   // identity for setting this inert browser-local URL.\n   // Never overwrite an existing draft, inspect Google on page load, or
   // grant production writer permission. The read-only scan checks gid/title.
   const loadDraft='  ccSyncProjectCatalogLoadDraft();';
   if(!text.includes(loadDraft))throw Error('Link draft bootstrap changed');
   // Verified via authenticated Google Drive metadata, 2026-11-17.
   // Recovery hints ONLY: local draft links take precedence. No sheet API
   // requests are made on page load and these links never authorize writes.
   // Exclude TEST and S19-3 outside catalog. S6-1 requires a separate tab schema review.
   const knownOriginalSheets={
  "PHU HUNG": [
    "1gOEvJmOCW9EV5zfBNyJZ35a8EtMZihI2yZyuKj93dVg",
    1049774332
  ],
  "ELYSIAN": [
    "1psyGxQsHf7CbGqVSgQdiwHonN3UztxAthKa6iHkAR4Y",
    1134656568
  ],
  "C17-2": [
    "1mNzUzyQxtxMRrTJuSSAqF4oosrTUlMpYwx44SbICa3A",
    1886200752
  ],
  "EATON": [
    "1zg5hMATwf6QVWlXUMiFzFcMW0qRgNd-aD4cL_U8PUUs",
    1214250390
  ],
  "FOXCONN": [
    "1Rfn7C3jbJKA8KMwjKIbeEqpeMElE4pSfTKowS1cfIO4",
    16501839
  ],
  "CR5-1B": [
    "12H48FWl7PvQzLLs6UphWcB7_JpML4ueK42ZszNDgODc",
    1180514225
  ],
  "CN8-2": [
    "1RBKsCWN3k6aOsx0427BmiuGslDWRx8CgDv0AQhXE50A",
    83839595
  ],
  "SSIS": [
    "1obX_1Gq8_UYNZMFbZSo6mbIQ9DdCMn6j9JoRQDIMENM",
    1478736993
  ],
  "H14-3": [
    "1UOcsvgB9VFj_Q4xUZK2TiZVGMb_sQiumguOUIzUUOTM",
    485113919
  ],
  "S13-2": [
    "1s7-EZqTfS_6raZDxpK74m5gxDoAbRwBIJptCkG2lyUg",
    1543850344
  ],
  "ADVANCE": [
    "1cOCMgFupF7jahnR62i5zIBKw7Bn5XaZS4s9DvijXsTQ",
    1494600789
  ],
  "DELASOL": [
    "1qCr5PDonMuu86Fc_iI1dm58qu_oim8GY7BKSb7_tEto",
    1052496463
  ],
  "中健厂房": [
    "1KIrsFSLkT02OKSNFCZttwyMh2-zQayYC-IBPILtG8Ds",
    1441516508
  ],
  "C13B": [
    "1G-vQhvfwAMdHSVzLzF6yctPdLVfb_URbMmemArUH07Q",
    1707755070
  ],
  "CLUB HOUSE": [
    "1Bm0BIx028BjkgPfx6vqonPNrq6c_Byl80NkmijQAPLU",
    1680466359
  ],
  "S6-1": [
    "1whbLb_ce9y4s78u4lMknP9Qp5YxEQeAZOD6t20dDeoA",
    0
  ],
  "OCEAN LINK": [
    "1cq539R49hyE4rxhAb4_5zovvDIOLE1bxqRAuCmiRc5Q",
    1702482780
  ],
  "CHAOMED": [
    "1DLdvNzzi0F3Co53GDlYkJljPnQUJ0a4rp_0ZQ5tssXE",
    54521986
  ],
  "红鹤别墅1.1区": [
    "1C2s60lg79LyytVZa9Ok5zMR8l2kzUbdo3saoiXZjkeA",
    194889516
  ]
};
   const recoveredLinkCode=[
     loadDraft,
     "  if(firebaseConfig.projectId==='cscecmep-payment'){",
     "    const knownOriginalSheets="+JSON.stringify(knownOriginalSheets)+";",
     "    const available=new Set(ccSyncProjectCatalogNames());",
     "    let recovered=0;",
     "    for(const [project,[fileId,gid]] of Object.entries(knownOriginalSheets)){",
     "      if(!available.has(project)||ccSyncProjectLinkDraft[project])continue;",
     "      const link='https://docs.google.com/spreadsheets/d/'+fileId+'/edit?gid='+gid+'#gid='+gid;",
     "      if(ccSyncProjectLinkValid(link)){ccSyncProjectLinkDraft[project]=link;recovered++;}",
     "    }",
     "    if(recovered)ccSyncProjectCatalogSaveDraft();",
     "  }"
   ].join(String.fromCharCode(10));
   text=text.replace(loadDraft,recoveredLinkCode);
   // Live Production owner workflow: direct Cash Control -> Google Sheets on one Admin click
   // A dedicated PHU HUNG writer is invoked by this SAME one-click action.
   // Never display SOURCE_NOT_VERIFIED for a workbook already activated.
   const pilotStatusBefore="          mark(row.project,(note[row.status]||row.status)+";
   if(!text.includes(pilotStatusBefore))throw Error('PHU HUNG one-click status callback moved');
   text=text.replace(pilotStatusBefore,"          if(row.project==='PHU HUNG'&&row.reason==='SOURCE_NOT_VERIFIED'){\n            mark(row.project,'Dùng đồng bộ PHU HUNG đã kích hoạt trong cùng nút; không ghi lặp qua luồng mới.');\n            return;\n          }\n          mark(row.project,(note[row.status]||row.status)+");

   // The fallback JSON source is optional troubleshooting, not normal sync.
   const rawBridgeOpen="<div id=\"ccSyncMonthSourceBridge\" style=\"display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:9px 0 4px\">";
   const rawBridgeTail="</span>\n          </div>\n          <p id=\"ccSyncBatchStatus\"";
   if(!text.includes(rawBridgeOpen)||!text.includes(rawBridgeTail))
     throw Error('Advanced fallback source panel anchor moved');
   text=text.replace(rawBridgeOpen,
     '<details id="ccSyncMonthSourceAdvanced" style="margin-top:8px;border:1px solid #dbe4f0;border-radius:8px;padding:8px 12px;background:#fff"><summary style="cursor:pointer;font-size:12px;color:#596478">Tải gói nguồn JSON · chỉ khi cần xử lý kỹ thuật</summary>'+rawBridgeOpen);
   text=text.replace(rawBridgeTail,"</span>\n          </div>\n          </details>\n          <p id=\"ccSyncBatchStatus\"");

   const directOld0="            '? Chỉ cập nhật tab kỹ thuật, không sửa sổ gốc.');";
   if(!text.includes(directOld0))throw Error('Direct Google sync/pilot anchor 0 moved');
   text=text.replace(directOld0,"            '? Chỉ thêm giao dịch mới vào tab dự án; bảo toàn sổ lịch sử gốc.');");
   const directOld1="        'đ. Không phát sinh ghi Google. Nguồn Firestore chỉ được làm mới khi Admin bấm.');\n      return;";
   if(!text.includes(directOld1))throw Error('Direct Google sync/pilot anchor 1 moved');
   text=text.replace(directOld1,"        'đ. Không phát sinh ghi Google. Nguồn Firestore chỉ được làm mới khi Admin bấm.');\n      return {mode:'unchanged',summary:sum};");
   const directOld2="      ccGoogleSyncStatus('ĐÃ HỦY: chỉ kiểm tra và làm mới nguồn, không ghi file Google Sheets gốc.');\n      return;";
   if(!text.includes(directOld2))throw Error('Direct Google sync/pilot anchor 2 moved');
   text=text.replace(directOld2,"      ccGoogleSyncStatus('ĐÃ HỦY: chỉ kiểm tra và làm mới nguồn, không ghi file Google Sheets gốc.');\n      return {mode:'canceled',summary:sum};");
   const directOld3="      'Không sửa Firestore, không chạy đồng bộ ngầm.');\n  }finally{ccGoogleSyncWriteInFlight=false}\n}";
   if(!text.includes(directOld3))throw Error('Direct Google sync/pilot anchor 3 moved');
   text=text.replace(directOld3,"      'Không sửa Firestore, không chạy đồng bộ ngầm.');\n    return {mode:'verified',summary:result.summary};\n  }finally{ccGoogleSyncWriteInFlight=false}\n}");
   const directPilotHook="      const t=result.summary;";
   if(!text.includes(directPilotHook))throw Error('Multi-project live PHU HUNG bridge anchor moved');
   text=text.replace(directPilotHook,"      // PHU HUNG's established live original-sync engine uses a different\n      // mirror schema. One Admin click can invoke it AFTER the other project\n      // commits, never before or after an ambiguous Google write. This keeps\n      // the already-activated PHU HUNG workbook entirely unchanged in structure.\n      if(result.mode!=='NOT_APPROVED'&&\n         !result.rows.some(r=>r.writeUncertain===true||r.reason==='PREVIOUS_WRITE_UNCERTAIN_REQUIRE_GOOGLE_READBACK')&&\n         manifest.groups.some(g=>g.project==='PHU HUNG'&&g.groupedExcelRows)){\n        try{\n          const pilot=await ccGoogleSyncRunOriginalManually();\n          mark('PHU HUNG',pilot?.mode==='verified'?\n            'Đã ghi và đọc lại Google theo mẫu PHU HUNG':\n            pilot?.mode==='unchanged'?'Đã khớp Google, không ghi thêm':\n            'Admin đã hủy xác nhận riêng PHU HUNG');\n        }catch(error){\n          mark('PHU HUNG','Chưa ghi · '+String(error?.message||error).slice(0,140));\n        }\n      }\n      const t=result.summary;");

   // Apply PHU HUNG status counting AFTER installing its one-click bridge.
   const sumOld0="      if(result.mode!=='NOT_APPROVED'&&\n         !result.rows.some(r=>r.writeUncertain===true||r.reason==='PREVIOUS_WRITE_UNCERTAIN_REQUIRE_GOOGLE_READBACK')";
   if(!text.includes(sumOld0))throw Error('PHU HUNG summary integration 0 moved');
   text=text.replace(sumOld0,"      let pilotMode='not-run';\n"+sumOld0);
   const sumOld1="          const pilot=await ccGoogleSyncRunOriginalManually();\n          mark('PHU HUNG',pilot?.mode==='verified'?";
   if(!text.includes(sumOld1))throw Error('PHU HUNG summary integration 1 moved');
   text=text.replace(sumOld1,"          const pilot=await ccGoogleSyncRunOriginalManually();\n          pilotMode=pilot?.mode||'unknown';\n          mark('PHU HUNG',pilot?.mode==='verified'?");
   const sumOld2="      const t=result.summary;\n      status.textContent=";
   if(!text.includes(sumOld2))throw Error('PHU HUNG summary integration 2 moved');
   text=text.replace(sumOld2,"      const t=result.summary;\n      const pilotDone=pilotMode==='verified'||pilotMode==='unchanged';\n      status.textContent=");
   const sumOld3="' dự án có nguồn · '+t.verified+' đã ghi và đọc lại · '+t.unchanged+";
   if(!text.includes(sumOld3))throw Error('PHU HUNG summary integration 3 moved');
   text=text.replace(sumOld3,"' dự án có nguồn · '+(t.verified+(pilotMode==='verified'?1:0))+' đã ghi và đọc lại · '+(t.unchanged+(pilotMode==='unchanged'?1:0))+");
   const sumOld4="' đã khớp · '+t.previewOnly+' chỉ xem trước (chưa cấp phép) · '+\n        t.skipped+' bỏ qua · '+t.failed+' cần kiểm tra · '+";
   if(!text.includes(sumOld4))throw Error('PHU HUNG summary integration 4 moved');
   text=text.replace(sumOld4,"' đã khớp · '+t.previewOnly+' chỉ xem trước (chưa cấp phép) · '+\n        Math.max(0,t.skipped-(pilotDone?1:0))+' bỏ qua · '+t.failed+' cần kiểm tra · '+");


   // Visible admin status, and one-sheet-only XLSX for circulation to staff.
   const exportImport='import {buildOneSheetXlsx} from "./assets/js/cash-sync-report-export.mjs";';
   const coreImport='import {runManualMonthlySync} from "./assets/js/cash-sync-monthly-manual-runner.mjs";';
   if(!text.includes(coreImport))throw Error('Report-only XLSX import anchor moved');
   text=text.replace(coreImport,coreImport+'\n'+exportImport);
   const jsMarker='async function ccSyncMultiProjectManual(){';
   if(!text.includes(jsMarker))throw Error('Shared sync JS insertion marker moved');
   text=text.replace(jsMarker,"\nfunction ccSyncRefreshReportProjectOptions(){\n  const menu=$('ccSyncReportProject');\n  if(!menu||!isCashControlOwner())return;\n  const current=menu.value;\n  const projects=ccSyncProjectCatalogNames().filter(p=>\n    ccSyncProjectLinkValid(ccSyncProjectLinkDraft[p]||''));\n  menu.replaceChildren();\n  menu.add(new Option('Chọn dự án có link Google…',''));\n  for(const p of projects)menu.add(new Option(p,p));\n  if(projects.includes(current))menu.value=current;\n}\nasync function ccSyncExportVisibleOnly(){\n  const button=$('ccSyncExportVisibleOnly'),status=$('ccSyncReportExportStatus');\n  if(!button||!status||button.disabled)return;\n  button.disabled=true;\n  try{\n    if(!currentAuthUser||!isCashControlOwner()||firebaseConfig.projectId!=='cscecmep-payment')\n      throw Error('Chỉ Admin Cash Control chính được xuất file.');\n    if(!ccGoogleSyncToken)throw Error('Bấm Kết nối Google trước khi tải báo cáo.');\n    if(!window.XLSX)throw Error('Thư viện Excel chưa tải được.');\n    const project=$('ccSyncReportProject')?.value;\n    const rawLink=ccSyncProjectLinkDraft[project]||'';\n    if(!project||!ccSyncProjectLinkValid(rawLink))\n      throw Error('Chọn dự án đã có link Google Sheets.');\n    const url=new URL(rawLink),fileId=\n      /^\\/spreadsheets\\/d\\/([A-Za-z0-9_-]{20,100})(?:\\/|$)/.exec(url.pathname)?.[1];\n    if(url.hostname!=='docs.google.com'||url.protocol!=='https:'||!fileId)\n      throw Error('Link Google Sheets chưa hợp lệ.');\n    status.textContent='Đang tải CHỈ tab báo cáo '+project+' từ Google…';\n    const range=\"'\"+project.replace(/'/g,\"''\")+\"'!A1:O20000\";\n    const endpoint='https://sheets.googleapis.com/v4/spreadsheets/'+\n      encodeURIComponent(fileId)+'/values/'+encodeURIComponent(range)+\n      '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING';\n    const token=ccGoogleSyncToken;\n    const res=await fetch(endpoint,{headers:{Authorization:'Bearer '+token}});\n    const payload=await res.json().catch(()=>({}));\n    if(!res.ok)throw Error('Google Sheets '+res.status+': '+\n       String(payload?.error?.message||'Không có quyền đọc tab').slice(0,110));\n    if(!isCashControlOwner()||ccGoogleSyncToken!==token)\n      throw Error('Phiên Admin/Google đã thay đổi, dừng xuất file.');\n    const {workbook,rows}=buildOneSheetXlsx({\n      project,values:payload.values,XLSX:window.XLSX});\n    const month=String($('ccSyncBatchMonth')?.value||'').replace(/[^0-9-]/g,'');\n    window.XLSX.writeFile(workbook,project.replace(/[\\\\/:?*[\\]]/g,'_')+\n      '_BAO_CAO_'+(month||'CURRENT')+'_1_SHEET.xlsx');\n    status.textContent='ĐÃ XUẤT '+project+' · '+rows+\n       ' dòng · CHỈ 1 SHEET, không có tab lịch sử hoặc DATA_CASHCONTROL. '+\n       'Hãy gửi file này, KHÔNG chia sẻ file Google gốc nếu cần bảo mật tab ẩn.';\n  }catch(error){\n    status.textContent='KHÔNG XUẤT: '+String(error?.message||error).slice(0,200);\n  }finally{button.disabled=false}\n}\nfunction ccSyncUpdateOwnerSummary(month,result,pilotMode){\n  const area=$('ccSyncOwnerSummary');\n  if(!area||!result)return;\n  const x=result.summary||{};\n  const verified=(x.verified||0)+(pilotMode==='verified'?1:0);\n  const unchanged=(x.unchanged||0)+(pilotMode==='unchanged'?1:0);\n  const handledPilot=pilotMode==='verified'||pilotMode==='unchanged';\n  const skipped=Math.max(0,(x.skipped||0)-(handledPilot?1:0));\n  const failed=x.failed||0,waiting=x.ready||0;\n  const done=result.mode!=='NOT_APPROVED';\n  area.replaceChildren();\n  const strong=document.createElement('strong');\n  strong.textContent=done?'Kết quả đồng bộ '+month:\n    'CHƯA GHI · Bạn đã hủy hộp xác nhận';\n  strong.style.cssText='font-size:14px;color:#263446';\n  area.append(strong);\n  const row=document.createElement('div');\n  row.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:9px';\n  const data=[\n    ['✓ Đã ghi và đọc lại',verified,'#136e43','#e7f6ec'],\n    ['✓ Đã khớp, không ghi lại',unchanged,'#165a88','#eaf3fb'],\n    ['! Cần kiểm tra',failed,'#9e3e12','#fff2e7'],\n    ['○ Bỏ qua / chưa có link',skipped,'#566274','#f2f4f7'],\n    ['… Chưa ghi / chờ xác nhận',waiting,'#6e5e09','#fff8df']\n  ];\n  for(const [label,count,color,bg] of data){\n    const chip=document.createElement('span');\n    chip.style.cssText='padding:7px 10px;border-radius:8px;font-size:12px;'+\n      'font-weight:700;color:'+color+';background:'+bg;\n    chip.textContent=label+' · '+count;\n    row.append(chip);\n  }\n  area.append(row);\n  const caption=document.createElement('div');\n  caption.style.cssText='font-size:12px;color:#58677a;margin-top:8px';\n  caption.textContent='Chi tiết từng dự án nằm ngay bên dưới. '+\n    'Màu xanh là đã xác nhận trên Google; màu cam là chờ kiểm tra. '+\n    'Dự án chưa có link sẽ được bỏ qua.';\n  area.append(caption);\n}\n"+'\n'+jsMarker);
   const catalog='<details id="ccGoogleSyncProjectLinkCatalog" hidden open ';
   if(!text.includes(catalog))throw Error('Owner tab/accordion marker moved');
   text=text.replace(catalog,
     '<div id="ccSyncOwnerSummary" role="status" aria-live="polite" '+
     'style="border:1px solid #d7e5db;background:#f8fbf8;border-radius:10px;padding:12px;'+
     'margin:10px 0;font-size:13px;color:#3f4a59">CHƯA CHẠY ĐỒNG BỘ · Chọn tháng và bấm nút bên dưới.</div>'+catalog);
   const exportPanel='<p id="ccSyncBatchStatus"';
   if(!text.includes(exportPanel))throw Error('Google owner status marker moved');
   const reportHtml='<div id="ccSyncReportExportPanel" '+
    'style="padding:10px;border:1px solid #dbe4f0;border-radius:9px;margin:10px 0;background:#fff">'+
    '<strong style="font-size:13px">Tải Excel gửi người khác · CHỈ 1 SHEET</strong>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">'+
    '<select id="ccSyncReportProject" aria-label="Dự án cần xuất báo cáo" '+
    'style="min-width:200px;max-width:300px;padding:8px;border:1px solid #cad4e3;border-radius:7px">'+
    '<option value="">Chọn dự án có link Google…</option></select>'+
    '<button type="button" class="btn" id="ccSyncExportVisibleOnly">Tải Excel báo cáo (1 tab)</button></div>'+
    '<p style="font-size:12px;color:#56647a;margin:8px 0 0">'+
    'Chỉ tải tab báo cáo, không kèm bản sao lịch sử và DATA_CASHCONTROL. '+
    'Nếu chia sẻ link Google gốc, người nhận vẫn có thể tải các tab ẩn.</p>'+
    '<p role="status" id="ccSyncReportExportStatus" style="font-size:12px;color:#41566e;margin:6px 0 0"></p>'+
    '</div>';
   text=text.replace(exportPanel,reportHtml+exportPanel);
   const catalogInit="  ccSyncProjectCatalogLoadDraft();";
   if(!text.includes(catalogInit))throw Error('Admin catalog init marker moved');
   text=text.replace(catalogInit,catalogInit+
     '\n  wrap.open=true;\n  ccSyncRefreshReportProjectOptions();\n'+
     "  $('ccSyncReportProject')?.addEventListener('focus',ccSyncRefreshReportProjectOptions);"+
     "\n  $('ccSyncExportVisibleOnly')?.addEventListener('click',ccSyncExportVisibleOnly);");
   const finalStatus="        indexedCount+' hồ sơ Payment đọc theo tháng.';";
   if(!text.includes(finalStatus))throw Error('Live sync final summary marker moved');
   text=text.replace(finalStatus,finalStatus+
     '\n      ccSyncUpdateOwnerSummary(month,result,pilotMode);');
   const listMarker="      const list=document.createElement('ul');";
   if(!text.includes(listMarker))throw Error('Result list styling marker moved');
   text=text.replace(listMarker,listMarker+
     '\n      list.style.cssText="list-style:none;padding:0;margin:0;display:grid;gap:7px";');
   const liMarker="        li.textContent=project+' · '+message;";
   if(!text.includes(liMarker))throw Error('Project result row marker moved');
   text=text.replace(liMarker,liMarker+"\n        const ok=/Đã ghi|Đã khớp|THẬT ĐÃ KHỚP/i.test(message);\n        const warn=/Cần kiểm tra|CHƯA|Chưa ghi|Bỏ qua|Sẵn sàng/i.test(message);\n        li.style.cssText='list-style:none;padding:9px 11px;border-radius:8px;'+\n          'border:1px solid '+(ok?'#bfddc9':warn?'#f1ddbf':'#d7e2ee')+';'+\n          'background:'+(ok?'#eff9f1':warn?'#fff9ed':'#f5f8fc')+';'+\n          'font-size:12px;line-height:1.55';");
   const readyLabel="READY:'Sẵn sàng ghi TEST/production theo quyền server',";
   if(!text.includes(readyLabel))throw Error('READY badge semantics marker moved');
   text=text.replace(readyLabel,"READY:'CHƯA GHI · chờ xác nhận',");

   // Include PHU HUNG in the same explicit batch approval; no duplicate popup.
   const oneApprovalBefore0="async function ccGoogleSyncRunOriginalManually(){";
   if(!text.includes(oneApprovalBefore0))throw Error('Single Admin confirmation anchor 0 moved');
   text=text.replace(oneApprovalBefore0,"async function ccGoogleSyncRunOriginalManually({preApprovedByBatch=false}={}){");
   const oneApprovalBefore1="    if(!confirm(confirmation)){\n      ccGoogleSyncStatus('ĐÃ HỦY: chỉ kiểm tra và làm mới nguồn, không ghi file Google Sheets gốc.');";
   if(!text.includes(oneApprovalBefore1))throw Error('Single Admin confirmation anchor 1 moved');
   text=text.replace(oneApprovalBefore1,"    if(!preApprovedByBatch&&!confirm(confirmation)){\n      ccGoogleSyncStatus('ĐÃ HỦY: chỉ kiểm tra và làm mới nguồn, không ghi file Google Sheets gốc.');");
   const oneApprovalBefore2="          const pilot=await ccGoogleSyncRunOriginalManually();";
   if(!text.includes(oneApprovalBefore2))throw Error('Single Admin confirmation anchor 2 moved');
   text=text.replace(oneApprovalBefore2,"          const pilot=await ccGoogleSyncRunOriginalManually({preApprovedByBatch:\n            result.mode==='BATCH_ATTEMPTED'&&result.approved===true});");
   const oneApprovalBefore3="          return confirm('Đồng bộ '+review.readyProjects.length+\n            ' dự án đã được máy chủ cấp phép tháng '+month+";
   if(!text.includes(oneApprovalBefore3))throw Error('Single Admin confirmation anchor 3 moved');
   text=text.replace(oneApprovalBefore3,"          const includesPhuHung=manifest.groups.some(g=>\n            g.project==='PHU HUNG'&&g.groupedExcelRows);\n          return confirm('Đồng bộ '+review.readyProjects.length+\n            ' dự án đã được máy chủ cấp phép'+\n            (includesPhuHung?' + PHU HUNG':'')+' tháng '+month+");

   // and a single Cash Control month JSON. Legacy technical tools remain
   // present but de-emphasized; never represent unsupported direct write as ready.
   const uiBefore0="title=\"Chỉ Admin; bản thử PHU HUNG, ghi được vào file Google Sheets TEST sau khi xác nhận\">↗ Đồng bộ Google Sheets (thử)";
   if(!text.includes(uiBefore0))throw Error('Cash Control owner UI anchor 0 moved');
   text=text.replace(uiBefore0,"title=\"Quản lý nguồn tháng và các file Google Sheets đã kết nối\">↗ Google Sheets · Cập nhật");
   const uiBefore1="<div class=\"csub\">Kiểm tra dữ liệu theo tháng trước khi đồng bộ.</div>";
   if(!text.includes(uiBefore1))throw Error('Cash Control owner UI anchor 1 moved');
   text=text.replace(uiBefore1,"<div class=\"csub\">Dành cho Admin · Chỉ bổ sung giao dịch mới, giữ nguyên sổ lịch sử.</div>");
   const uiBefore2="<strong>Kiểm tra theo tháng</strong>";
   if(!text.includes(uiBefore2))throw Error('Cash Control owner UI anchor 2 moved');
   text=text.replace(uiBefore2,"<strong>Cập nhật dữ liệu theo tháng</strong>");
   const uiBefore3="Đồng bộ thủ công theo tháng. Chỉ ghi dự án đã đối chiếu số dư và được máy chủ cấp phép.";
   if(!text.includes(uiBefore3))throw Error('Cash Control owner UI anchor 3 moved');
   text=text.replace(uiBefore3,"Chọn tháng → bấm Đồng bộ Google Sheets → xác nhận. Chỉ bổ sung giao dịch mới, không ghi trùng hoặc sửa sổ lịch sử.");
   const uiBefore4="<summary style=\"cursor:pointer;font-weight:700\">Đồng bộ theo dự án</summary>";
   if(!text.includes(uiBefore4))throw Error('Cash Control owner UI anchor 4 moved');
   text=text.replace(uiBefore4,"<summary style=\"cursor:pointer;font-weight:700\">Cập nhật theo dự án</summary>");
   const uiBefore5="Kiểm tra dữ liệu đã tải cho tháng đã chọn. Kết quả sẽ hiển thị dự án có giao dịch và điều kiện còn thiếu.";
   if(!text.includes(uiBefore5))throw Error('Cash Control owner UI anchor 5 moved');
   text=text.replace(uiBefore5,"Chỉ đồng bộ dự án có link Google. Dự án chưa có link tự bỏ qua; tháng sau chỉ cần bấm đồng bộ lần nữa.");
   const uiBefore6="<button class=\"btn primary\" type=\"button\" id=\"ccSyncMultiProjectManual\" hidden>Đồng bộ các dự án đủ điều kiện</button>";
   if(!text.includes(uiBefore6))throw Error('Cash Control owner UI anchor 6 moved');
   text=text.replace(uiBefore6,"<button class=\"btn primary\" type=\"button\" id=\"ccSyncMultiProjectManual\" hidden title=\"Admin: ghi trực tiếp các giao dịch mới vào Google Sheets đã liên kết; xác nhận trước khi ghi, đọc lại sau khi ghi\">Đồng bộ trực tiếp → Google Sheets</button>");
   const uiBefore7="<button class=\"btn\" type=\"button\" id=\"ccSyncBatchAnalyze\">Kiểm tra chung các dự án · chỉ đọc</button>";
   if(!text.includes(uiBefore7))throw Error('Cash Control owner UI anchor 7 moved');
   text=text.replace(uiBefore7,"<details style=\"display:inline-block;border:1px solid #dbe4f0;border-radius:8px;padding:7px 10px;background:#fff\"><summary style=\"cursor:pointer;font-size:12px\">Kiểm tra kỹ thuật · nâng cao</summary><div style=\"display:flex;gap:8px;flex-wrap:wrap;padding-top:8px\"><button class=\"btn\" type=\"button\" id=\"ccSyncBatchAnalyze\">Đối chiếu nguồn · chỉ đọc</button></div></details>");
   const uiBefore8="<button id=\"ccSyncMonthSourceExport\" class=\"btn\" type=\"button\" hidden>Xuất 1 gói nguồn tháng từ Cash Control chính</button>";
   if(!text.includes(uiBefore8))throw Error('Cash Control owner UI anchor 8 moved');
   text=text.replace(uiBefore8,"<button id=\"ccSyncMonthSourceExport\" class=\"btn\" type=\"button\" hidden>Xuất gói tháng (dự phòng · JSON)</button>");
   const uiBefore9="Production: dùng nguồn Cash Control đã xác thực; ghi khi vượt kiểm tra mã chứng từ, số dư và quyền file Google.";
   if(!text.includes(uiBefore9))throw Error('Cash Control owner UI anchor 9 moved');
   text=text.replace(uiBefore9,"Đồng bộ trực tiếp từ Cash Control sang đúng Google Sheets từng dự án. Không cần xuất JSON hoặc mở ChatGPT.");
   const uiBefore10="<summary style=\"cursor:pointer;font-weight:700\">Link Google Sheets theo dự án</summary>";
   if(!text.includes(uiBefore10))throw Error('Cash Control owner UI anchor 10 moved');
   text=text.replace(uiBefore10,"<summary style=\"cursor:pointer;font-weight:700\">Quản lý link Google Sheets · dự án mới</summary>");
   const uiBefore11="<summary style=\"cursor:pointer;font-weight:700;color:#45566c\">Công cụ thí điểm PHU HUNG</summary>";
   if(!text.includes(uiBefore11))throw Error('Cash Control owner UI anchor 11 moved');
   text=text.replace(uiBefore11,"<summary style=\"cursor:pointer;font-weight:700;color:#45566c\">Công cụ PHU HUNG đã triển khai · Nâng cao</summary>");

   text=require('./cash-sync-panel.cjs').buildCashSyncPanel(text);






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
   path.join(__dirname,'../tests/cash-sync-human-ledger.test.cjs'),
   path.join(__dirname,'../tests/cash-multi-project-api.test.cjs'),
   path.join(__dirname,'../tests/cash-shared-test-history-audit.test.cjs'),
   path.join(__dirname,'../tests/cash-shared-test-idempotency.test.cjs'),
   path.join(__dirname,'../tests/cash-google-ui-layout.test.cjs'),
   path.join(__dirname,'../tests/cash-sync-batch-readiness.test.mjs'),
   path.join(__dirname,'../tests/cash-sync-monthly-export-manifest.test.mjs'),
   path.join(__dirname,'../tests/cash-sync-monthly-manual-runner.test.mjs'),
   path.join(__dirname,'../tests/cash-sync-monthly-google-readonly.test.mjs'),
   path.join(__dirname,'../tests/cash-sync-batch-decisions.test.mjs'),
   path.join(__dirname,'../tests/cash-sync-batch-release.test.mjs'),
   path.join(__dirname,'../tests/cash-sync-batch-source-attestation.test.cjs'),
   path.join(__dirname,'../tests/cash-sync-main-only-export.test.mjs'),
   path.join(__dirname,'../tests/cash-sync-report-export.test.mjs'),
   path.join(__dirname,'../tests/cash-sync-month-review-package.test.mjs'),
   path.join(__dirname,'../tests/cash-sync-source-readonly.test.cjs'),
   path.join(__dirname,'../tests/cash-sync-s13-original-readonly.test.cjs'),
   path.join(__dirname,'../tests/cash-sync-s13-source-integrity.test.cjs'),
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
