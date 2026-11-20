'use strict';
// Canonical classification of genuine design-fee payments. Preserve the
// original Cash Control/Google history; the historic view is presentation-only.
const DESIGN=/(?:设计|設計)(?:费用|費用|费|費|服务|服務|合同)|(?:深化|深化施工)设计|(?:phí|chi phí|dịch vụ)\s*thiết\s*kế|(?:phi|chi phi|dich vu)\s*thiet\s*ke|design\s*(?:fees?|services?|consult(?:ancy|ing))/iu;
const txt=v=>String(v??'').normalize('NFKC').trim();
function isDesignFee(...values){
 return DESIGN.test(values.map(txt).join(' '));
}
function presentationValues(values){
 if(!Array.isArray(values)||values.length<13||
    !isDesignFee(values[5],values[3]))return values;
 const payable=Number(values[12]||0),direct=Number(values[9]||0);
 if(!Number.isFinite(payable)||payable<=0||!Number.isFinite(direct)||
    direct!==0)return values;
 const out=values.slice();
 out[9]=payable;out[12]=0;
 return out;
}
module.exports={DESIGN,isDesignFee,presentationValues};
