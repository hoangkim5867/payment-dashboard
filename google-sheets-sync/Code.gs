/**
 * Cash Control → Google Sheets: GOOGLE-SIDE INSPECTION ONLY.
 *
 * Run from an Apps Script project owned by the sheet administrator.
 * Configure Script Properties > SHEET_MAP_JSON with a JSON object:
 * {"PHU HUNG":{"spreadsheetId":"...","sheetName":"DATA_CASHCONTROL"}}
 *
 * No web endpoint, no onOpen trigger, no write operations, no Firestore access.
 * Never expose access tokens / credentials in Cash Control browser source.
 */
const CASH_SYNC_MAP_PROPERTY = 'SHEET_MAP_JSON';
const CASH_SYNC_EXPECTED_HEADER = [
  'sourceId', 'projectKey', 'month', 'date', 'company', 'contractNo',
  'content', 'ipc', 'type', 'income', 'subcontract', 'material',
  'otherDirect', 'indirect', 'financial', 'otherPayable', 'balance',
  'sourceHash', 'syncStatus'
];

function cashSyncGetProjectMap_() {
  const raw = PropertiesService.getScriptProperties().getProperty(CASH_SYNC_MAP_PROPERTY);
  if (!raw) {
    // Only the user-provided PHU HUNG TEST copy; inspection-only fallback.
    // No writes are present anywhere in this Apps Script.
    return {'PHU HUNG': {
      spreadsheetId:'1bxY6jQ3qHJ0oTiWDmbH4eeFgZR7goqX3_s1Kz9UlfD4',
      sheetName:'DATA_CASHCONTROL'
    }};
  }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (_) { throw Error('SHEET_MAP_JSON không phải JSON hợp lệ.'); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw Error('SHEET_MAP_JSON phải là object {projectKey:{spreadsheetId,sheetName}}.');
  }
  const result = {};
  for (const [projectKey, value] of Object.entries(parsed)) {
    if (!projectKey.trim() || !value || typeof value !== 'object') {
      throw Error('Mapping dự án không hợp lệ.');
    }
    const id = String(value.spreadsheetId || '').trim();
    const tab = String(value.sheetName || 'DATA_CASHCONTROL').trim();
    if (!/^[a-zA-Z0-9_-]{20,}$/.test(id) || !tab) {
      throw Error('Mapping thiếu spreadsheetId hợp lệ hoặc tên tab: ' + projectKey);
    }
    if (Object.values(result).some(x => x.spreadsheetId === id)) {
      throw Error('Hai dự án đang trỏ về cùng Spreadsheet ID, cần xác nhận lại: ' + projectKey);
    }
    result[projectKey] = {spreadsheetId:id, sheetName:tab};
  }
  return result;
}

/** Read-only: returns project mapping status and existing target header. */
function cashSyncInspectDestinations() {
  const mapping = cashSyncGetProjectMap_();
  const results = [];
  for (const [projectKey, target] of Object.entries(mapping)) {
    try {
      const spreadsheet = SpreadsheetApp.openById(target.spreadsheetId);
      const sheet = spreadsheet.getSheetByName(target.sheetName);
      if (!sheet) {
        results.push({projectKey, status:'MISSING_TAB', title:spreadsheet.getName(),
          sheetName:target.sheetName, rows:0, headerMatches:false});
        continue;
      }
      const header = sheet.getLastColumn()
        ? sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(v=>String(v || '').trim())
        : [];
      const expected = CASH_SYNC_EXPECTED_HEADER;
      const headerMatches = header.length === expected.length &&
        expected.every((col,i)=>col===header[i]);
      results.push({projectKey, status: headerMatches ? 'READY_FOR_FURTHER_TEST' : 'HEADER_REVIEW',
        title:spreadsheet.getName(), sheetName:target.sheetName,
        rows:Math.max(0,sheet.getLastRow()-1), headerMatches});
    } catch (error) {
      results.push({projectKey, status:'ACCESS_ERROR', error:String(error.message || error)});
    }
  }
  Logger.log(JSON.stringify(results,null,2));
  return results;
}

/** Read-only: compare IDs and hash strings against ONE configured sheet.
 * This does not change the sheet; never infer ID from position/date/amount.
 * Input should be anonymized fixtures until authorization is implemented.
 */
function cashSyncPreviewDiff(projectKey, candidateRecords) {
  const mapping = cashSyncGetProjectMap_();
  const target = mapping[String(projectKey || '')];
  if (!target) throw Error('Dự án chưa được cấu hình mapping.');
  if (!Array.isArray(candidateRecords)) throw Error('Danh sách giao dịch không hợp lệ.');
  const spreadsheet = SpreadsheetApp.openById(target.spreadsheetId);
  const sheet = spreadsheet.getSheetByName(target.sheetName);
  if (!sheet) throw Error('Chưa có tab DATA_CASHCONTROL; chưa được tạo tự động.');
  const lastRow=sheet.getLastRow(), lastCol=sheet.getLastColumn();
  const headers=lastCol?sheet.getRange(1,1,1,lastCol).getValues()[0].map(String):[];
  if (headers.length!==CASH_SYNC_EXPECTED_HEADER.length ||
      !CASH_SYNC_EXPECTED_HEADER.every((h,i)=>h===headers[i])) {
    throw Error('Header Sheet không khớp; không thể đối chiếu an toàn.');
  }
  const existing=lastRow>1?sheet.getRange(2,1,lastRow-1,lastCol).getValues():[];
  const byId=new Map();
  for (const row of existing) {
    const id=String(row[0]||'').trim();
    if (!id) continue;
    if (byId.has(id)) throw Error('Sheet có ID giao dịch trùng: '+id);
    byId.set(id,String(row[17]||''));
  }
  const seen=new Set();
  const summary={projectKey,new:0,unchanged:0,changed:0,invalid:0,conflicts:0,total:candidateRecords.length};
  for (const row of candidateRecords) {
    const id=String(row && row.sourceId || '').trim();
    const hash=String(row && row.sourceHash || '').trim();
    if (!id || !hash || seen.has(id) || String(row.projectKey||'')!==projectKey) {
      summary.invalid++;continue;
    }
    seen.add(id);
    if (!byId.has(id)) summary.new++;
    else if (byId.get(id)===hash) summary.unchanged++;
    else summary.changed++;
  }
  // Existing manual edits are not detectable from ID/hash alone.
  // Do NOT enable writes until full 3-way conflict detection is designed.
  summary.warning='Chưa đánh giá chỉnh sửa tay; chưa đủ điều kiện ghi tự động.';
  Logger.log(JSON.stringify(summary));
  return summary;
}

/**
 * Phase 1 reconciliation for PHU HUNG's existing sheet (read-only).
 * Reports October totals and identifies possible duplicate legacy keys.
 * This function intentionally never modifies cells or logs customer names.
 */
function cashSyncAuditExistingPhuHungOctober() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName('PHU HUNG');
  if (!sheet) throw Error('Không tìm thấy tab PHU HUNG.');
  const values = sheet.getDataRange().getValues();
  const tz = 'Asia/Ho_Chi_Minh', month = '2026-10';
  const byKey = new Map();
  let count = 0, income = 0, expense = 0, lastBalance = null, ambiguous = 0;
  const amount = x => typeof x === 'number' ? x :
    (Number(String(x || '0').replace(/,/g, '')) || 0);
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    const raw = row[0];
    const date = raw instanceof Date && !isNaN(raw)
      ? Utilities.formatDate(raw, tz, 'yyyy-MM-dd')
      : String(raw || '').trim().replace(/\//g, '-');
    if (!date.startsWith(month + '-')) continue;
    const inflow = amount(row[6]);
    const outflow = row.slice(7, 13).reduce((sum, n) => sum + amount(n), 0);
    const key = [date, amount(inflow), amount(outflow),
      String(row[2] || '').trim().toUpperCase(),
      String(row[4] || '').trim().toUpperCase()].join('|');
    byKey.set(key, (byKey.get(key) || 0) + 1);
    count++; income += inflow; expense += outflow; lastBalance = amount(row[13]);
  }
  for (const n of byKey.values()) if (n > 1) ambiguous += n;
  const result = {month, rows:count, income, expense, lastBalance,
    ambiguousRows:ambiguous, source:'Existing Google Sheet only',
    safeToWrite:false};
  Logger.log(JSON.stringify(result));
  return result;
}

/**
 * Non-destructive preparation check. An existing 2026-10 baseline is NOT
 * automatically adopted as synced. All same-month rows need reviewed matching.
 */
function cashSyncCheckPilotReady() {
  const mapping = cashSyncGetProjectMap_();
  const projectKey = Object.keys(mapping).find(k=>/PHU\s*HUNG/i.test(k));
  if (!projectKey) throw Error('Chưa map PHU HUNG với bản sao Google Sheet.');
  const x = mapping[projectKey];
  const spreadsheet = SpreadsheetApp.openById(x.spreadsheetId);
  const legacy = spreadsheet.getSheetByName('PHU HUNG');
  if (!legacy) throw Error('Không có tab PHU HUNG gốc, dừng để tránh mất lịch sử.');
  const probe = cashSyncInspectDestinations();
  return {projectKey, target:x.sheetName, legacyRows:legacy.getLastRow(),
    mapping:probe, writeEnabled:false};
}

/**
 * Explicit opt-in setup, TEST COPY ONLY.
 * Creates a new DATA_CASHCONTROL tab. Does not touch historical PHU HUNG cells.
 * NOT called automatically and NOT a real synchronization.
 */
function cashSyncPreparePilotTab() {
  const spreadsheetId='1bxY6jQ3qHJ0oTiWDmbH4eeFgZR7goqX3_s1Kz9UlfD4';
  const spreadsheet=SpreadsheetApp.openById(spreadsheetId);
  if (!/TEST/i.test(spreadsheet.getName()) ||
      !spreadsheet.getSheetByName('PHU HUNG')) {
    throw Error('Chỉ cho phép bản PHU HUNG TEST có tab lịch sử.');
  }
  let sheet=spreadsheet.getSheetByName('DATA_CASHCONTROL');
  if (sheet) {
    const values=sheet.getLastColumn()
      ? sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(String)
      : [];
    if (values.length && (values.length!==CASH_SYNC_EXPECTED_HEADER.length ||
        !CASH_SYNC_EXPECTED_HEADER.every((h,i)=>h===values[i]))) {
      throw Error('Tab DATA_CASHCONTROL đã có dữ liệu/cấu trúc khác. Không sửa.');
    }
    if (sheet.getLastRow()>1) {
      throw Error('Tab đồng bộ đã có giao dịch. Không chạy bước khởi tạo.');
    }
  } else {
    sheet=spreadsheet.insertSheet('DATA_CASHCONTROL');
  }
  if (!sheet.getLastRow()) {
    sheet.getRange(1,1,1,CASH_SYNC_EXPECTED_HEADER.length)
      .setValues([CASH_SYNC_EXPECTED_HEADER]);
    sheet.setFrozenRows(1);
  }
  return {spreadsheet:spreadsheet.getName(),sheet:sheet.getName(),
    historicalRows:spreadsheet.getSheetByName('PHU HUNG').getLastRow(),
    testOnly:true, transactionsWritten:0};
}
