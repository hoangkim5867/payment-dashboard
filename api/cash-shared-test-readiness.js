'use strict';
// Public configuration-health diagnostics (only booleans, never credentials,
// file IDs, owner UIDs or finance amounts). Strictly disabled on production.
const {inspect}=require('../server/cash-shared-test-readiness.cjs');
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  if(req.method!=='GET')return res.status(405).json({error:'GET_ONLY'});
  if(process.env.VERCEL_ENV!=='preview')
    return res.status(404).json({error:'TEST_PREVIEW_ONLY'});
  return res.status(200).json(inspect(process.env));
};
