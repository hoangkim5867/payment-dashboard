'use strict';
// Pure safety checks; no Firebase imports, no network.
const {computeIndexV1,needsIndexRepair}=require('./payment-index-core.cjs');
const MAX_KEY_BYTES=1000,DEFAULT_PAGE=120,MAX_PAGE=200,DEFAULT_WRITES=60,MAX_WRITES=100;
function boundedInt(raw,name,defaultValue,cap){
  const n=raw===undefined?defaultValue:Number(raw);
  if(!Number.isSafeInteger(n)||n<1||n>cap)throw new Error(name+' must be between 1 and '+cap);
  return n;
}
function readOptions(argv,env){
  const flags=new Map();
  for(const arg of argv){
    const pair=arg.match(/^--([a-z-]+)(?:=(.*))?$/);
    if(!pair)throw new Error('Unknown argument');
    if(flags.has(pair[1]))throw new Error('Duplicate flag: '+pair[1]);
    flags.set(pair[1],pair[2]??true);
  }
  const known=new Set(['write','audit','max-docs','max-writes','start-after','production-approved','mark-ready']);
  for(const key of flags.keys())if(!known.has(key))throw new Error('Unknown flag: '+key);
  if(flags.has('mark-ready'))throw new Error('Activation disabled: audits and deployed Rules must be verified separately');
  if(flags.has('write')&&flags.has('audit'))throw new Error('--write conflicts with --audit');
  const write=flags.has('write');
  const projectId=env.GOOGLE_CLOUD_PROJECT||env.GCLOUD_PROJECT||'';
  if(!projectId)throw new Error('GOOGLE_CLOUD_PROJECT is required');
  const emulator=env.FIRESTORE_EMULATOR_HOST||'';
  const demo=projectId.startsWith('demo-');
  if(demo&&!/^127\.0\.0\.1:\d+$/.test(emulator))
    throw new Error('demo projects must use an explicit local emulator');
  const production=!demo && !emulator;
  if(write&&production&&!(
      flags.has('production-approved')&&env.PAYMENT_PRODUCTION_APPROVED==='YES'&&
      env.PAYMENT_BACKUP_VERIFIED==='YES'&&env.PAYMENT_RULES_AUDITED==='YES'
    ))throw new Error('Production writes require --production-approved plus explicit backup, Rules and approval acknowledgments');
  const cursor=flags.get('start-after');
  if(cursor!==undefined && (typeof cursor!=='string'||!cursor||cursor.length>1400))
    throw new Error('Invalid --start-after document ID');
  return {projectId,emulator,write,production,
    maxDocs:boundedInt(flags.get('max-docs'),'max-docs',DEFAULT_PAGE,MAX_PAGE),
    maxWrites:boundedInt(flags.get('max-writes'),'max-writes',DEFAULT_WRITES,MAX_WRITES),
    startAfter:cursor||null};
}
function expectedIndex(row){
  const fields=computeIndexV1(row);
  if(Buffer.byteLength(fields.duplicateKeyV1,'utf8')>MAX_KEY_BYTES)
    return {ok:false,reason:'key_too_long',fields:null};
  if(!fields.duplicateKeyV1||fields.duplicateKeyV1==='||||')
    return {ok:false,reason:'invalid_key',fields:null};
  return {ok:true,reason:'',fields};
}
function inspectPayment(row){
  const expected=expectedIndex(row);
  return {...expected,needsRepair:expected.ok && needsIndexRepair(row)};
}
module.exports={readOptions,expectedIndex,inspectPayment,MAX_KEY_BYTES};
