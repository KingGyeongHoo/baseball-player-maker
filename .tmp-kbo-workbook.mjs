import fs from 'node:fs/promises';
import {Workbook,SpreadsheetFile} from 'file:///C:/Users/송경후/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const text=await fs.readFile('.tmp-kbo-hist','utf8');
function parse(data){let rows=[],row=[],s='',quoted=false;for(let i=0;i<data.length;i++){let c=data[i];if(c==='"'){if(quoted&&data[i+1]==='"'){s+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(s);s='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&data[i+1]==='\n')i++;row.push(s);s='';if(row.some(Boolean))rows.push(row);row=[];}else s+=c;}if(s||row.length){row.push(s);rows.push(row);}return rows;}
const [headers,...source]=parse(text),idx=Object.fromEntries(headers.map((v,i)=>[v,i]));
const years=source.filter(r=>+r[idx.Year]>=2021&&+r[idx.Year]<=2025).map(r=>[+r[idx.Year],r[idx.Name],r[idx.Team],...['AB','H','HR','RBI','AVG','OPS'].map(k=>r[idx[k]]===''?null:Number(r[idx[k]]))]);
years.sort((a,b)=>a[0]-b[0]||String(a[1]).localeCompare(String(b[1]),'ko')||String(a[2]).localeCompare(String(b[2])));
const w=Workbook.create(),s=w.worksheets.add('타자 2021-2025');s.getRange('A1:I1').values=[['시즌','선수명','팀','타수','안타','홈런','타점','타율','OPS']];s.getRange(`A2:I${years.length+1}`).values=years;
const meta=w.worksheets.add('출처 및 범위');meta.getRange('A1:B6').values=[['항목','내용'],['상태','부분 자료: 2026년 미포함'],['기간','2021~2025년'],['원본','https://github.com/d-euh/hw1-kbo-data'],['주의','제3자 공개 데이터이며 KBO 공식 기록실 전체 선수 및 수치를 완전히 대조하지 못했습니다.'],['행 수',years.length]];
await w.recalculate();const out=await SpreadsheetFile.exportXlsx(w);await fs.mkdir('outputs/kbo-records',{recursive:true});await out.save('outputs/kbo-records/kbo-hitters-2021-2025-partial.xlsx');
const preview=await w.render({sheetName:'타자 2021-2025',range:'A1:I15',scale:1});await fs.writeFile('outputs/kbo-records/.preview.png',new Uint8Array(await preview.arrayBuffer()));console.log(JSON.stringify({count:years.length,years:Object.fromEntries([2021,2022,2023,2024,2025].map(y=>[y,years.filter(r=>r[0]===y).length]))}));
