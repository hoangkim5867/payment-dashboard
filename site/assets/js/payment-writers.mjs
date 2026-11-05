// Keep payment lookup fields in the same atomic commit as business data.
// Non-payment-only operations retain the original SDK write path.
export function createPaymentWriters(sdk, computeIndex, options={}) {
  const isPayment = ref => ref?.parent?.path === 'payments';
  // V1 default is retained for existing tests. V2 passes its own single-field
  // server-verifiable candidate key; never write untrusted V1 metadata in V2.
  const indexFields = options.indexFields || ['duplicateKeyV1', 'mepLookupV1', 'paymentLookupSchemaV1'];
  const sourceFields = options.sourceFields || ['project','contractNo','ipcNo','budgetNo','paymentType','contractId','noMEPException','internalExpenseCode','deleted'];
  function topLevelField(field, candidates=[...sourceFields,...indexFields]) {
    if(typeof field === 'string') return field;
    if(typeof sdk.FieldPath === 'function' && typeof field?.isEqual === 'function') {
      for(const key of candidates) if(field.isEqual(new sdk.FieldPath(key))) return key;
    }
    throw new Error('Payment indexed writes require a supported top-level field path');
  }
  function patchFields(args) {
    if(args.length === 1) return args[0];
    const out = {};
    for(let i=0;i<args.length;i+=2) {
      const field=args[i];
      out[topLevelField(field)]=args[i+1];
    }
    return out;
  }
  function sourcePatch(data) {
    const out={};
    for(const key of sourceFields) if(Object.hasOwn(data,key)) {
      const value=data[key];
      const method=value?._methodName || value?._delegate?._methodName;
      if(method === 'deleteField') out[key]=undefined;
      else if(method) throw new Error('Unsupported transform on payment lookup field: '+key);
      else out[key]=value;
    }
    return out;
  }
  function setOptions(options, fields) {
    return options?.mergeFields ? {...options,mergeFields:[...options.mergeFields,...Object.keys(fields)]} : options;
  }
  async function flush(tx, operations, priorReads) {
    // All reads precede writes; the SDK retries against a fresh document on conflict.
    const refs=new Map();
    for(const op of operations) if(isPayment(op.ref) && op.kind!=='delete') refs.set(op.ref.path,op.ref);
    const states=new Map();
    for(const [key,ref] of refs) { const snap=priorReads?.get(key) || await tx.get(ref);states.set(key,snap.exists()?snap.data():{}); }
    for(const op of operations) {
      if(op.kind==='delete') { tx.delete(op.ref);states.set(op.ref.path,{});continue; }
      if(!isPayment(op.ref)) { tx[op.kind](op.ref,...op.args);continue; }
      const data=op.kind==='update'?patchFields(op.args):op.args[0];
      const options=op.args[1];
      const merge=op.kind==='update'||options?.merge===true||Array.isArray(options?.mergeFields);
      let effective=data;
      if(op.kind==='set' && Array.isArray(options?.mergeFields)) {
        const selected=options.mergeFields.map(field=>topLevelField(field,Object.keys(data)));
        effective=Object.fromEntries(sourceFields.filter(k=>selected.includes(k)&&Object.hasOwn(data,k)).map(k=>[k,data[k]]));
      }
      const statesBefore=states.get(op.ref.path);
      const next={...(merge?statesBefore:{}),...sourcePatch(effective)};
      states.set(op.ref.path,next);
      // Workflow-only Staff updates may not repair protected lookup fields on
      // legacy PAID rows. Preserve those fields unless a lookup source changes
      // or the caller explicitly requests an index repair.
      const previous=merge?statesBefore:{};
      const sourceChanged=sourceFields.some(key=>!Object.is(previous?.[key],next[key]));
      const fields=!merge||sourceChanged||indexFields.some(key=>Object.hasOwn(data,key))?computeIndex(next):{};
      if(op.kind==='update') tx.update(op.ref,...(op.args.length===1?[{...data,...fields}]:[...op.args,...Object.entries(fields).flat()]));
      else {
        const payload={...data,...fields};
        if(options)tx.set(op.ref,payload,setOptions(options,fields));else tx.set(op.ref,payload);
      }
    }
  }
  function collector(operations, reader, priorReads) {
    const api={};
    if(reader)api.get=async ref=>{const snapshot=await reader.get(ref);priorReads?.set(ref.path,snapshot);return snapshot;};
    for(const kind of ['set','update','delete']) api[kind]=(ref,...args)=>{operations.push({kind,ref,args});return api;};
    return api;
  }
  async function runTransaction(db, callback, options) {
    return sdk.runTransaction(db,async tx=>{
      const operations=[],priorReads=new Map();
      const value=await callback(collector(operations,tx,priorReads));
      await flush(tx,operations,priorReads);
      return value;
    },options);
  }
  // A workflow-only patch cannot change the V2 lookup index because none of
  // its source or index fields are modified. Keep the native atomic write path:
  // wrapping these patches in a transaction adds an unnecessary document read
  // and fails when the Firestore read quota is exhausted.
  function isIndexNeutralPatch(op) {
    if(!isPayment(op.ref) || !['update','set'].includes(op.kind))return false;
    const data=op.kind==='update'?patchFields(op.args):op.args[0];
    if(!data || typeof data!=='object')return false;
    if(op.kind==='set') {
      const opts=op.args[1];
      if(!opts?.merge && !Array.isArray(opts?.mergeFields))return false;
      if(Array.isArray(opts.mergeFields)) {
        const selected=opts.mergeFields.map(field=>topLevelField(field,Object.keys(data)));
        return !selected.some(key=>sourceFields.includes(key)||indexFields.includes(key));
      }
    }
    return !Object.keys(data).some(key=>sourceFields.includes(key)||indexFields.includes(key));
  }
  function isPlainPaymentSet(op) {
    if(!isPayment(op.ref) || op.kind!=='set')return false;
    const options=op.args[1];
    if(options?.merge || Array.isArray(options?.mergeFields))return false;
    // Preserve the transaction path for source-field transforms, which require validation.
    const data=op.args[0];
    return !sourceFields.some(key=>{
      if(!Object.hasOwn(data,key))return false;
      const value=data[key];
      return Boolean(value?._methodName || value?._delegate?._methodName);
    });
  }
  function writeBatch(db) {
    const operations=[],api=collector(operations);let committed=false;
    const check=()=>{if(committed)throw new Error('This batch has already been committed');};
    for(const kind of ['set','update','delete']) {
      const original=api[kind];api[kind]=(...args)=>{check();return original(...args);};
    }
    api.commit=async()=>{
      check();committed=true;
      // A complete replacement already contains everything needed to calculate
      // the lookup index. No document read (or transaction retry) is necessary.
      // Updates and merges still use the original transaction path.
      const paymentPaths=operations.filter(op=>isPayment(op.ref)).map(op=>op.ref.path);
      const hasRepeatedPaymentPath=new Set(paymentPaths).size!==paymentPaths.length;
      const needsPriorState=hasRepeatedPaymentPath ||
        operations.some(op=>isPayment(op.ref)&&op.kind!=='delete'&&!isPlainPaymentSet(op)&&!isIndexNeutralPatch(op));
      if(needsPriorState)return sdk.runTransaction(db,tx=>flush(tx,operations));
      const batch=sdk.writeBatch(db);
      for(const op of operations) {
        if(isPlainPaymentSet(op)) {
          const payload={...op.args[0],...computeIndex(op.args[0])};
          if(op.args[1])batch.set(op.ref,payload,op.args[1]);
          else batch.set(op.ref,payload);
        } else batch[op.kind](op.ref,...op.args);
      }
      return batch.commit();
    };
    return api;
  }
  async function setDoc(ref,data,options) {
    if(!isPayment(ref))return options?sdk.setDoc(ref,data,options):sdk.setDoc(ref,data);
    if(isIndexNeutralPatch({kind:'set',ref,args:[data,options]}))return sdk.setDoc(ref,data,options);
    if(!options?.merge&&!options?.mergeFields) {
      sourcePatch(data); // Reject unsupported transforms just as the transaction path does.
      return sdk.setDoc(ref,{...data,...computeIndex(data)});
    }
    return sdk.runTransaction(ref.firestore,tx=>flush(tx,[{kind:'set',ref,args:[data,options]}]));
  }
  async function updateDoc(ref,...args) {
    if(!isPayment(ref))return sdk.updateDoc(ref,...args);
    if(isIndexNeutralPatch({kind:'update',ref,args}))return sdk.updateDoc(ref,...args);
    return sdk.runTransaction(ref.firestore,tx=>flush(tx,[{kind:'update',ref,args}]));
  }
  async function addDoc(collection,data) {
    if(collection.path!=='payments')return sdk.addDoc(collection,data);
    sourcePatch(data);
    return sdk.addDoc(collection,{...data,...computeIndex(data)});
  }
  return {addDoc,setDoc,updateDoc,writeBatch,runTransaction};
}
