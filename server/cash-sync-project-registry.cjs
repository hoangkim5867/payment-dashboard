'use strict';
// Shared reusable project matching. No fixed allowlist or per-project code release.
// Actual activated Google destinations must be separately verified and approved.
// This module does NOT read Firestore or Google and never enables writes itself.
function normalizeProject(value){
  return String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
}
function buildCatalog(projectNames){
  if(!Array.isArray(projectNames)||projectNames.length>1000)
    throw Error('Invalid Cash Control project list');
  return [...new Set(projectNames.map(normalizeProject).filter(x=>x&&x.length<=180))]
    .sort((a,b)=>a.localeCompare(b))
    .map(key=>Object.freeze({key,display:key,status:key==='PHU HUNG'?
      'existing-production':'pending-audit'}));
}
function projectFor(projects,value){
  const key=normalizeProject(value);
  return buildCatalog(projects).find(p=>p.key===key)||null;
}
function canActivate(projects,value,verified){
  const p=projectFor(projects,value);
  // PHU HUNG has its own proven production sync and is never migrated here.
  return !!p&&p.status==='pending-audit'&&
    verified?.matchingProject===p.key&&verified?.readOnlyAuditPassed===true&&
    verified?.historicalRowsVerified===true&&verified?.closingBalanceVerified===true&&
    verified?.explicitAdminApproval===true&&
    verified?.destinationSpreadsheetVerified===true;
}
module.exports={normalizeProject,buildCatalog,projectFor,canActivate};
