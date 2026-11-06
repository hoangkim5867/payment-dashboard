'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {hashValues}=require('../functions/cash-sync/three-way.cjs');
const {parseSourceSnapshot}=require('../functions/cash-sync/source-snapshot.cjs');
const SOURCE=fs.readFileSync(path.join(__dirname,'../site/cash-control.html'),'utf8');
const values=amount=>['2026-11-06','Vendor','H-001','Thưởng','IPC01','支出',
  0,0,0,0,amount,0,0];
function payload(){
  const v=values(321000);
  return {schema:'PHU_HUNG_CASH_SOURCE_V1',project:'PHU HUNG',
    sourceProject:'cscecmep-payment',createdAt:'2026-11-06T01:20:30.000Z',
    months:[{month:'2026-10',rows:[]},{month:'2026-11',rows:[
      {id:'PHU HUNG:expense:s1',project:'PHU HUNG',month:'2026-11',
        values:v,hash:hashValues(v)}
    ]}]};
}
test('reads actual current-main source export contract, not an invented expense classifier',()=>{
  const begin=SOURCE.indexOf('async function cashPhuHungExportSourceSnapshot(){');
  const end=SOURCE.indexOf('function cashPhuHungInitSourceExporter()',begin);
  assert.ok(begin>0&&end>begin,'main source export must remain available');
  const exportSource=SOURCE.slice(begin,end);
  assert.match(exportSource,/legacyCashExportRows\(month,'PHU HUNG'\)/);
  assert.match(exportSource,/schema:'PHU_HUNG_CASH_SOURCE_V1'/);
  assert.match(exportSource,/_syncIds/);
  assert.ok(!exportSource.includes('setDoc('),'read-only source export must not write Firestore');
});
test('validates exact Cash Control JSON ID, money columns and hashes',()=>{
  const data=parseSourceSnapshot(payload());
  assert.equal(data.verifiedStructure,true);
  assert.equal(data.authoritative,false);
  assert.equal(data.months.get('2026-11')[0].values[10],321000);
  assert.equal(data.months.get('2026-10').length,0);
});
test('rejects altered amounts, cross-month duplicate IDs and incomplete months',()=>{
  const altered=payload();
  altered.months[1].rows[0].values[10]=432100;
  assert.throws(()=>parseSourceSnapshot(altered),/hash/);
  const duplicate=payload();
  duplicate.months[0].rows.push({...duplicate.months[1].rows[0],month:'2026-10',
    values:['2026-10-06',...duplicate.months[1].rows[0].values.slice(1)]});
  duplicate.months[0].rows[0].hash=hashValues(duplicate.months[0].rows[0].values);
  assert.throws(()=>parseSourceSnapshot(duplicate),/duplicate/i);
  const incomplete=payload();incomplete.months.pop();
  assert.throws(()=>parseSourceSnapshot(incomplete),/source snapshot/);
});
test('no user-submitted snapshot is authoritative for unattended writes',()=>{
  const result=parseSourceSnapshot(JSON.stringify(payload()));
  assert.equal(result.authoritative,false);
  assert.match(result.reason,/not evidence/);
});
