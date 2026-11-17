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

   // Main-only Excel is a new workbook, never Google File > Download.
   const onlyMainHtml='<button class="btn" type="button" id="ccSyncDownloadMainOnly" title="Tạo file Excel chỉ có một sheet chính, không chứa tab ẩn">Tải Excel · chỉ 1 sheet chính</button>';
   const onlyMainAnchor='<button class="btn" type="button" id="ccSyncBatchAnalyze">Kiểm tra chung các dự án · chỉ đọc</button>';
   if(!text.includes(onlyMainAnchor))throw Error('Monthly audit control moved');
   text=text.replace(onlyMainAnchor,onlyMainAnchor+onlyMainHtml);
   const onlyMainImport='import {scanMonthlyGoogleReadOnly} from "./assets/js/cash-sync-monthly-google-readonly.mjs";';
   if(!text.includes(onlyMainImport))throw Error('Google readonly import moved');
   text=text.replace(onlyMainImport,onlyMainImport+'\nimport {prepareMainOnlyExport,buildMainOnlyWorkbook} from "./assets/js/cash-sync-main-only-export.mjs";');
   const onlyMainFunctionAnchor='async function ccSyncAuditFreshMonthGoogleReadOnly(){';
   if(!text.includes(onlyMainFunctionAnchor))throw Error('Monthly readonly function moved');
   text=text.replace(onlyMainFunctionAnchor,"\n// A spreadsheet with hidden tabs is NOT an access-control boundary.\n// This button downloads a brand new ONE-SHEET workbook from the visible,\n// verified project VIEW; it never copies the original workbook/hidden tabs.\nasync function ccSyncDownloadMainOnly(){\n const button=$('ccSyncDownloadMainOnly'),status=$('ccSyncBatchStatus');\n if(!button||button.disabled||!status)return;\n const admin=currentAuthUser,project=normProject($('ccSyncPaymentPreflightProject')?.value||'');\n if(!admin||!isCashControlOwner()||firebaseConfig.projectId!=='cscecmep-payment'){\n  status.textContent='Chỉ Admin Production được xuất bản một-sheet để chia sẻ.';return;\n }\n if(!project||!ccSyncProjectCatalogNames().includes(project)){\n  status.textContent='Chọn một dự án trong danh mục trước khi xuất sheet chính.';return;\n }\n const url=ccSyncProjectLinkDraft[project];\n if(!ccSyncProjectLinkValid(url)){\n  status.textContent=project+' chưa có link Google đã xác minh. Không tải sổ gốc thay thế.';return;\n }\n const fileId=new URL(url).pathname.match(/\\/spreadsheets\\/d\\/([A-Za-z0-9_-]{20,100})/)?.[1];\n if(!fileId){\n  status.textContent='Link Google không có ID file hợp lệ.';return;\n }\n button.disabled=true;\n try{\n  if(!window.XLSX?.utils?.book_new||!window.XLSX?.writeFile)\n   throw Error('Thư viện xuất Excel chưa tải.');\n  status.textContent='Đang đọc đúng sheet chính của '+project+'; không đọc tab ẩn…';\n  const token=await ccGoogleSheetsAccessToken(\n   'https://www.googleapis.com/auth/spreadsheets.readonly',\n   {includeGrantedScopes:false,prompt:''});\n  const get=async endpoint=>{\n   const response=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+\n    encodeURIComponent(fileId)+endpoint,{headers:{Authorization:'Bearer '+token},\n    method:'GET',cache:'no-store'});\n   if(!response.ok)throw Error('Google Sheets chỉ đọc HTTP '+response.status);\n   return response.json();\n  };\n  const metadata=await get('?fields=spreadsheetId,sheets(properties(sheetId,title,hidden,gridProperties(rowCount)))');\n  if(metadata.spreadsheetId!==fileId)throw Error('Google trả sai ID file.');\n  const title=project==='PHU HUNG'?'PHU HUNG':'CASHCONTROL_VIEW';\n  const view=metadata.sheets?.map(x=>x.properties).find(x=>x?.title===title);\n  if(!view||view.hidden===true)\n   throw Error('Chưa có sheet chính '+title+' đã xác nhận cho dự án. Không xuất sổ kỹ thuật.');\n  if(!Number.isSafeInteger(view.sheetId)||view.gridProperties?.rowCount>10010)\n   throw Error('Số hàng sheet chính vượt giới hạn xác minh.');\n  const col=project==='PHU HUNG'?'N':'O';\n  const range=\"'\"+title.replace(/'/g,\"''\")+\"'!A1:\"+col+\"10010\";\n  const values=await get('/values/'+encodeURIComponent(range)+\n   '?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING');\n  if(!currentAuthUser||currentAuthUser.uid!==admin.uid||!isCashControlOwner()||\n     normProject($('ccSyncPaymentPreflightProject')?.value||'')!==project)\n   throw Error('Phiên Admin hoặc dự án đã thay đổi; không tải.');\n  const exported=prepareMainOnlyExport({project,values:values.values||[],\n   sourceKind:project==='PHU HUNG'?'phu-hung':'technical'});\n  const workbook=buildMainOnlyWorkbook(window.XLSX,exported);\n  if(workbook.SheetNames.length!==1||!exported.mainSheetOnly)\n   throw Error('Tệp xuất có nhiều hơn một sheet; không tải.');\n  window.XLSX.writeFile(workbook,exported.fileName,{bookType:'xlsx'});\n  status.textContent='ĐÃ XUẤT '+exported.fileName+\n   ': đúng 1 sheet chính, '+exported.transactionCount+\n   ' giao dịch; không có tab ẩn, ID nguồn hay dữ liệu kỹ thuật. '+\n   'Chỉ chia sẻ FILE NÀY cho đồng nghiệp; KHÔNG chia sẻ link Google nội bộ.';\n }catch(e){\n  status.textContent='DỪNG xuất 1 sheet: '+String(e?.message||e).slice(0,170)+\n   '. Không tải toàn bộ workbook, không ghi Google.';\n }finally{button.disabled=false}\n}\ndocument.getElementById('ccSyncDownloadMainOnly')?.addEventListener('click',ccSyncDownloadMainOnly);\n"+'\n'+onlyMainFunctionAnchor);
   // Classify the single scoped month audit in memory: zero new network calls.
   // The S13-2 October owner-confirmed write is a release checkpoint, not
   // new source candidates returned by a historical-only Google scan.
   const decisionImport="import {scanMonthlyGoogleReadOnly} from \"./assets/js/cash-sync-monthly-google-readonly.mjs\";";
   if(!text.includes(decisionImport))throw Error('Monthly audit import moved');
   text=text.replace(decisionImport,decisionImport+'\n'+"import {classifyMonthlyAudit} from \"./assets/js/cash-sync-batch-decisions.mjs\";");
   const auditEndAnchor="      if(!requireOwner())throw Error('Phiên Admin thay đổi sau khi đối chiếu.');\n      const table=document.createElement('table');";
   if(!text.includes(auditEndAnchor))throw Error('Monthly audit display moved');
   text=text.replace(auditEndAnchor,
     "      if(!requireOwner())throw Error('Phiên Admin thay đổi sau khi đối chiếu.');\n"+"\n      const actionQueue=classifyMonthlyAudit({month,results:scan.results});\n      if(actionQueue.canWrite!==false||actionQueue.sourceComplete!==false||\n         actionQueue.googleWrites!==0||actionQueue.writeReadyProjects!==0)\n        throw Error('Bảng công việc theo lô chưa an toàn: khóa ghi chưa đóng.');\n      const summaryArea=document.createElement('div');\n      summaryArea.style.cssText='border:1px solid #dbe4f0;border-radius:9px;padding:10px;margin-bottom:10px;background:#fff';\n      const intro=document.createElement('p');\n      intro.style.cssText='font-size:13px;font-weight:750;margin:0 0 6px';\n      intro.textContent='KẾT QUẢ 1 LƯỢT / '+month+' · '+actionQueue.projects+\n        ' dự án có phát sinh · '+actionQueue.counts.completed+\n        ' hoàn tất theo nhật ký Admin · '+actionQueue.counts.noDifference+\n        ' không phát hiện dòng mới trong sổ gốc · '+\n        actionQueue.counts.newCandidateReview+' có ứng viên cần xác minh · '+\n        actionQueue.counts.historyReview+' cần đối chiếu lịch sử/ID · '+\n        actionQueue.counts.needsSetup+' thiếu nguồn/link · 0 dự án được phép ghi.';\n      summaryArea.append(intro);\n      const hint=document.createElement('p');\n      hint.style.cssText='font-size:12px;color:#546276;margin:0 0 5px';\n      hint.textContent='Chỉ nhóm từ dữ liệu vừa đọc, không quét lại; các dự án chưa đủ bằng chứng không được tự chuyển sang ghi. S13-2 đã ghi 3 khoản tháng 10 theo xác nhận Admin, không ghi lại.';\n      summaryArea.append(hint);\n      const categories=[\n       ['completed','Đã hoàn tất, không ghi lại'],\n       ['noDifference','Không có dòng mới trong lịch sử đã đọc'],\n       ['newCandidateReview','Ứng viên mới, chưa đủ điều kiện ghi'],\n       ['historyReview','Cần đối chiếu lịch sử, ID hoặc số dư'],\n       ['needsSetup','Cần link/nguồn trước khi đọc Google']\n      ];\n      for(const [key,title] of categories){\n        const entries=actionQueue.groups[key];\n        if(!entries.length)continue;\n        const details=document.createElement('details');\n        details.style.cssText='font-size:12px;margin-top:5px';\n        const head=document.createElement('summary');\n        head.style.cssText='cursor:pointer;font-weight:650';\n        head.textContent=title+' ('+entries.length+')';\n        details.append(head);\n        const rows=document.createElement('p');\n        rows.style.cssText='padding:3px 0 1px 12px;margin:0;color:#4b5563;line-height:1.65';\n        rows.textContent=entries.map(x=>x.project).join(' · ');\n        details.append(rows);\n        summaryArea.append(details);\n      }\n"+"\n      const table=document.createElement('table');");
   const oldOutput="output.replaceChildren(table,copy);output.hidden=false;";
   if(!text.includes(oldOutput))throw Error('Monthly audit output moved');
   text=text.replace(oldOutput,"output.replaceChildren(summaryArea,table,copy);output.hidden=false;");
   const oldShare="        sourceComplete:false,writeApproved:false,\n        projects:scan.results.map(row=>({";
   if(!text.includes(oldShare))throw Error('Monthly audit share metadata moved');
   text=text.replace(oldShare,
    "        sourceComplete:false,writeApproved:false,\n        actionQueue:{schema:actionQueue.schema,counts:actionQueue.counts,\n          writeReadyProjects:0,googleWrites:0,\n          projects:Object.values(actionQueue.groups).flat().map(x=>({project:x.project,stage:x.stage}))},\n        projects:scan.results.map(row=>({");
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
   path.join(__dirname,'../tests/cash-sync-batch-decisions.test.mjs'),
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
