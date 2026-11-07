'use strict';
/*
 * The pure, on-demand source projection path. Both expansion and export use
 * EXACT browser source functions. It never reads Firebase or writes Sheets.
 *
 * A trusted SOURCE LOADER still has to establish completeness/freshness
 * before the worker may treat projected rows as authoritative.
 */
const {compileKernel}=require('./export-kernel.cjs');
const {buildExactCashRuntime}=require('./exact-source-runtime.cjs');
function projectExactCashMonth({
  month,project='PHU HUNG',payments,cashPrivate,legacySeed
}={}){
  const source=buildExactCashRuntime({payments,cashPrivate,legacySeed});
  const calc=compileKernel(source.helpers);
  const projected=calc({month,project,
    expenses:source.expenses,transfers:source.transfers});
  return {...projected,sourceComplete:false,authoritative:false,
    blocker:'Complete and fresh Firebase source / protected history checksum are not verified.'};
}
module.exports={projectExactCashMonth};
