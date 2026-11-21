/**
 * One-sheet XLSX report export. Google hidden tabs are never fetched or
 * included. This is the only safe XLSX to distribute when recipients must
 * not receive DATA_CASHCONTROL or original history backup.
 * Browser-only, explicit Admin action; no source edits or background fetches.
 */
const TITLE=/^.{1,180}项目现金流明细表$/;
export function prepareOneSheetReport({project,values}={}){
 if(typeof project!=='string'||!project||project.length>90)
   throw Error('Chưa chọn dự án.');
 if(!Array.isArray(values)||values.length<6||values.length>20000)
   throw Error('File báo cáo trống hoặc vượt giới hạn.');
 const n=project==='FOXCONN'?15:14;
 const title=String(values[0]?.[0]||'');
 if(!TITLE.test(title)||title!==project+'项目现金流明细表'||
    values[2]?.[0]!=='日期'||values[3]?.[7]!=='分包款')
   throw Error('Đây không phải tab báo cáo theo mẫu PHU HUNG.');
 const last=values.findLastIndex(r=>r?.[0]==='合计');
 if(last!==values.length-1||last<5)
   throw Error('Thiếu dòng tổng 合计, không xuất báo cáo dở dang.');
 const head=Array.from({length:values.length},(_,i)=>
  Array.from({length:n},(_,j)=>{
   let v=values[i]?.[j];
   if(v===undefined||v===null||v==='')return null;
   if(i>=4&&j>=6&&typeof v==='number'&&v===0)return null;
   return v;
  }));
 return {project,columns:n,rows:head,finalRow:last};
}
export function buildOneSheetXlsx({project,values,XLSX}={}){
 const clean=prepareOneSheetReport({project,values});
 if(!XLSX?.utils?.book_new||!XLSX?.utils?.aoa_to_sheet||
    !XLSX?.utils?.book_append_sheet)
  throw Error('Không tải được thư viện Excel.');
 const workbook=XLSX.utils.book_new();
 const ws=XLSX.utils.aoa_to_sheet(clean.rows);
 const count=clean.columns,last=clean.finalRow;
 const green='E0EFE5',sage='D8E0D8',blue='EAF2FC',white='FFFFFF';
 ws['!cols']=[13,37,29,48,13,18,
  ...Array.from({length:count-6},()=>19)].map(wch=>({wch}));
 ws['!rows']=Array.from({length:clean.rows.length},(_,i)=>
  ({hpt:i===0?29:i===2||i===3?24:i===last?24:19}));
 ws['!merges']=[
  {s:{r:0,c:0},e:{r:0,c:count-1}},
  {s:{r:2,c:7},e:{r:2,c:count-2}}
 ];
 for(let ri=0;ri<clean.rows.length;ri++){
  for(let ci=0;ci<count;ci++){
   const addr=XLSX.utils.encode_cell({r:ri,c:ci});
   const current=ws[addr];
   if(!current)continue;
   const heading=ri===0,head=ri===2||ri===3,summary=ri===last;
   current.s={
    font:{name:'Arial',sz:heading?16:10,bold:heading||head||summary,
      color:{rgb:'202124'}},
    fill:{patternType:'solid',fgColor:{rgb:heading?green:head?sage:summary?blue:white}},
    alignment:{vertical:'center',horizontal:heading||head?'center':ci>=6?'right':'left',wrapText:head},
    border:head||summary?{bottom:{style:'thin',color:{rgb:'BAC6D0'}}}:undefined
   };
   if(ri>=4&&ci>=6&&typeof current.v==='number')
    current.z='#,##0.##;[Red]-#,##0.##;;@';
  }
 }
 const sheetName=project.replace(/[\\/:?*\[\]]/g,' ').slice(0,31);
 XLSX.utils.book_append_sheet(workbook,ws,sheetName);
 if(workbook.SheetNames.length!==1||workbook.SheetNames[0]!==sheetName)
  throw Error('Xuất Excel không đạt: yêu cầu chính xác một sheet.');
 return {workbook,sheetName,rows:clean.rows.length};
}
