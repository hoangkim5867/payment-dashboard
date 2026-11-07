'use strict';
/*
 * Accept exactly the JSON export produced by the CURRENT main
 * cashPhuHungExportSourceSnapshot() / legacyCashExportRows().
 * This does not reclassify Payment, payroll, bonus or tax fields.
 *
 * It proves shape/identity/hash only, not freshness/completeness of the
 * Firebase source. Server execution must not treat a browser file as
 * sufficient authority to write unattended.
 */
const {validRow}=require('./three-way.cjs');
const SCHEMA='PHU_HUNG_CASH_SOURCE_V1';
const PROJECT='PHU HUNG';
function parseSourceSnapshot(payload){
  if(typeof payload==='string'){
    if(Buffer.byteLength(payload,'utf8')>3000000)throw Error('Source JSON too large.');
    try{payload=JSON.parse(payload)}catch{throw Error('Invalid source JSON.')}
  }
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||
     payload.schema!==SCHEMA||payload.project!==PROJECT||
     !/^20\d\d-\d\d-\d\dT/.test(String(payload.createdAt||''))||
     payload.sourceProject==='cash-control-staging'||
     typeof payload.sourceProject!=='string'||!payload.sourceProject||
     !Array.isArray(payload.months)||payload.months.length!==2)
    throw Error('Unexpected Cash Control source snapshot.');
  const months=new Map(),ids=new Set();
  for(const block of payload.months){
    if(!block||!['2026-10','2026-11'].includes(block.month)||
       months.has(block.month)||!Array.isArray(block.rows)||
       block.rows.length>10000)
      throw Error('Duplicate, oversized or unsupported month.');
    const validated=[];
    for(const raw of block.rows){
      const row=validRow(raw);
      if(row.month!==block.month||ids.has(row.id))
        throw Error('Cross-month ID duplicate or inconsistent month.');
      ids.add(row.id);
      validated.push(row);
    }
    months.set(block.month,validated);
  }
  if(months.size!==2||!months.has('2026-10')||!months.has('2026-11'))
    throw Error('Complete October/November pilot snapshot required.');
  return {
    schema:SCHEMA,project:PROJECT,
    months,sourceProject:payload.sourceProject,createdAt:payload.createdAt,
    verifiedStructure:true,
    authoritative:false,
    reason:'Client export is not evidence of current complete server state.'
  };
}
module.exports={SCHEMA,PROJECT,parseSourceSnapshot};
