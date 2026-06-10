const XLSX = require('xlsx');
const wb = XLSX.readFile('attachments/GIA THÀNH - TT AVIO Báo Cáo Tracking Tiến Độ Thi Công ACMV.xlsx', {cellDates:true});
console.log('SHEETS:', wb.SheetNames);
for (const name of wb.SheetNames) {
  if (!name.startsWith('TRACKING')) continue;
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
  const ncol = Math.max(...rows.slice(0,12).map(r=>r?r.length:0));
  console.log('\n===== '+name+' =====  rows='+rows.length+' cols='+ncol);
  for (let i=0;i<8;i++){
    const r = rows[i]||[];
    console.log('R'+i+': '+ r.map((c,ci)=> c==null?'':('['+ci+']'+String(c).replace(/\n/g,'\\n'))).filter(Boolean).join(' | ').slice(0,600));
  }
}
