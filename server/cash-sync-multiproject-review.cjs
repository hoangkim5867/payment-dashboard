'use strict';
// Read-only coordinator: consumes snapshots retrieved by an authenticated caller.
// NEVER requests Google/Firebase data, NEVER includes URLs, and NEVER approves writes.
const {validateLinkDraft}=require('./cash-sync-link-draft.cjs');
const {verifyDestinationMetadata}=require('./cash-sync-multiproject-preflight.cjs');
const {auditHistoricalLedger}=require('./cash-sync-multiproject-reconcile.cjs');
const {normalizeProject}=require('./cash-sync-project-registry.cjs');

function makeProjectReview(entry, input){
  const project=entry.project;
  if(project==='PHU HUNG'||entry.status==='existing-sync-protected')
    return Object.freeze({project,status:'separate-existing-sync',canWrite:false});
  if(!input||typeof input!=='object'||Array.isArray(input))
    return Object.freeze({project,status:'awaiting-readonly-snapshot',canWrite:false});
  try{
    if(!Object.hasOwn(input,'metadata'))throw Error('Missing Google metadata');
    const metadata=verifyDestinationMetadata(entry,input.metadata);
    if(!Object.hasOwn(input,'historicalRows')||
       !Object.hasOwn(input,'sourceRows'))
      return Object.freeze({project,status:'awaiting-ledger-snapshots',
        tab:metadata.selectedTabTitle,metadataVerified:true,canWrite:false});
    const report=auditHistoricalLedger(project,input.historicalRows,
      input.sourceRows,{confirmedOpeningBalance:input.confirmedOpeningBalance});
    const blocked=report.kind==='blank-tab'||
      !report.historicalRowsVerified||!report.closingBalanceVerified;
    // A precise historical match alone does not establish source completeness
    // or ongoing sync eligibility. Never elevate this to "ready to write".
    return Object.freeze({project,tab:metadata.selectedTabTitle,
      status:blocked?'requires-manual-reconciliation':
        'offline-matched-needs-source-completeness',
      historicalCount:report.historicalCount,sourceCount:report.sourceCount,
      unmatchedHistorical:report.unmatchedHistorical,
      unmatchedSource:report.unmatchedSource,
      ambiguousMatches:report.ambiguousMatches||0,
      dateOrderRegressions:report.dateOrderRegressions||0,
      dateOrderExamples:report.dateOrderExamples||[],
      continuityErrorCount:report.continuityErrorCount||0,
      historicalRowsVerified:report.historicalRowsVerified,
      closingBalanceVerified:report.closingBalanceVerified,
      sourceCompletenessVerified:false,canWrite:false});
  }catch(error){
    // Do not disclose IDs, credentials, raw amounts or spreadsheet content.
    const known=['CASH_SYNC_PREFLIGHT_BLOCKED','CASH_SYNC_RECONCILIATION_BLOCKED'];
    return Object.freeze({project,status:'blocked',
      reason:known.includes(error?.code)?'metadata-or-ledger-mismatch':
        'invalid-or-unsupported-snapshot',canWrite:false});
  }
}
function reviewMultiProjectDraft(draft,catalog,snapshots={}){
  const validated=validateLinkDraft(draft,catalog);
  if(!snapshots||typeof snapshots!=='object'||Array.isArray(snapshots))
    throw Error('Invalid snapshots');
  const keys=new Set(validated.entries.map(e=>e.project));
  // Snapshots for unknown projects should never be accidentally consumed.
  for(const project of Object.keys(snapshots))
    if(!keys.has(normalizeProject(project)))throw Error('Snapshot for unconfigured project');
  const normalized=new Map();
  for(const [project,snapshot] of Object.entries(snapshots)){
    const key=normalizeProject(project);
    if(normalized.has(key))throw Error('Duplicate normalized snapshot project');
    normalized.set(key,snapshot);
  }
  const projects=validated.entries.map(entry=>
    makeProjectReview(entry,normalized.get(entry.project)));
  const statuses={};
  for(const item of projects)statuses[item.status]=(statuses[item.status]||0)+1;
  return Object.freeze({linkedCount:validated.linkedCount,reviewedCount:projects.length,
    statuses:Object.freeze(statuses),projects:Object.freeze(projects),canWrite:false});
}
module.exports={reviewMultiProjectDraft,makeProjectReview};
