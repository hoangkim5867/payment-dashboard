// This module only observes existing SDK calls; it never makes additional reads.
// No source data, document paths/IDs, query values, or user identifiers are emitted.
export function describeReadSource(ref){
    const query=ref?._query;
    const rawPath=ref?.path ?? query?.path?.toString?.() ?? '';
    const collection=String(query?.collectionGroup || String(rawPath).split('/')[0] || 'unknown')
        .replace(/[^a-zA-Z0-9_-]/g,'').slice(0,64) || 'unknown';
    const scope=(Array.isArray(query?.filters)&&query.filters.length>0)?'filtered':
        ref?.type==='collection'?'collection':'unknown';
    return {collection,scope};
}
// Retain only the HTML source line and function; never expose query parameters or IDs.
function callerLocation(){
  try{
    for(const line of String(new Error().stack||'').split('\n')){
      const f=line.match(/\/([A-Za-z0-9_-]+\.html):(\d+)/);
      if(!f)continue;
      const fn=line.match(/\bat\s+([A-Za-z_$][\w$.]*)\s*\(/);
      return (fn?.[1]||'anonymous')+'@'+f[1]+':'+f[2];
    }
  }catch{}
  return 'unknown';
}
export function createReadTracer(sdk,emit=null){
    const keys=['getDocs','getDocsFromServer','getDocsFromCache',
        'getDoc','getDocFromServer','getDocFromCache','getCountFromServer'];
    if(!emit){
        return Object.fromEntries([...keys,'onSnapshot'].map(key=>[key,sdk[key]]));
    }
    function safeReport(data){
        try{emit(data);}catch{/* Diagnostics never affect the original call. */}
    }
    function measure(method,ref,args){
        const source=describeReadSource(ref),started=Date.now(),caller=callerLocation();
        // Keep promise rejection, result identity and SDK validation behavior.
        return sdk[method](ref,...args).then(snapshot=>{
            safeReport({
                operation:method,...source,caller,
                durationMs:Date.now()-started,
                documentsReturned:typeof snapshot?.size==='number' ? snapshot.size :
                    (typeof snapshot?.exists==='function'?(snapshot.exists()?1:0):null),
                fromCache:snapshot?.metadata?.fromCache??null
            });
            return snapshot;
        },error=>{
            safeReport({operation:method,...source,caller,durationMs:Date.now()-started,
                error:String(error?.code||error?.name||'error').slice(0,48)});
            throw error;
        });
    }
    const api=Object.fromEntries(keys.map(method=>[
        method,(ref,...args)=>measure(method,ref,args)
    ]));
    api.onSnapshot=(ref,...args)=>{
        const source=describeReadSource(ref),started=Date.now(),caller=callerLocation();
        const callbackIndex=args.findIndex(x=>typeof x==='function' ||
            (x&&typeof x==='object'&&typeof x.next==='function'));
        let first=true;
        function observe(snapshot){
            const docs=typeof snapshot?.size==='number'?snapshot.size:
                (typeof snapshot?.exists==='function'?(snapshot.exists()?1:0):null);
            let changes=null,added=0,modified=0,removed=0;
            if(typeof snapshot?.docChanges==='function'){
                try{const updates=snapshot.docChanges();changes=updates.length;for(const x of updates){if(x.type==='added')added++;else if(x.type==='modified')modified++;else if(x.type==='removed')removed++;}}catch{/* SDK may not expose changes. */}
            }
            safeReport({
                operation:first?'listen-first':'listen-change',
                ...source,caller,documentsReturned:docs,documentChanges:changes,added,modified,removed,
                fromCache:snapshot?.metadata?.fromCache??null,
                durationMs:first?Date.now()-started:null
            });
            first=false;
        }
        if(callbackIndex>=0){
            const original=args[callbackIndex];
            if(typeof original==='function'){
                args[callbackIndex]=function(snapshot){observe(snapshot);return original(snapshot);};
            }else{
                args[callbackIndex]={...original,next(snapshot){observe(snapshot);return original.next.call(original,snapshot);}};
            }
        }
        const unsubscribe=sdk.onSnapshot(ref,...args);
        safeReport({operation:'listen-start',...source,caller});
        let stopped=false;
        return function(){
            if(!stopped){stopped=true;safeReport({operation:'listen-stop',...source,caller});}
            return unsubscribe();
        };
    };
    return api;
}
