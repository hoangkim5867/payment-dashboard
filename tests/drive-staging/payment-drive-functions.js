async function rawDriveApi(path,options = {}){
    const token = await requestDriveAccessToken();
    const response = await fetch(
        `https://www.googleapis.com${path}`,
        {
            ...options,
            headers:{
                ...(options.headers || {}),
                Authorization:`Bearer ${token}`
            }
        }
    );

    const responseText = await response.text();
    let payload = null;

    if(responseText){
        try{
            payload = JSON.parse(responseText);
        }catch{
            payload = responseText;
        }
    }

    if(!response.ok){
        if(response.status === 401){
            uncDriveAccessToken = "";
            uncDriveTokenExpiresAt = 0;
        }

        const apiError = payload?.error || {};
        const error = new Error(
            apiError.message || responseText || `Google Drive HTTP ${response.status}`
        );
        error.code = "drive/api";
        error.status = response.status;
        error.reason = apiError.errors?.[0]?.reason || apiError.status || "";
        throw error;
    }

    return payload;
}

function getUncFileToken(value,maxLength=60){
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g,"")
        .replace(/[Đđ]/g,"D")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g,"-")
        .replace(/^-+|-+$/g,"")
        .replace(/-{2,}/g,"-")
        .slice(0,maxLength)
        .replace(/-+$/g,"");
}

function getUncContractToken(contractNo){
    const normalized = getUncFileToken(contractNo,120);
    const codeMatch = normalized.match(/(?:LAB|SUBP|SUPL|ADM)-?[A-Z0-9]+$/);
    if(codeMatch){
        return codeMatch[0].replace(/^(LAB|SUBP|SUPL|ADM)(?!-)/,"$1-");
    }

    const parts = normalized.split("-").filter(Boolean);
    return parts.slice(-3).join("-").slice(0,45);
}

function getUncDriveFileName(payment){
    const date = String(payment?.processPaymentDate || "")
        .replace(/[^0-9]/g,"")
        .slice(0,8);
    const project = getUncFileToken(payment?.project,36);
    const contract = getUncContractToken(payment?.contractNo);
    let ipc = getUncFileToken(payment?.ipcNo,18).replace(/-/g,"");
    if(ipc && !ipc.startsWith("IPC")) ipc = `IPC${ipc}`;

    const rawAmount = Number(payment?.processActualAmount);
    const amount = Number.isFinite(rawAmount) && rawAmount > 0
        ? String(Math.round(rawAmount))
        : "";
    const paymentFallback = getUncFileToken(payment?.id || "PAYMENT",24);
    const parts = [
        "UNC",
        date,
        project,
        contract,
        ipc,
        amount
    ].filter(Boolean);

    if(parts.length === 1) parts.push(paymentFallback || "PAYMENT");
    return `${parts.join("_").slice(0,190)}.pdf`;
}

const uncReservedDriveNames = new Set();

function getUniqueUncDriveFileName(payment){
    const baseName = getUncDriveFileName(payment);
    const paymentId = String(payment?.id || "");
    const usedNames = new Set(
        allPayments
            .filter(item => String(item?.id || "") !== paymentId)
            .map(item => String(item?.uncName || ""))
            .filter(Boolean)
    );
    uncReservedDriveNames.forEach(name => usedNames.add(name));

    if(!usedNames.has(baseName)){
        uncReservedDriveNames.add(baseName);
        return baseName;
    }

    const stem = baseName.replace(/\.pdf$/i,"");
    let sequence = 2;
    let candidate = "";
    do{
        candidate = `${stem}_${String(sequence).padStart(2,"0")}.pdf`;
        sequence += 1;
    }while(usedNames.has(candidate));

    uncReservedDriveNames.add(candidate);
    return candidate;
}

async function createUncDriveFile(payment,file,folderId){
    const boundary = `payment_unc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const metadata = {
        name:getUniqueUncDriveFileName(payment),
        mimeType:"application/pdf",
        parents:[folderId],
        description:`UNC cho Payment ${String(payment?.id || "")}`,
        appProperties:{
            paymentId:String(payment?.id || ""),
            source:"payment-page"
        }
    };
    const body = new Blob(
        [
            `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
            JSON.stringify(metadata),
            `\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
            file,
            `\r\n--${boundary}--`
        ],
        {type:`multipart/related; boundary=${boundary}`}
    );

    return driveApi(
        "/upload/drive/v3/files?uploadType=multipart&fields=id,name,size",
        {
            method:"POST",
            headers:{"Content-Type":`multipart/related; boundary=${boundary}`},
            body
        }
    );
}

async function replaceUncDriveFile(fileId,file,payment){
    const replaced = await driveApi(
        `/upload/drive/v3/files/${encodeURIComponent(fileId)}` +
        "?uploadType=media&fields=id,name,size",
        {
            method:"PATCH",
            headers:{"Content-Type":"application/pdf"},
            body:file
        }
    );

    const desiredName = getUncDriveFileName(payment);
    if(replaced?.id && desiredName && replaced.name !== desiredName){
        try{
            return await driveApi(
                `/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,size`,
                {
                    method:"PATCH",
                    headers:{"Content-Type":"application/json"},
                    body:JSON.stringify({name:desiredName})
                }
            );
        }catch(renameError){
            console.warn("UNC DRIVE RENAME ERROR:",renameError);
        }
    }

    return replaced;
}

