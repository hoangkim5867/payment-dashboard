function findSameMonthDuplicateImport(data){

    return getImportDuplicateCandidates().find(
        payment =>
            payment.deleted !== true &&
            normalize(payment.paymentMonth) === normalize(data.paymentMonth) &&
            /*
               Use the same canonical key as Contract Master lookup.
               This catches harmless Excel variations such as
               EATON PARK P1 / EATONPARKP1 and PHU HUNG / PH.

               An existing matching IPC is a review warning, not a hard
               error: one IPC can legitimately be paid in several parts.
            */
            paymentContractKey(
                payment.project,
                payment.contractNo
            ) === paymentContractKey(
                data.project,
                data.contractNo
            ) &&
            normalize(payment.ipcNo) === normalize(data.ipcNo)
    ) || null;
}

function findCrossMonthDuplicateImport(data){

    const matches = getImportDuplicateCandidates().filter(
        payment =>
            payment.deleted !== true &&
            paymentContractKey(
                payment.project,
                payment.contractNo
            ) === paymentContractKey(
                data.project,
                data.contractNo
            ) &&
            normalize(payment.ipcNo) === normalize(data.ipcNo) &&
            normalize(payment.paymentMonth) !== normalize(data.paymentMonth)
    );

    /*
       Show the riskiest match first:
       same amount + already paid is the strongest duplicate signal.
       A different amount may still be a legitimate partial payment.
    */
    matches.sort((a,b) => {
        const score = payment => {
            const existingAmount = Number(
                isPaymentPaid(payment)
                    ? payment.processActualAmount
                    : payment.amount
            ) || 0;
            const sameAmount =
                Math.abs(existingAmount - (Number(data.amount) || 0)) < 0.5;

            return (
                (sameAmount ? 4 : 0) +
                (isPaymentPaid(payment) ? 2 : 0) +
                (isPaymentCarriedForward(payment) ? 1 : 0)
            );
        };

        return score(b) - score(a);
    });

    return matches[0] || null;
}
