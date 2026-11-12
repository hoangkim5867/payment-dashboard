'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseSheetLink,validateLinkDraft}=require('../server/cash-sync-link-draft.cjs');
const projects=['EATON','H14-3','ELYSIAN','PHU HUNG'];
const sheet=(id,gid)=>'https://docs.google.com/spreadsheets/d/'+id+'/edit'+
  (gid==null?'':'?gid='+gid+'#gid='+gid);
const draft=links=>({schema:'CASH_SYNC_PROJECT_LINK_DRAFT_V1',projects:links});
test('imports EATON and H14-3 tab gids without any remote reads or writes',()=>{
  const x=validateLinkDraft(draft({'EATON':sheet('EATONid_123',1214250390),
    'H14-3':sheet('H14id_123',485113919)}),projects);
  assert.equal(x.linkedCount,2);assert.equal(x.canWrite,false);
  assert.equal(x.entries[0].gid,'1214250390');
  assert.equal(x.entries[1].gid,'485113919');
});
test('accepts a missing gid but never guesses a tab',()=>{
  assert.deepEqual(parseSheetLink(sheet('simpleSheetID')), {spreadsheetId:'simpleSheetID',gid:null});
});
test('protects existing PHU HUNG and never activates from draft',()=>{
  const x=validateLinkDraft(draft({'PHU HUNG':sheet('existingPhuHung')}),projects);
  assert.equal(x.entries[0].status,'existing-sync-protected');
  assert.equal(x.canWrite,false);
});
test('rejects duplicate Google destinations even when gid differs',()=>{
  assert.throws(()=>validateLinkDraft(draft({'EATON':sheet('sameID',1),
    'H14-3':sheet('sameID',2)}),projects),/Same spreadsheet/);
});
test('rejects wrong host, HTTP, conflicting gid and fabricated project',()=>{
  assert.throws(()=>parseSheetLink('https://docs.google.com.evil.org/spreadsheets/d/x/edit'));
  assert.throws(()=>parseSheetLink('http://docs.google.com/spreadsheets/d/x/edit'));
  assert.throws(()=>parseSheetLink('https://docs.google.com/spreadsheets/d/x/edit?gid=1#gid=2'));
  assert.throws(()=>validateLinkDraft(draft({'NOT IN CASH CONTROL':sheet('id123')}),projects),/not found/);
});
test('future project works without code changes when present in live catalog',()=>{
  const x=validateLinkDraft(draft({'NEW DEC PROJECT':sheet('newSheetId')}),[...projects,'NEW DEC PROJECT']);
  assert.equal(x.entries[0].project,'NEW DEC PROJECT');
  assert.equal(x.canWrite,false);
});
