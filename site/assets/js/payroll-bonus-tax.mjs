// Cash Control: bonus tax is a separate, linked unpaid PIT obligation.
// It is never booked as cash paid until the user enters the tax payment date.
export function bonusTaxQuarterFromPaymentDate(date){
  const m=/^(20\d{2})-(\d{2})-(\d{2})$/.exec(String(date||''));
  if(!m)return '';
  const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
  if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate())return '';
  return year+'-Q'+Math.ceil(month/3);
}
export function bonusTaxDueMonth(quarter){
  const m=/^(20\d{2})-Q([1-4])$/.exec(String(quarter||''));
  if(!m)return '';
  const year=Number(m[1]),q=Number(m[2]);
  return (q===4?year+1:year)+'-'+String(q===4?1:q*3+1).padStart(2,'0');
}
export function buildLinkedBonusTaxRecord({bonus,existing=null,amountVnd,id,now}){
  if(bonus?.type!=='bonus'||!bonus.id)throw Error('Chỉ tạo thuế liên kết cho khoản Thưởng đã xác định.');
  const amount=Number(amountVnd);
  if(!Number.isFinite(amount)||amount<=0)throw Error('Số thuế của thưởng phải lớn hơn 0.');
  if(!existing && !id)throw Error('Thiếu mã thuế của thưởng.');
  if(existing && (existing.type!=='tax'||(existing.linkedBonusId&&existing.linkedBonusId!==bonus.id)))
    throw Error('Khoản thuế liên kết không hợp lệ; không ghi đè dữ liệu khác.');
  const date=bonus.actualDate||'';
  const period=bonusTaxQuarterFromPaymentDate(date);
  if(date&&!period)throw Error('Ngày thực trả thưởng không hợp lệ.');
  if(existing?.actualDate && (
      Number(existing.amountVnd)!==amount ||
      String(existing.taxPeriod||'')!==period ||
      String(existing.project||'')!==String(bonus.project||'') ||
      String(existing.staffGroup||'')!==String(bonus.staffGroup||'')
  ))throw Error('Thuế thưởng đã nộp: không được tự đổi số tiền, dự án hoặc kỳ thuế. Hãy đối chiếu riêng.');
  const bonusLabel=bonus.bonusYear?'năm '+bonus.bonusYear:'kỳ '+(bonus.payrollMonth||'');
  return {
    ...(existing||{}),
    id:existing?.id||id,
    linkedBonusId:bonus.id,
    type:'tax',
    project:bonus.project,
    staffGroup:bonus.staffGroup||'unknown',
    payrollMonth:date?date.slice(0,7):'',
    bonusYear:'',
    taxPeriod:period,
    taxBasisDate:date,
    amountVnd:amount,
    actualDate:existing?.actualDate||'',
    account:existing?.account||'',
    note:'Thuế TNCN của thưởng '+bonusLabel+(bonus.note?' · '+bonus.note:''),
    sourceType:existing?.sourceType||'manual',
    sourceFile:existing?.sourceFile||'',
    sourceSheet:existing?.sourceSheet||'',
    batchId:existing?.batchId||'',
    cashTxnId:existing?.cashTxnId||'',
    createdAt:existing?.createdAt||now,
    updatedAt:now
  };
}
