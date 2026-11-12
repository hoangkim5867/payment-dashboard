'use strict';
// Pure, read-only validation of an Admin's locally exported link draft.
// Never commit spreadsheet URLs or infer consent to write from an import.
const {normalizeProject,buildCatalog}=require('./cash-sync-project-registry.cjs');
const SCHEMA='CASH_SYNC_PROJECT_LINK_DRAFT_V1';
function parseSheetLink(value){
  if(typeof value!=='string'||value.length>1024)throw Error('Invalid Google Sheets URL');
  let url;
  try{url=new URL(value)}catch{throw Error('Invalid Google Sheets URL')}
  if(url.protocol!=='https:'||url.hostname!=='docs.google.com'||url.username||url.password||
     url.port||!/^\/spreadsheets\/d\/[a-zA-Z0-9_-]+\/edit\/?$/.test(url.pathname))
    throw Error('Not a Google Sheets edit URL');
  const id=url.pathname.split('/')[3];
  const queryGid=url.searchParams.get('gid');
  const hashGid=/^#gid=(\d+)$/.exec(url.hash)?.[1]??null;
  if(url.searchParams.getAll('gid').length>1||
     (queryGid!==null&&!/^\d+$/.test(queryGid))||
     (hashGid!==null&&queryGid!==null&&hashGid!==queryGid)||
     (url.hash&&!hashGid))
    throw Error('Ambiguous Google Sheets tab gid');
  return Object.freeze({spreadsheetId:id,gid:queryGid??hashGid});
}
function validateLinkDraft(input,projectNames){
  const draft=typeof input==='string'?JSON.parse(input):input;
  if(!draft||Array.isArray(draft)||draft.schema!==SCHEMA||
     !draft.projects||typeof draft.projects!=='object'||Array.isArray(draft.projects))
    throw Error('Invalid link draft schema');
  const available=new Set(buildCatalog(projectNames).map(p=>p.key));
  const usedIds=new Set(),seenProjects=new Set(),entries=[];
  const pairs=Object.entries(draft.projects);
  if(pairs.length>1000)throw Error('Too many project links');
  for(const [displayName,value] of pairs){
    const project=normalizeProject(displayName);
    if(!project||!available.has(project))throw Error('Project not found in current Cash Control catalog: '+displayName);
    if(seenProjects.has(project))throw Error('Duplicate normalized project: '+displayName);
    seenProjects.add(project);
    if(value===null||value==='')continue;
    const link=parseSheetLink(value);
    if(usedIds.has(link.spreadsheetId))throw Error('Same spreadsheet assigned to multiple projects');
    usedIds.add(link.spreadsheetId);
    entries.push(Object.freeze({project,spreadsheetId:link.spreadsheetId,gid:link.gid,
      status:project==='PHU HUNG'?'existing-sync-protected':'pending-readonly-audit'}));
  }
  return Object.freeze({schema:SCHEMA,projectsCount:seenProjects.size,
    linkedCount:entries.length,entries:Object.freeze(entries),
    // Import is always a local draft, NEVER an activation flag.
    canWrite:false});
}
module.exports={SCHEMA,parseSheetLink,validateLinkDraft};
