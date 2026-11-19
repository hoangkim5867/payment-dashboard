'use strict';

const stylesheet = `
#ccGoogleSyncPreviewModal .mbox.cc-sync {max-width:850px!important;padding:22px;box-sizing:border-box}
.cc-sync h3 {margin:0;font-size:21px}
.cc-sync .mhead {margin-bottom:14px}
.cc-sync .cc-sync-account,.cc-sync .cc-sync-card {border:1px solid #dbe5ed;border-radius:12px;background:#fff;padding:14px;margin:0 0 12px}
.cc-sync .cc-sync-account {display:flex;align-items:center;justify-content:space-between;gap:12px;background:#f5f9fc}
.cc-sync .cc-sync-account p {margin:3px 0 0!important}
.cc-sync #ccGoogleSyncProjectLinkCatalog {border:0!important;padding:0!important;background:none!important;margin:0!important}
.cc-sync #ccGoogleSyncProjectLinkCatalog > summary {display:none}
.cc-sync .cc-sync-actions {display:flex;align-items:end;gap:9px;flex-wrap:wrap}
.cc-sync .cc-sync-month {display:grid;gap:4px;flex:0 0 auto}
.cc-sync .cc-sync-month input {min-height:36px}
.cc-sync .cc-sync-results {margin-top:14px}
.cc-sync #ccSyncBatchResults {max-height:none!important;overflow:visible!important;margin-top:8px!important}
.cc-sync #ccSyncBatchStatus {margin:6px 0!important;overflow-wrap:anywhere}
.cc-sync .cc-sync-tools {display:grid;gap:8px}
.cc-sync .cc-sync-tools > details,.cc-sync .cc-sync-diagnostics {border:1px solid #dbe5ed;border-radius:9px;padding:9px 12px;margin:0!important;background:#fafcfd}
.cc-sync .cc-sync-tools summary,.cc-sync .cc-sync-diagnostics summary {cursor:pointer;font-weight:650}
.cc-sync .cc-sync-tools .cc-sync-tools-body {margin-top:10px}
.cc-sync .cc-sync-outcomes {display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:7px;margin:9px 0}
.cc-sync .cc-sync-outcome {padding:9px 10px;background:var(--sync-bg);color:var(--sync-ink);border-radius:8px}
.cc-sync .cc-sync-outcome b {display:block;font-size:19px}
.cc-sync .cc-sync-outcome span {font-size:12px}
.cc-sync .cc-sync-list {list-style:none;margin:0;padding:0;display:grid;gap:6px}
.cc-sync .cc-sync-row {display:grid;grid-template-columns:minmax(100px,1fr) auto minmax(134px,auto);align-items:center;gap:5px 12px;border:1px solid #e1e8ef;border-radius:8px;padding:8px 10px;min-width:0}
.cc-sync .cc-sync-row strong,.cc-sync .cc-sync-row small {overflow-wrap:anywhere}
.cc-sync .cc-sync-row .cc-sync-badge {justify-self:start;font-weight:650;font-size:12px;padding:3px 7px;border-radius:5px;background:var(--sync-bg);color:var(--sync-ink)}
.cc-sync .cc-sync-row .cc-sync-balance {text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.cc-sync .cc-sync-row small {grid-column:1/-1;color:#506174}
.cc-sync [data-tone="good"] {--sync-bg:#e8f5ec;--sync-ink:#175a38}
.cc-sync [data-tone="info"] {--sync-bg:#ecf4fb;--sync-ink:#215577}
.cc-sync [data-tone="warn"] {--sync-bg:#fff0df;--sync-ink:#80400f}
.cc-sync [data-tone="neutral"] {--sync-bg:#eef2f5;--sync-ink:#415365}
.cc-sync .cc-sync-filters {display:flex;align-items:center;justify-content:space-between;gap:8px;margin:9px 0}
.cc-sync .cc-sync-filters select {max-width:100%;padding:5px 7px;border:1px solid #ccd8e4;border-radius:6px;background:#fff}
.cc-sync .cc-sync-table {overflow:auto;margin-top:7px}
.cc-sync .cc-sync-table table {min-width:540px;width:100%}
.cc-sync .cc-sync-row[hidden],.cc-sync [hidden] {display:none!important}
@media(max-width:560px){
 .cc-sync .cc-sync-row {grid-template-columns:minmax(0,1fr) auto}
 .cc-sync .cc-sync-row .cc-sync-balance {grid-column:1/-1;text-align:left}
 #ccGoogleSyncPreviewModal .mbox.cc-sync {padding:13px}
 .cc-sync .cc-sync-account,.cc-sync .cc-sync-card {padding:10px}
 .cc-sync .cc-sync-actions button {min-height:38px}
}
`;

function buildCashSyncPanel(html) {
  function swap(before, after) {
    if (!html.includes(before)) throw Error('Missing Cash Control panel anchor: '+before.slice(0,90));
    html = html.replace(before, after);
  }
  function cut(start, end) {
    const from = html.indexOf(start);
    const to = html.indexOf(end, from + start.length);
    if (from < 0 || to < 0) throw Error('Missing Cash Control panel block: '+start);
    const block = html.slice(from, to);
    html = html.slice(0, from) + html.slice(to);
    return block;
  }
  // The shared Admin runner must carry the canonical ID members and source
  // revision for server-side attestation (not just the Excel projection).
  // Build-site already inserts member IDs and revision before this panel transform.
  // A single explicit approval lists each already-posted transaction's OLD
  // and NEW money/date. Never let a generic 'sync' confirmation change money.
  const oldConfirm=`return confirm('Đồng bộ '+review.readyProjects.length+
            ' dự án đã được máy chủ cấp phép tháng '+month+
            '? Chỉ cập nhật tab kỹ thuật, không sửa sổ gốc.');`;
  const newConfirm=`const types=['Thu','Thầu phụ','Vật tư','Chi phí trực tiếp','Gián tiếp','Tài chính','Phải trả khác','Thuế NK/VAT'];
          const money=n=>Number(n).toLocaleString('vi-VN',{maximumFractionDigits:6})+' đ';
          const changes=(review.corrections||[]).map(c=>{
            const diffs=types.flatMap((type,i)=>c.before.amounts[i]===c.after.amounts[i]?[]:
              [type+': '+money(c.before.amounts[i])+' → '+money(c.after.amounts[i])]);
            return c.project+' · '+c.id.slice(0,90)+'\\n'+
              'Ngày: '+c.before.date+' → '+c.after.date+'\\n'+diffs.join(' · ');
          });
          return confirm('Đồng bộ '+review.readyProjects.length+
            ' dự án tháng '+month+'\\n'+
            (changes.length?'ĐIỀU CHỈNH '+changes.length+' GIAO DỊCH ĐÃ GHI (duyệt số cũ → mới):\\n'+
              changes.join('\\n\\n')+'\\n\\n':'')+
            'Chỉ cập nhật dòng do hệ thống tạo; KHÔNG sửa tab lịch sử gốc. Đồng ý?');`;
  swap(oldConfirm,newConfirm);
  swap('<div class="modal" id="ccGoogleSyncPreviewModal">\n  <div class="mbox"',
    '<style>'+stylesheet+'</style>\n<div class="modal" id="ccGoogleSyncPreviewModal">\n  <div class="mbox cc-sync"');
  const summary = cut('<div id="ccSyncOwnerSummary"', '<details id="ccGoogleSyncProjectLinkCatalog"');
  const report = cut('<div id="ccSyncReportExportPanel"', '<p id="ccSyncBatchStatus"');
  const bridge = cut('<details id="ccSyncMonthSourceAdvanced"', '<p id="ccSyncBatchStatus"');
  const links = cut('<details style="margin-top:10px;padding:10px;border:1px solid #dbe4f0;border-radius:8px;background:#fff">',
    '<details id="ccSyncFoxconnTestProbeArea"');
  const internal = cut('<details id="ccSyncFoxconnTestProbeArea"', '\n      </details>\n    </section>');
  const legacy = cut('<details id="ccGoogleSyncLegacyPilot"', '    <div class="mfoot">\n      <span style="color:#6d7890;font-size:12px">Chưa bật ghi đồng bộ chung.');
  swap('    <div class="mfoot">\n      <span style="color:#6d7890;font-size:12px">Chưa bật ghi đồng bộ chung. Chỉ thao tác thủ công có xác nhận của Admin; giữ nguyên các tab lịch sử.</span>',
    '<div class="cc-sync-tools" id="ccSyncSecondaryTools" hidden>'+links+
    '<details><summary>Tải báo cáo Excel</summary><div class="cc-sync-tools-body">'+report+'</div></details>'+
    '<details><summary>Công cụ kỹ thuật</summary><div class="cc-sync-tools-body">'+bridge+internal+legacy+'</div></details>'+
    '</div>\n    <div class="mfoot">');
  swap('<div class="csub">Dành cho Admin · Chỉ bổ sung giao dịch mới, giữ nguyên sổ lịch sử.</div>', '');
  swap('<section style="margin:14px 0;padding:16px;border:1px solid #dbe4f0;border-radius:12px;background:#f8fafc">',
    '<section class="cc-sync-account">');
  swap('<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">\n        <strong>Tài khoản Google</strong>\n        <button class="btn" type="button" id="ccGoogleSyncAuthorize">Kết nối Google</button>\n      </div>',
    '<div><strong>Kết nối Google</strong>');
  swap('Chưa kết nối Google.</p>\n    </section>', 'Chưa kết nối Google.</p></div>\n<button class="btn" type="button" id="ccGoogleSyncAuthorize">Kết nối Google</button>\n    </section>');
  swap('<section style="margin:14px 0;padding:16px;border:1px solid #dbe4f0;border-radius:12px;background:#fff">\n      <strong>Cập nhật dữ liệu theo tháng</strong>\n      <div style="font-size:12px;color:#45566c;background:#f3f6fa;border-radius:9px;padding:10px;margin-bottom:10px">Chọn tháng → bấm Đồng bộ Google Sheets → xác nhận. Chỉ bổ sung giao dịch mới, không ghi trùng hoặc sửa sổ lịch sử.</div>',
    '<section class="cc-sync-card" aria-label="Đồng bộ theo tháng">');
  swap('<div style="margin:11px 0;padding:11px;border:1px solid #cad8e7;border-radius:9px;background:#fff">\n          <p style="font-size:12px;color:#5c6880;margin:0 0 10px">Chỉ đồng bộ dự án có link Google. Dự án chưa có link tự bỏ qua; tháng sau chỉ cần bấm đồng bộ lần nữa.</p>\n          <div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center">',
    '<div><div class="cc-sync-actions"><div class="cc-sync-month">');
  swap('aria-label="Tháng kiểm tra chung">', 'aria-label="Tháng kiểm tra chung"></div>');
  swap('>Đồng bộ trực tiếp → Google Sheets</button>', '>Đồng bộ sang Google</button>');
  const analyze = cut('<details style="display:inline-block;border:1px solid #dbe4f0', '\n          </div>');
  const button = analyze.match(/<button [^>]*id="ccSyncBatchAnalyze"[^>]*>[^<]+<\/button>/)?.[0];
  if (!button) throw Error('Missing read-only sync button');
  swap('\n          </div>\n          <p id="ccSyncBatchStatus"', button.replace('Đối chiếu nguồn · chỉ đọc','Chỉ đối chiếu')+
    '\n          </div><div class="cc-sync-results">'+summary.replace(/<div [^>]+>[^<]+<\/div>/,
      '<div id="ccSyncOwnerSummary" aria-live="polite" hidden></div>')+'\n          <p id="ccSyncBatchStatus"');
  swap('Chưa rà soát dữ liệu đang có trên trang.</p>', 'Chưa có kết quả cho tháng này.</p>');
  swap('<div id="ccSyncBatchResults" hidden style="margin-top:10px;max-height:290px;overflow:auto"></div>',
    '<div id="ccSyncBatchResults" hidden></div></div>');
  swap('Quản lý link Google Sheets · dự án mới', 'Quản lý link dự án');
  swap('Link lưu nháp trên trình duyệt này. Dự án mới tự xuất hiện trong danh sách.',
    'Dán link vào đúng dự án. Với file trống, dùng số dư đầu kỳ đã xác minh trong Cash Control từ 08/2026.');
  swap('Tải Excel gửi người khác · CHỈ 1 SHEET', 'Bản Excel gồm 1 tab báo cáo');
  swap('<button type="button" class="btn" data-close="ccGoogleSyncPreviewModal">✕</button>',
    '<button type="button" class="btn" aria-label="Đóng bảng đồng bộ" data-close="ccGoogleSyncPreviewModal">✕</button>');

  const integration = 'import {buildOneSheetXlsx} from "./assets/js/cash-sync-report-export.mjs";';
  swap(integration, integration+'\nimport {setupCashSyncPanel,renderCashSyncSummary,markCashSyncProject,renderCashSyncAudit} from "./assets/js/cash-sync-panel.mjs";');
  swap(`    const range="'"+project.replace(/'/g,"''")+"'!A1:O20000";`,
    `    const metaResponse=await fetch('https://sheets.googleapis.com/v4/spreadsheets/'+
      encodeURIComponent(fileId)+'?fields=spreadsheetId,sheets(properties(sheetId,title,hidden))',
      {headers:{Authorization:'Bearer '+ccGoogleSyncToken}});
    const meta=await metaResponse.json().catch(()=>({}));
    if(!metaResponse.ok||meta.spreadsheetId!==fileId)
      throw Error('Không mở được file Google đã liên kết.');
    const tabs=(meta.sheets||[]).map(s=>s.properties).filter(s=>s&&s.hidden!==true&&
      !/^(?:DATA_CASHCONTROL|.*_HISTORY_BACKUP$)/i.test(s.title));
    const configuredGid=url.searchParams.get('gid')??new URLSearchParams(url.hash.slice(1)).get('gid');
    const report=tabs.find(s=>s.title==='CASHCONTROL_VIEW')??
      tabs.find(s=>s.title===project)??
      tabs.find(s=>configuredGid!==null&&String(s.sheetId)===configuredGid);
    if(!report)throw Error('Chưa xác định được tab báo cáo hiển thị.');
    const range="'"+report.title.replace(/'/g,"''")+"'!A1:O20000";`);
  cut('function ccSyncUpdateOwnerSummary(', 'async function ccSyncMultiProjectManual(){');
  swap("ccSyncUpdateOwnerSummary(month,result,pilotMode);","renderCashSyncSummary(month,result,pilotMode,list);");
  swap("      list.style.cssText=\"list-style:none;padding:0;margin:0;display:grid;gap:7px\";", "      list.className='cc-sync-list';");
  const marker = '      const mark=(project,message)=>{';
  cut(marker, '      for(const group of manifest.groups){');
  swap('      const listRows=new Map(),targets=[];', '      const listRows=new Map(),targets=[];\n      const mark=(project,message,row)=>markCashSyncProject(list,listRows,project,message,row);');
  const onProject = html.indexOf('          mark(row.project,(note[row.status]||row.status)+');
  const end = html.indexOf('\n        }\n      });', onProject);
  if(onProject<0||end<0)throw Error('Missing sync status renderer');
  html = html.slice(0,onProject)+'          mark(row.project,note[row.status]||row.status,{...row,releaseReason:releaseReasons.get(row.project)});'+html.slice(end);
  const finalStart = "      status.textContent=(result.mode==='NOT_APPROVED'?";
  cut(finalStart, '      renderCashSyncSummary(month,result,pilotMode,list);');
  swap('      renderCashSyncSummary(month,result,pilotMode,list);',
    "      status.textContent='';\n      renderCashSyncSummary(month,result,pilotMode,list);");
  const catalogPermission = '    if(projectLinkCatalog)projectLinkCatalog.hidden=!(currentAuthUser&&isCashControlOwner());';
  swap(catalogPermission, catalogPermission+
    "\n    $('ccSyncSecondaryTools').hidden=!(currentAuthUser&&isCashControlOwner());");
  swap("            'Admin đã hủy xác nhận riêng PHU HUNG');",
    "            'Admin đã hủy xác nhận riêng PHU HUNG', {status:pilot?.mode==='verified'?'VERIFIED':\n"+
    "              pilot?.mode==='unchanged'?'UNCHANGED':'SKIPPED',closingBalance:pilot?.summary?.balance});");
  swap('output.replaceChildren(summaryArea,table,copy);output.hidden=false;',
    'renderCashSyncAudit(output,summaryArea,table,copy,actionQueue.counts,actionQueue.dateOrderOnly.length);');
  const auditStatus = cut("      status.textContent='ĐỐI CHIẾU THÁNG '+month", '\n    });\n  }catch(e){');
  const auditRender = '      renderCashSyncAudit(output,summaryArea,table,copy,actionQueue.counts,actionQueue.dateOrderOnly.length);';
  swap(auditRender, auditRender+
    "\n      status.textContent='Tháng '+month.slice(5)+'/'+month.slice(0,4)+' · Chỉ đọc';");
  if(!auditStatus.includes('Google reads'))throw Error('Unexpected audit status block');
  const register="  $('ccSyncExportVisibleOnly')?.addEventListener('click',ccSyncExportVisibleOnly);";
  swap(register,register+'\n  setupCashSyncPanel();');
  return html;
}

module.exports = {buildCashSyncPanel};
