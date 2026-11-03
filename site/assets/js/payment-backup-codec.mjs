// Local-only encrypted Payment backup. No networking, storage or Firebase writes.
// Exports full Firestore value types as tagged data, then encrypts all Payment
// document IDs and values with authenticated AES-GCM using a human passphrase.
const VERSION="cscec-payment-encrypted-snapshot-v1";
const ITERATIONS=350000;
const te=new TextEncoder(),td=new TextDecoder();
function bytesToBase64(bytes){
  let result="";
  for(let i=0;i<bytes.length;i+=16384)
    result+=String.fromCharCode(...bytes.subarray(i,i+16384));
  return btoa(result);
}
function base64ToBytes(value){
  const s=atob(value),a=new Uint8Array(s.length);
  for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);
  return a;
}
function encodeFirestoreValue(value,depth=0){
  if(depth>32)throw Error("Backup cannot safely encode a deeply nested value");
  if(value===null)return ["null"];
  const type=typeof value;
  if(type==="string")return ["string",value];
  if(type==="boolean")return ["boolean",value];
  if(type==="number")return ["number",Number.isFinite(value)?value:String(value)];
  if(type!=="object")throw Error("Backup contains an unsupported Firestore value type");
  if(Array.isArray(value))return ["array",value.map(x=>encodeFirestoreValue(x,depth+1))];
  if(value instanceof Date)return ["date",value.toISOString()];
  if(value instanceof Uint8Array)return ["bytes",bytesToBase64(value)];
  if(Number.isInteger(value.seconds)&&Number.isInteger(value.nanoseconds)&&typeof value.toDate==="function")
    return ["timestamp",value.seconds,value.nanoseconds];
  if(typeof value.toBase64==="function")return ["bytes",value.toBase64()];
  if(typeof value.latitude==="number"&&typeof value.longitude==="number"&&typeof value.isEqual==="function")
    return ["geopoint",value.latitude,value.longitude];
  if(value.type==="document"&&typeof value.path==="string"&&value.firestore)
    return ["reference",value.path];
  if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)
    throw Error("Backup contains an unsupported custom object type");
  return ["map",Object.entries(value).map(([k,v])=>[k,encodeFirestoreValue(v,depth+1)])];
}
function validEncodedValue(value,depth=0){
  if(depth>32||!Array.isArray(value)||typeof value[0]!=="string")return false;
  const [tag,data]=value;
  if(tag==="null")return value.length===1;
  if(tag==="string")return value.length===2&&typeof data==="string";
  if(tag==="boolean")return value.length===2&&typeof data==="boolean";
  if(tag==="number")return value.length===2&&
    (typeof data==="number"||(typeof data==="string"&&["NaN","Infinity","-Infinity"].includes(data)));
  if(tag==="date"||tag==="bytes"||tag==="reference")return value.length===2&&typeof data==="string";
  if(tag==="timestamp")return value.length===3&&Number.isInteger(value[1])&&Number.isInteger(value[2]);
  if(tag==="geopoint")return value.length===3&&typeof value[1]==="number"&&typeof value[2]==="number";
  if(tag==="array")return value.length===2&&Array.isArray(data)&&data.every(v=>validEncodedValue(v,depth+1));
  if(tag==="map")return value.length===2&&Array.isArray(data)&&data.every(v=>
    Array.isArray(v)&&v.length===2&&typeof v[0]==="string"&&validEncodedValue(v[1],depth+1));
  return false;
}
async function deriveKey(cryptoApi,passphrase,salt){
  const material=await cryptoApi.subtle.importKey("raw",te.encode(passphrase),"PBKDF2",false,["deriveKey"]);
  return cryptoApi.subtle.deriveKey({name:"PBKDF2",salt,iterations:ITERATIONS,hash:"SHA-256"},
    material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function checksum(cryptoApi,bytes){
  const value=new Uint8Array(await cryptoApi.subtle.digest("SHA-256",bytes));
  return Array.from(value,x=>x.toString(16).padStart(2,"0")).join("");
}
function validatePayload(payload){
  if(payload?.format!==VERSION||payload.projectId!=="cscecmep-payment"||
    payload.database!=="(default)"||!Array.isArray(payload.docs)||
    payload.docs.length!==payload.count||!payload.count||!payload.createdAt)
      throw Error("Invalid Payment backup format or count");
  const seen=new Set();
  for(const entry of payload.docs){
    if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=="string"||
      !entry[0]||entry[0].includes("/")||seen.has(entry[0])||!validEncodedValue(entry[1]))
      throw Error("Invalid or duplicated Payment document in backup");
    seen.add(entry[0]);
  }
}
async function sealPaymentBackup({cryptoApi,passphrase,docs,createdAt}){
  if(typeof passphrase!=="string"||passphrase.length<14)throw Error("Password must contain at least 14 characters");
  if(!Array.isArray(docs)||!docs.length)throw Error("No Payment records for backup");
  const payload={format:VERSION,projectId:"cscecmep-payment",database:"(default)",
    createdAt:createdAt||new Date().toISOString(),count:docs.length,
    docs:docs.map(x=>[x.id,encodeFirestoreValue(x.data)])};
  validatePayload(payload);
  const plain=te.encode(JSON.stringify(payload));
  const salt=cryptoApi.getRandomValues(new Uint8Array(16));
  const iv=cryptoApi.getRandomValues(new Uint8Array(12));
  const key=await deriveKey(cryptoApi,passphrase,salt);
  const encrypted=new Uint8Array(await cryptoApi.subtle.encrypt({name:"AES-GCM",iv},key,plain));
  const envelope={format:VERSION,algorithm:"AES-256-GCM",kdf:"PBKDF2-SHA256",
    iterations:ITERATIONS,createdAt:payload.createdAt,count:payload.count,
    salt:bytesToBase64(salt),iv:bytesToBase64(iv),sha256:await checksum(cryptoApi,plain),
    encrypted:bytesToBase64(encrypted)};
  // Verify that the ciphertext truly opens and retains all original rows
  // before offering a file download. Never expose plaintext via logging.
  const checked=await openPaymentBackup({cryptoApi,passphrase,envelope});
  if(checked.count!==docs.length||checked.sha256!==envelope.sha256)
    throw Error("Payment backup verification failed");
  return envelope;
}
async function openPaymentBackup({cryptoApi,passphrase,envelope}){
  if(envelope?.format!==VERSION||envelope?.algorithm!=="AES-256-GCM"||
    envelope?.kdf!=="PBKDF2-SHA256"||envelope?.iterations!==ITERATIONS)
    throw Error("Unknown encrypted Payment backup format");
  const salt=base64ToBytes(envelope.salt),iv=base64ToBytes(envelope.iv);
  if(salt.length!==16||iv.length!==12)throw Error("Invalid Payment backup encryption metadata");
  const key=await deriveKey(cryptoApi,passphrase,salt);
  const plain=new Uint8Array(await cryptoApi.subtle.decrypt({name:"AES-GCM",iv},
    key,base64ToBytes(envelope.encrypted)));
  const hash=await checksum(cryptoApi,plain);
  if(hash!==envelope.sha256)throw Error("Payment backup integrity check failed");
  const payload=JSON.parse(td.decode(plain));
  validatePayload(payload);
  if(payload.count!==envelope.count||payload.createdAt!==envelope.createdAt)
    throw Error("Payment backup metadata mismatch");
  return {count:payload.count,createdAt:payload.createdAt,sha256:hash,payload};
}
export {encodeFirestoreValue,validEncodedValue,sealPaymentBackup,openPaymentBackup};
