/**
 * Cash Control / Payment source-coverage evidence.
 * Receives only data the owner has already loaded into browser memory and
 * one exact-project Firestore count result. Never queries Firebase or Google.
 * A count match is NOT proof of business completeness or write permission.
 */
const normalized=v=>String(v??'').normalize('NFKC').trim();
export function assessProjectSourceCoverage({project,serverCount,rows,hasFullProjectCache=false,
  aliasProjects=[],cashCloudReady=false,legacySeedReady=false}={}){
  const name=normalized(project);
  if(!name||name.length>180)throw Error('INVALID_PROJECT');
  if(!Number.isSafeInteger(serverCount)||serverCount<0)
    throw Error('INVALID_PROJECT_COUNT');
  if(!Array.isArray(aliasProjects)||aliasProjects.length>300)
    throw Error('INVALID_ALIAS_SET');
  if(hasFullProjectCache&&(!Array.isArray(rows)||rows.length>20000))
    throw Error('INVALID_FULL_PROJECT_CACHE');
  const cached=hasFullProjectCache?rows:[];
  const seen=new Set(),actuals=new Set();
  let duplicates=0,missingIds=0,wrongProject=0,paid=0,pending=0,deleted=0;
  for(const row of cached){
    if(!row||typeof row!=='object'||Array.isArray(row)){
      missingIds++;continue;
    }
    const id=normalized(row.id);
    if(!id)missingIds++;
    else if(seen.has(id))duplicates++;
    else seen.add(id);
    if(normalized(row.project)!==name)wrongProject++;
    if(row.deleted===true)deleted++;
    else if(row.processPaymentDate){
      paid++;
      const date=String(row.processPaymentDate).slice(0,10);
      if(/^20\d\d-\d\d-\d\d$/.test(date))actuals.add(date.slice(0,7));
    }else pending++;
  }
  const aliases=[...new Set(aliasProjects.map(normalized).filter(x=>x&&x!==name))];
  const match=hasFullProjectCache && cached.length===serverCount;
  let state='NOT_LOADED';
  if(hasFullProjectCache){
    if(!cashCloudReady||!legacySeedReady)state='CASH_CLOUD_NOT_READY';
    else if(aliases.length||wrongProject)state='PROJECT_ALIAS_REVIEW';
    else if(missingIds||duplicates||deleted)state='SOURCE_ID_REVIEW';
    else if(!match)state='PROJECT_COUNT_MISMATCH';
    else state='CANONICAL_COUNT_MATCH_ONLY';
  }
  return Object.freeze({
    project:name,serverCount,cachedCount:hasFullProjectCache?cached.length:null,
    hasFullProjectCache:Boolean(hasFullProjectCache),
    countsMatch:match,duplicateIds:duplicates,missingIds,wrongProject,
    deleted,paymentPaid:paid,paymentPending:pending,
    actualMonthsInCache:Object.freeze([...actuals].sort()),
    aliasProjectsSeen:aliases.length,
    state,canCompareGoogle:state==='CANONICAL_COUNT_MATCH_ONLY',
    // Source master, internal transfers, old project aliases and Google
    // historic records are NOT certified by a Firestore count.
    paymentBusinessComplete:false,cashControlHistoryComplete:false,
    googleHistoryCompared:false,canWrite:false,
    firestoreDocumentReads:0,googleReads:0,googleWrites:0
  });
}
