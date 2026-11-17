const statusInfo = {
  VERIFIED: ['Đã ghi và kiểm tra', 'good'],
  UNCHANGED: ['Đã khớp', 'info'],
  FAILED: ['Cần kiểm tra', 'warn'],
  SKIPPED: ['Bỏ qua', 'neutral'],
  READY: ['Chờ xác nhận', 'warn'],
  PREVIEW_ONLY: ['Chỉ xem trước', 'neutral'],
};

const reasonText = {
  SOURCE_NOT_VERIFIED: 'Chưa xác minh đủ giao dịch nguồn.',
  SOURCE_REVIEW_REQUIRED: 'Kiểm tra lại giao dịch nguồn.',
  GOOGLE_TARGET_MISSING: 'Chưa có link hoặc chưa chọn đúng tab Google.',
  SERVER_TARGET_NOT_RELEASED: 'File này chưa được phép ghi từ Cash Control.',
  BALANCE_NOT_VERIFIED: 'Chưa có số dư đối chiếu.',
  SOURCE_ROWS_MISSING: 'Chưa tải được giao dịch của tháng này.',
  ADMIN_SESSION_EXPIRED: 'Phiên Admin đã hết hạn.',
  PREVIOUS_WRITE_UNCERTAIN_REQUIRE_GOOGLE_READBACK: 'Cần đọc lại kết quả của dự án trước.',
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function setupCashSyncPanel() {
  const month = document.getElementById('ccSyncBatchMonth');
  if (!month || month.dataset.panelReady) return;
  month.dataset.panelReady = 'true';
  const summary = document.getElementById('ccSyncOwnerSummary');
  const output = document.getElementById('ccSyncBatchResults');
  const status = document.getElementById('ccSyncBatchStatus');
  function reset() {
    summary.hidden = true;
    summary.replaceChildren();
    output.hidden = true;
    output.replaceChildren();
    status.textContent = 'Chưa có kết quả cho tháng này.';
  }
  month.addEventListener('change', reset);
  for (const id of ['ccSyncMultiProjectManual','ccSyncBatchAnalyze'])
    document.getElementById(id).addEventListener('click', reset, {capture:true});
}

export function markCashSyncProject(list, entries, project, message, row) {
  let item = entries.get(project);
  if (!item) {
    item = element('li', 'cc-sync-row');
    entries.set(project, item);
    list.append(item);
  }
  const status = row?.status ??
    (/^Đã ghi/.test(message) ? 'VERIFIED' :
     /^Đã khớp/.test(message) ? 'UNCHANGED' :
     /^Chưa ghi/.test(message) ? 'FAILED' : 'SKIPPED');
  const [label,tone] = statusInfo[status] ?? statusInfo.SKIPPED;
  item.dataset.status = status;
  item.dataset.tone = tone;
  const balance = Number.isFinite(row?.closingBalance) ?
    row.closingBalance.toLocaleString('vi-VN', {maximumFractionDigits:4})+' đ' : '';
  const detail = row ?
    (status === 'FAILED' ? reasonText[row.reason] ?? row.reason :
     status === 'SKIPPED' ? reasonText[row.reason] ?? reasonText[row.releaseReason] ?? 'Chưa đủ điều kiện.' :
     status === 'PREVIEW_ONLY' ? 'Máy chủ chưa mở quyền ghi cho file này.' : '') :
    (status === 'FAILED' || status === 'SKIPPED' ? message : '');
  item.replaceChildren(element('strong', '', project),
    element('span', 'cc-sync-badge', label), element('span', 'cc-sync-balance', balance));
  if (detail) item.append(element('small', '', detail));
}

export function renderCashSyncSummary(month, result, pilotMode, list) {
  const summary = document.getElementById('ccSyncOwnerSummary');
  const rows = [...list.children];
  const priority = ['FAILED','READY','SKIPPED','PREVIEW_ONLY','VERIFIED','UNCHANGED'];
  rows.sort((a,b)=>priority.indexOf(a.dataset.status)-priority.indexOf(b.dataset.status));
  list.append(...rows);
  const title = result.mode==='NOT_APPROVED' ? 'Đã hủy xác nhận ghi' :
    'Kết quả tháng '+month.slice(5)+'/'+month.slice(0,4);
  summary.replaceChildren(element('strong','',title));
  const tiles = element('div','cc-sync-outcomes');
  for (const status of ['VERIFIED','UNCHANGED','FAILED','SKIPPED','PREVIEW_ONLY','READY']) {
    const count = rows.filter(row=>row.dataset.status===status).length;
    if (!count && ['SKIPPED','PREVIEW_ONLY','READY'].includes(status)) continue;
    const [label,tone] = statusInfo[status];
    const tile = element('div','cc-sync-outcome');
    tile.dataset.tone = tone;
    tile.append(element('b','',String(count)),element('span','',label));
    tiles.append(tile);
  }
  summary.append(tiles);
  if (pilotMode==='not-run' && rows.some(row=>row.dataset.status==='FAILED'))
    summary.append(element('small','','Xem lý do ở từng dự án cần kiểm tra.'));
  if (rows.length) {
    const bar = element('div','cc-sync-filters');
    const filter = element('select');
    filter.id = 'ccSyncResultsFilter';
    const label = element('label','','Hiển thị dự án');
    label.htmlFor = filter.id;
    filter.add(new Option('Tất cả ('+rows.length+')',''));
    for (const status of priority) {
      if (rows.some(row=>row.dataset.status===status))
        filter.add(new Option(statusInfo[status][0],status));
    }
    filter.addEventListener('change',()=>{
      for(const row of rows) row.hidden=Boolean(filter.value&&row.dataset.status!==filter.value);
    });
    bar.append(label,filter);
    summary.append(bar);
  }
  summary.hidden = false;
}

export function renderCashSyncAudit(output, diagnostics, table, copy, counts) {
  const title = element('strong','','Kết quả đối chiếu');
  const line = [
    [counts.noDifference,'đã khớp'],
    [counts.newCandidateReview,'có khoản ứng viên'],
    [counts.historyReview,'có cảnh báo đối chiếu'],
    [counts.needsSetup,'thiếu nguồn hoặc link'],
  ].filter(([n])=>n>0).map(([n,label])=>n+' '+label).join(' · ');
  const intro = element('p','',line || 'Không có giao dịch trong phạm vi đã kiểm tra.');
  const scroll = element('div','cc-sync-table');
  scroll.append(table);
  const advanced = element('details','cc-sync-diagnostics');
  advanced.append(element('summary','','Chi tiết đối chiếu'),diagnostics,copy);
  output.replaceChildren(title,intro,scroll,advanced);
  output.hidden = false;
}
