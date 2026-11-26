import test from "node:test";import assert from "node:assert/strict";
import {isContractIdentifierInProject,filterExportWatchImportMistakes as filter} from "../site/assets/js/payment-export-watch-import-guard.mjs";
const bad={paymentId:"bad",project:"CSCECVN-S.E.A-FSCPCB-MEP-SUBP-002",company:"",bankAccount:"",amount:0,action:"ADD"};
const valid={paymentId:"good",project:"ADVANCE",company:"Vendor",amount:887994138,action:"DELETE"};
test("contract identifiers are rejected, actual project aliases retained",()=>{assert.equal(isContractIdentifierInProject(bad.project),true);for(const p of ["FSCPCB","FOXCONN","EATON PARK P1","C17-2","中建厂房"])assert.equal(isContractIdentifierInProject(p),false)});
test("orphan malformed zero-value ADD is hidden once complete scope is loaded",()=>assert.deepEqual(filter([bad,valid],{scopeComplete:true}),[valid]));
test("deleted malformed ADD/DELETE pair is hidden without touching valid cancellation",()=>assert.deepEqual(filter([bad,{...bad,action:"DELETE"},valid],{scopeComplete:true,payments:[{...bad,id:"bad",deleted:true}]}),[valid]));
test("active payment, unready scope, acknowledged ID and meaningful edits remain visible",()=>{for(const options of [{scopeComplete:true,payments:[{...bad,id:"bad",deleted:false}]},{scopeComplete:false},{scopeComplete:true,acknowledged:{bad:1}}])assert.deepEqual(filter([bad,valid],options),[bad,valid]);const edited={...bad,action:"EDIT",amount:5};assert.deepEqual(filter([bad,edited],{scopeComplete:true}),[bad,edited])});
test("restore and valid deletions are never discarded",()=>{const restored={...bad,action:"RESTORE"};assert.deepEqual(filter([restored,bad,valid],{scopeComplete:true}),[restored,bad,valid]);assert.deepEqual(filter([valid],{scopeComplete:true}),[valid])});
