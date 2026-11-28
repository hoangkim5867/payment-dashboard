'use strict';
// An explicitly enabled, Admin-only single-device test. Never schedules work,
// reads Payment records, retains device endpoints or accepts notification text.
const {verifyFirebaseAdminToken}=require('../server/cash-sync-guard.cjs');
const {vapidConfig,sendPilot}=require('../server/payment-reminder-push.cjs');
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
 if(process.env.PAYMENT_REMINDER_PUSH_PILOT!=='YES'||process.env.VERCEL_ENV!=='production')return res.status(503).json({error:'Web Push pilot is not enabled'});
 const uid=process.env.CASH_SYNC_ADMIN_UID,project=process.env.CASH_SYNC_FIREBASE_PROJECT_ID;
 if(!uid||project!=='cscecmep-payment')return res.status(503).json({error:'Admin identity is not configured'});
 const token=String(req.headers.authorization||'').match(/^Bearer (\S+)$/)?.[1];
 try{await verifyFirebaseAdminToken(token,{uid,project})}catch{return res.status(403).json({error:'Admin only'})}
 try{
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!body||JSON.stringify(body).length>3000)return res.status(400).json({error:'Invalid request'});
  const cfg=vapidConfig(process.env);
  if(body.action==='key')return res.status(200).json({publicKey:cfg.publicKey});
  if(body.action==='send'&&typeof body.endpoint==='string')return res.status(200).json(await sendPilot(cfg,body.endpoint));
  return res.status(400).json({error:'Invalid request'});
 }catch{return res.status(502).json({error:'Web Push pilot could not send; check Chrome support and configuration'})}
};
