'use strict';
// All four legacy Preview-only endpoints share one deployment function.
// Existing handler authentication, body validation, and data guards are unchanged.
const handlers=Object.freeze({
  'google-probe':require('../server/cash-shared-test-google-probe.cjs'),
  'history-audit':require('../server/cash-shared-test-history-audit.cjs'),
  'idempotency':require('../server/cash-shared-test-idempotency.cjs'),
  'real-compare':require('../server/cash-shared-test-real-compare.cjs')
});
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='POST')return res.status(405).json({error:'POST_ONLY'});
  if(process.env.VERCEL_ENV!=='preview')return res.status(403).json({error:'PREVIEW_ONLY'});
  const operation=req.query?.operation;
  if(typeof operation!=='string'||!Object.hasOwn(handlers,operation))return res.status(404).json({error:'UNKNOWN_TEST_OPERATION'});
  return handlers[operation](req,res);
};
