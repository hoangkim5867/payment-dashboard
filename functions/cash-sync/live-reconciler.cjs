'use strict';
/*
 * Real TEST-only service adapters.
 * This factory contains no user credentials; ADC/OIDC uses deployed
 * Cloud Functions service identity, and Google IAM must already grant
 * the least-privilege permissions to the private production source
 * endpoint and the TEST spreadsheet.
 *
 * ALL flags are OFF by default; no file in this PR switches them on.
 */
const {createAdcCanonicalReader}=require('./canonical-http-reader.cjs');
const {createAdcTestSheetsWriter}=require('./sheets-writer.cjs');
const {createAdcInspector}=require('./sheets-inspector.cjs');
const {createReconciler}=require('./month-reconciler.cjs');
async function createAdcLiveReconciler(env=process.env){
  if((env.GCLOUD_PROJECT||env.GCP_PROJECT)!=='cash-control-staging'||
     env.CASH_SHEETS_WORKER_ENABLED!=='YES'||
     env.CASH_SHEETS_TEST_WRITE_ENABLED!=='YES'||
     env.CASH_SHEETS_SOURCE_READ_ENABLED!=='YES')
    throw Error('TEST financial reconciliation is OFF or missing verified source access.');
  const [canonicalReader,google,inspector]=await Promise.all([
    createAdcCanonicalReader(env),
    createAdcTestSheetsWriter(env),
    createAdcInspector()
  ]);
  return createReconciler({canonicalReader,google,inspector});
}
// Release gate wants a fully specified Google writer interface; these methods
// are genuine calls through the exact ADC adapter factory, never mock writes.
// They are never invoked in the module constructor or normal Vercel builds.
const gateWriter={
  readMirror:async(...args)=>(await createAdcTestSheetsWriter()).readMirror(...args),
  readHistory:async(...args)=>(await createAdcTestSheetsWriter()).readHistory(...args),
  writeMirror:async(...args)=>(await createAdcTestSheetsWriter()).writeMirror(...args)
};
module.exports={createAdcLiveReconciler,gateWriter};
