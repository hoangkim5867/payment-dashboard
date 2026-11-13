'use strict';
/* Cash Control -> Google Sheets: project-independent transaction planner.
 * Pure, no network/side effects. Only a verified server-side executor can
 * eventually act on output after re-reading the source and Google destination.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.CashMultiProjectSync=api;
})(typeof window!=='undefined'?window:null,function(){
  const money=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
  const normalize=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
  const columns=['date','company','contractNo','content','ipc','type','income',
    'subcontract','material','otherDirect','indirect','financial','otherPayable'];
  const key=v=>JSON.stringify(v);
  const strictDate=v=>typeof v==='string'&&/^20\d\d-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(v)&&
    !Number.isNaN(Date.parse(v+'T00:00:00Z'));
  function valuesOf(row){
    if(!Array.isArray(row)||row.length!==13)return null;
    if(!strictDate(row[0]))return null;
    if(row.slice(6).some(x=>money(x)===null))return null;
    return [...row];
  }
  function signature(values){
    return key([values[0],normalize(values[1]),normalize(values[2]),
      normalize(values[3]),normalize(values[4]),normalize(values[5]),
      ...values.slice(6)]);
  }
  function parseHistoryRow(row){
    if(!Array.isArray(row)||row.length<13||!strictDate(row[0]))return null;
    return valuesOf(row.slice(0,13));
  }
  function normalizeProject(project){
    const name=normalize(project);
    if(!name||name.length>180)throw Error('Invalid project');
    return name;
  }
  function planProject({project,month,source,history,mirror}){
    const projectKey=normalizeProject(project);
    if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)||month<'2026-10')
      throw Error('Invalid month');
    if(!Array.isArray(source)||!Array.isArray(history)||!Array.isArray(mirror)||
       source.length>20000||history.length>20000||mirror.length>20000)
      throw Error('Invalid source, history or mirror');
    const evidence=new Map(),histByDate=new Map();
    for(const [index,raw] of history.entries()){
      const row=parseHistoryRow(raw);
      if(!row||!row[0].startsWith(month+'-'))continue;
      const sig=signature(row);
      if(!evidence.has(sig))evidence.set(sig,[]);
      evidence.get(sig).push(index+1);
      const d=row[0];if(!histByDate.has(d))histByDate.set(d,[]);
      histByDate.get(d).push({row:index+1,values:row});
    }
    const mirrorIds=new Map(),mirrorErrors=[];
    for(const [index,row] of mirror.entries()){
      const id=String(row?.id??'').trim();
      if(!id||mirrorIds.has(id)||normalize(row?.project)!==projectKey){
        mirrorErrors.push(index+1);continue;
      }
      mirrorIds.set(id,row);
    }
    const counts=new Map();
    for(const record of source){
      const id=String(record?.id??'').trim();
      if(id)counts.set(id,(counts.get(id)||0)+1);
    }
    const items=[],usedHistory=new Set();
    for(const [index,record] of source.entries()){
      const id=String(record?.id??'').trim();
      const values=valuesOf(record?.values);
      let status='REVIEW_INVALID_SOURCE',googleRow=null,reason='Invalid or duplicate source ID/values';
      if(id&&id.length<=500&&counts.get(id)===1&&
         normalize(record.project)===projectKey&&record.month===month&&
         values&&values[0].startsWith(month+'-')){
        const stored=mirrorIds.get(id);
        if(stored){
          const storedValues=valuesOf(stored.values);
          status=storedValues&&signature(storedValues)===signature(values)?
            'MIRROR_UNCHANGED':'REVIEW_MIRROR_EDIT';
          reason=status==='MIRROR_UNCHANGED'?'Existing source ID and values':
            'Existing source ID has different content; cannot overwrite manual edits';
        }else{
          const candidates=(evidence.get(signature(values))||[])
            .filter(position=>!usedHistory.has(position));
          if(candidates.length===1){
            googleRow=candidates[0];usedHistory.add(googleRow);
            status='HISTORY_CANDIDATE';reason='Exact historical signature; no immutable source ID';
          }else if(candidates.length>1){
            status='REVIEW_DUPLICATE_HISTORY';reason='Multiple identical Google history entries';
          }else{
            const related=(histByDate.get(values[0])||[]).filter(candidate=>
              normalize(candidate.values[3])===normalize(values[3])||
              normalize(candidate.values[2])&&normalize(candidate.values[2])===normalize(values[2])&&
                normalize(candidate.values[4])===normalize(values[4]));
            status=related.length?'REVIEW_POSSIBLE_HISTORY_COLLISION':'NEW_CANDIDATE';
            reason=related.length?'Possible manually recorded historical transaction':
              'Source ID not present in mirror or identical Google history';
          }
        }
      }
      items.push(Object.freeze({sourcePosition:index+1,id,status,googleRow,reason,
        project:projectKey,month,canWrite:false}));
    }
    const blockers=items.filter(x=>x.status.startsWith('REVIEW_')).length+
      mirrorErrors.length;
    return Object.freeze({project:projectKey,month,items:Object.freeze(items),
      totals:Object.freeze({historyCandidates:items.filter(x=>x.status==='HISTORY_CANDIDATE').length,
        unchanged:items.filter(x=>x.status==='MIRROR_UNCHANGED').length,
        newCandidates:items.filter(x=>x.status==='NEW_CANDIDATE').length,
        blocked:blockers}),
      mirrorErrors:Object.freeze(mirrorErrors),
      requiresOtherProjects:false,
      // Production writes must remain inaccessible until a server-side
      // allowlisted destination with rechecked history, IDs and balances exists.
      authorization:'READ_ONLY_CANDIDATES',
      canWrite:false,approvedWrites:0});
  }
  return Object.freeze({planProject,signature,valuesOf});
});
