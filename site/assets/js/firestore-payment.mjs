export * from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import * as sdk from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {computeIndexV1} from './payment-index-core.mjs';
import {createPaymentWriters} from './payment-writers.mjs';
export const {addDoc,setDoc,updateDoc,writeBatch,runTransaction}=createPaymentWriters(sdk,computeIndexV1);
