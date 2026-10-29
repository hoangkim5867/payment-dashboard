export * from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import * as sdk from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {computeIndexV1} from './payment-index-core.mjs';
import {createPaymentWriters} from './payment-writers.mjs';
export const {addDoc,setDoc,updateDoc,writeBatch,runTransaction}=createPaymentWriters(sdk,computeIndexV1);

/*
 * Opt-in, read-only instrumentation for diagnosing Firestore reads.
 * URL: ?firestoreAudit=1. No new network requests, no document contents,
 * no auth values, no document IDs. Does not change SDK query results.
 */
import {createReadTracer} from './firestore-read-trace.mjs';
const readAuditEnabled = typeof window!=='undefined' &&
    new URLSearchParams(window.location.search).get('firestoreAudit')==='1';
const readAuditEvents=[];
const readAuditAggregate=new Map();
let readAuditActiveListeners=0;
function recordReadAudit(event){
    if(!readAuditEnabled)return;
    try{
        const row={
            time:new Date().toISOString(),
            page:window.location.pathname.split('/').pop() || 'index',
            operation:event.operation,
            collection:event.collection,
            scope:event.scope,
            documentsReturned:event.documentsReturned??null,
            documentChanges:event.documentChanges??null,
            fromCache:event.fromCache??null,
            durationMs:event.durationMs??null,
            error:event.error??null
        };
        if(event.operation==='listen-start')readAuditActiveListeners++;
        if(event.operation==='listen-stop')readAuditActiveListeners=Math.max(0,readAuditActiveListeners-1);
        readAuditEvents.push(row);
        if(readAuditEvents.length>500)readAuditEvents.shift();
        const key=[row.page,row.operation,row.collection,row.scope].join('|');
        const prior=readAuditAggregate.get(key)||{page:row.page,operation:row.operation,collection:row.collection,scope:row.scope,calls:0,documentsReturned:0,documentChanges:0,cacheResponses:0,errors:0};
        prior.calls++;
        prior.documentsReturned+=Number(row.documentsReturned)||0;
        prior.documentChanges+=Number(row.documentChanges)||0;
        if(row.fromCache===true)prior.cacheResponses++;
        if(row.error)prior.errors++;
        readAuditAggregate.set(key,prior);
        console.info('[Firestore Read Trace]',row);
    }catch(error){
        // Diagnostics must never interfere with business logic.
        console.warn('Firestore read trace unavailable',error);
    }
}
if(readAuditEnabled){
    window.__paymentReadAudit=Object.freeze({
        summary:()=>({page:window.location.pathname,activeListeners:readAuditActiveListeners,groups:[...readAuditAggregate.values()].map(x=>({...x})),recentEvents:readAuditEvents.slice()}),
        reset:()=>{readAuditEvents.length=0;readAuditAggregate.clear();}
    });
    console.info('[Firestore Read Trace] Enabled. For aggregated counts: __paymentReadAudit.summary(). These are client-side snapshot counts, NOT billed Firebase reads.');
}
export const {
    getDocs,getDocsFromServer,getDocsFromCache,
    getDoc,getDocFromServer,getDocFromCache,
    getCountFromServer,onSnapshot
}=createReadTracer(sdk,readAuditEnabled?recordReadAudit:null);
