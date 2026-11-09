'use strict';
// Read-only project catalog for multi-project Cash Control -> Google Sheets.
// NO Google IDs, secrets, Firestore reads, writes or background listeners here.
// Each project must pass a separate read-only ledger/balance audit before activation.
const PROJECTS=Object.freeze([
  {key:'PHU HUNG',display:'PHU HUNG',status:'existing-production'},
  {key:'ELYSIAN',display:'ELYSIAN',status:'pending-audit'},
  {key:'EATON P1',display:'EATON P1',status:'pending-audit'},
  {key:'HONGHAC 1.1',display:'HONGHAC 1.1',status:'pending-audit'},
  {key:'C17',display:'C17',status:'pending-audit'},
  {key:'FOXCONN',display:'FOXCONN',status:'pending-audit'},
  {key:'OCEAN LINK',display:'OCEAN LINK',status:'pending-audit'},
  {key:'SSIS',display:'SSIS',status:'pending-audit'}
].map(p=>Object.freeze(p)));
const byKey=new Map(PROJECTS.map(p=>[p.key,p]));
function normalizeProject(value){return String(value??'').normalize('NFKC').trim().toUpperCase().replace(/\s+/g,' ')}
function projectFor(value){return byKey.get(normalizeProject(value))||null}
function canActivate(value,verified){
  const p=projectFor(value);
  // Never make project-wide activation implicit. Each file needs explicit proof.
  return !!p&&p.status==='pending-audit'&&
    verified?.matchingProject===p.key&&verified?.readOnlyAuditPassed===true&&
    verified?.historicalRowsVerified===true&&verified?.closingBalanceVerified===true&&
    verified?.explicitAdminApproval===true;
}
module.exports={PROJECTS,normalizeProject,projectFor,canActivate};
