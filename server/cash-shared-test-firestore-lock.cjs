'use strict';
// TEST-only distributed lock over Firestore REST. Each acquire is an
// atomic create-if-absent; no timers or Firestore listeners. No stale-lock
// automatic takeover: uncertain writes require manual reconciliation.
// This is an implementation building block, NOT an enabled endpoint.
const {randomUUID}=require('node:crypto');
function block(message){throw Error(message)}
function makeLock({project,uid,fetcher,token,collection='cashSyncTestLocks'}={}){
  if(!/^[a-z0-9][a-z0-9-]{3,80}$/.test(project||'')||
     project==='cscecmep-payment'||
     !/^[A-Za-z0-9_-]{4,128}$/.test(uid||'')||
     !/^[A-Za-z0-9._~-]{100,8192}$/.test(token||'')||
     typeof fetcher!=='function'||collection!=='cashSyncTestLocks')
    block('TEST_LOCK_CONFIG_INVALID');
  const url='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(project)+
    '/databases/(default)/documents:commit';
  async function commit(writes){
    const response=await fetcher(url,{method:'POST',headers:{
      Authorization:'Bearer '+token,'Content-Type':'application/json'
    },body:JSON.stringify({writes})});
    if(!response||typeof response.ok!=='boolean')
      block('TEST_LOCK_TRANSPORT_INVALID');
    if(!response.ok)block('TEST_LOCK_HTTP_'+response.status);
    const result=await response.json();
    if(!Array.isArray(result?.writeResults)||result.writeResults.length!==1)
      block('TEST_LOCK_WRITE_RESULT_INVALID');
    return result.writeResults[0];
  }
  function doc(projectName){
    const slug=String(projectName||'').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'');
    if(!slug||slug.length>80||slug==='PHU_HUNG')
      block('TEST_LOCK_PROJECT_INVALID');
    return 'projects/'+project+'/databases/(default)/documents/'+collection+'/'+slug;
  }
  async function acquire(projectName){
    const name=doc(projectName),owner=randomUUID();
    let write;
    try{
      write=await commit([{update:{name,fields:{
        owner:{stringValue:owner},
        actor:{stringValue:uid},
        project:{stringValue:String(projectName)}
      }},currentDocument:{exists:false}}]);
    }catch(err){
      // Even a timeout might mean the server created the lock. Never
      // attempt a second create or an automatic reclaim.
      throw Error('TEST_LOCK_ACQUIRE_UNCERTAIN_OR_HELD: '+err.message);
    }
    const updateTime=write.updateTime;
    if(typeof updateTime!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(updateTime))
      block('TEST_LOCK_UPDATE_TIME_MISSING');
    let released=false;
    return Object.freeze({
      async assertHeld(){
        if(released)block('TEST_LOCK_ALREADY_RELEASED');
        // A separate writer could only replace this lock if it violated the
        // create-only protocol; no stale lock takeover is offered here.
      },
      async release(){
        if(released)block('TEST_LOCK_ALREADY_RELEASED');
        await commit([{delete:name,currentDocument:{updateTime}}]);
        released=true;
      },
      owner
    });
  }
  return Object.freeze({acquire});
}
module.exports={makeLock};
