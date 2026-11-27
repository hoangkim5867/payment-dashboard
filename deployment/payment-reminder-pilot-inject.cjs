'use strict';
// The large legacy inline Payment module is patched at build time with exact, checked anchors.
function injectPaymentReminder(source){
 const add=(anchor,replacement)=>{if(source.split(anchor).length!==2)throw Error('Payment reminder anchor changed: '+anchor);source=source.replace(anchor,replacement)};
 add('const noelTreePreview=createNoelTreePreview();','import {createPaymentReminder,reminderClock} from "./assets/js/payment-reminder-pilot.mjs";\nconst paymentReminderPilot=createPaymentReminder();\nconst noelTreePreview=createNoelTreePreview();');
 add('function stopPaymentsRealtime(){','function stopPaymentsRealtime(){\n    paymentReminderPilot.clear();');
 add('noelTreePreview.unmount();','noelTreePreview.unmount();\n        paymentReminderPilot.clear();');
 add('                            firstSnapshot = false;','                            // Only already-loaded current-month server snapshots; no new query.\n                            if(!snapshot.metadata?.fromCache && currentAuthUser && currentUserProfile && normalizedMonth===reminderClock().month && (isStaff()||isAdmin())){\n                                try{paymentReminderPilot.update({uid:currentAuthUser.uid,rows:allPayments,owner:staffUsernameFromName(currentUserProfile.displayName),ownerKey:staffUsernameFromName,language:currentLanguage,eligible:p=>p.deleted!==true&&!isPaymentCancelled(p)&&!isPaymentCarriedForward(p)&&!isPaymentArchived(p)&&canEditPaymentWorkflowSteps(p),done:isDone,paperDone:v=>normalizePaperStatus(v)==="done",notApplicable:isExplicitWorkflowNotApplicable,fresh:!snapshot.metadata?.hasPendingWrites})}catch(e){console.warn("Payment reminder unavailable",e?.message);paymentReminderPilot.clear()}\n                            }else paymentReminderPilot.clear();\n                            firstSnapshot = false;');
 add('                                "PAYMENTS REALTIME ERROR:",','                                "PAYMENTS REALTIME ERROR:",'); // ensure error callback still exists
 add('                            console.error(\n                                "PAYMENTS REALTIME ERROR:",','                            paymentReminderPilot.clear();\n                            console.error(\n                                "PAYMENTS REALTIME ERROR:",');
 return source;
}
module.exports={injectPaymentReminder};
