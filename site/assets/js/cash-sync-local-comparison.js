'use strict';
// TEST only: read a local Cash Control legacy A:N export in memory.
// No uploads, Firebase calls, Google calls, persistent storage or write approval.
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.CashSyncLocalComparison=api;
})(typeof window!=='undefined'?window:null,function(){
 const fields=['income','subcontract','material','otherDirect','indirect','financial','otherPayable'];
 const normalize=s=>String(s??'').trim().normalize('NFKC').replace(/\s+/g,' ').toUpperCase();
 const header=s=>normalize(s).replace(/[\s_()（）:：]/g,'');
 function importRows(workbook,project,audit){
   if(!workbook||!Array.isArray(workbook.SheetNames)||!audit)throw Error('Thiếu dữ liệu Excel hoặc công cụ kiểm tra');
   const exact=workbook.SheetNames.filter(n=>normalize(n)===normalize(project));
   if(exact.length!==1)throw Error('Không có đúng một sheet mang tên dự án '+project+'. Không tự ghép dữ liệu dự án khác.');
   const sheet=workbook.Sheets[exact[0]];
   const rows=globalThis.XLSX?.utils.sheet_to_json(sheet,{header:1,raw:true,defval:''});
   if(!Array.isArray(rows)||rows.length>20000)throw Error('Excel quá lớn hoặc không hợp lệ');
   const h=rows.findIndex(r=>Array.isArray(r)&&
     ['NGÀY','日期','DATE'].includes(header(r[0]))&&
     ['THU','收入','INFLOW'].includes(header(r[6]))&&
     ['SỐDƯ','余额','BALANCE'].includes(header(r[13])));
   if(h<0)throw Error('Chỉ hỗ trợ Excel Cash Control kiểu cũ A:N, đủ tiêu đề Ngày / Thu / Số dư.');
   const record=[];
   for(let i=h+1;i<rows.length;i++){
     const r=rows[i];
     if(!Array.isArray(r))continue;
     const date=audit.dateValue(r[0]);
     if(!date)continue;
     const nums=r.slice(6,13).map(x=>audit.amount(x,true));
     if(nums.length!==7||nums.some(n=>!Number.isFinite(n)))
       throw Error('Số tiền không hợp lệ tại hàng Excel '+(i+1));
     record.push({date,...Object.fromEntries(fields.map((f,j)=>[f,nums[j]]))});
   }
   if(!record.length)throw Error('Không có giao dịch ngày hợp lệ trong Excel.');
   return record;
 }
 return Object.freeze({importRows});
});
