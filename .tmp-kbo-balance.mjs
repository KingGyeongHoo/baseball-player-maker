import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Workbook, SpreadsheetFile } from 'file:///C:/Users/송경후/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';

const out = 'outputs/kbo-balance';
function parse(data) {
  const rows=[]; let row=[],s='',q=false;
  for(let i=0;i<data.length;i++) {
    const c=data[i];
    if(c==='"') { if(q&&data[i+1]==='"'){s+='"';i++;}else q=!q; }
    else if(c===','&&!q){row.push(s);s='';}
    else if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&data[i+1]==='\n')i++;row.push(s);s='';if(row.some(Boolean))rows.push(row);row=[];}
    else s+=c;
  }
  if(s||row.length){row.push(s);rows.push(row);}
  const [h,...rs]=rows;
  return rs.map(r=>{assert.equal(r.length,h.length);return Object.fromEntries(h.map((k,i)=>[k,r[i]]));}).filter(r=>+r.Year>=2021&&+r.Year<=2025);
}
const outs = ip => {assert.match(ip,/^\d+(\.[012])?$/);const [a,b='0']=ip.split('.');return +a*3+(+b);};
const ipText = n => `${Math.floor(n/3)}${n%3?'.'+n%3:''}`;
assert.equal(outs('29.2'),89); assert.equal(outs('30.0'),90); assert.equal(ipText(outs('55.2')+outs('7.2')),'63.1');
const sum=(rs,k)=>rs.reduce((s,r)=>s+r[k],0);
const round=(n,p=3)=>+n.toFixed(p);
async function source(file,type) {
  const raw=parse(await fs.readFile(file,'utf8'));
  const keys=type==='h'?['G','PA','AB','H','HR','RBI','BB','HP','SF','TB','SO']:['G','GS','W','L','HD','S','ER','SO','TBF'];
  for(const r of raw) for(const k of keys) {assert.notEqual(r[k],'',`${r.Name} ${k}`);assert(Number.isInteger(+r[k])&&+r[k]>=0);r[k]=+r[k];}
  const groups=Object.groupBy(raw,r=>r.Year+':'+r.Id);
  const merged=Object.values(groups).map(rs=>{
    assert.equal(new Set(rs.map(r=>r.Team)).size,rs.length,'duplicate team stint');
    assert.equal(new Set(rs.map(r=>r.Name)).size,1);
    const r={Id:rs[0].Id,Year:+rs[0].Year,Name:rs[0].Name,Team:rs.map(r=>r.Team).join('/'),...Object.fromEntries(keys.map(k=>[k,sum(rs,k)]))};
    assert(r.G<=144);
    if(type==='h') {
      r.AVG=r.AB?r.H/r.AB:null;
      r.OPS=r.AB?(r.H+r.BB+r.HP)/(r.AB+r.BB+r.HP+r.SF)+r.TB/r.AB:null;
      assert(r.H<=r.AB&&r.HR<=r.H&&r.PA>=r.AB);
      r.qualified=r.PA>=446?1:0;
    } else {
      r.OUTS=rs.reduce((a,r)=>a+outs(r.IP),0);r.IP=ipText(r.OUTS);
      r.ERA=r.OUTS?27*r.ER/r.OUTS:null;
      r.role=r.GS/r.G>=0.5?'선발형':'불펜형';r.qualified=r.OUTS>=432?1:0;
      assert(r.GS<=r.G);
    }
    return r;
  });
  for(const k of keys) assert.equal(sum(raw,k),sum(merged,k));
  return {rawCount:raw.length,merged};
}
const hsrc=await source('.tmp-kbo-hist','h'),psrc=await source('.tmp-kbo-pitching','p');
const hitters=hsrc.merged.filter(r=>r.PA>=100).sort((a,b)=>a.Year-b.Year||b.HR-a.HR||a.Id.localeCompare(b.Id));
const pitchers=psrc.merged.filter(r=>r.OUTS>=90).sort((a,b)=>a.Year-b.Year||b.OUTS-a.OUTS||a.Id.localeCompare(b.Id));
if(process.argv.includes('--ranges')) {
  const ranges=(rows,keys)=>Object.fromEntries(keys.map(k=>{
    const values=rows.map(r=>r[k]);
    assert(values.every(Number.isFinite));
    let mean=sum(rows,k)/rows.length;
    if(k==='AVG')mean=sum(rows,'H')/sum(rows,'AB');
    if(k==='OPS')mean=(sum(rows,'H')+sum(rows,'BB')+sum(rows,'HP'))/(sum(rows,'AB')+sum(rows,'BB')+sum(rows,'HP')+sum(rows,'SF'))+sum(rows,'TB')/sum(rows,'AB');
    if(k==='ERA')mean=27*sum(rows,'ER')/sum(rows,'OUTS');
    return [k,{max:Math.max(...values),mean,min:Math.min(...values)}];
  }));
  const p=ranges(pitchers,['G','OUTS','W','L','HD','S','ERA','SO']);
  p.IP={max:ipText(p.OUTS.max),mean:p.OUTS.mean/3,min:ipText(p.OUTS.min)};
  console.log(JSON.stringify({hitters:hitters.length,pitchers:pitchers.length,h:ranges(hitters,['G','AB','H','HR','RBI','AVG','OPS']),p},null,2));
  process.exit(0);
}
const audit={sourceRows:{hitters:hsrc.rawCount,pitchers:psrc.rawCount},mergedSeasons:{hitters:hsrc.merged.length,pitchers:psrc.merged.length},included:{hitters:hitters.length,pitchers:pitchers.length},years:[]};
for(const y of [2021,2022,2023,2024,2025]) {
  const hs=hitters.filter(r=>r.Year===y),ps=pitchers.filter(r=>r.Year===y);
  audit.years.push({year:y,hitters:hs.length,qualifiedHitters:hs.filter(r=>r.qualified).length,pitchers:ps.length,qualifiedPitchers:ps.filter(r=>r.qualified).length,AVG:sum(hs,'H')/sum(hs,'AB'),HR_PA:sum(hs,'HR')/sum(hs,'PA'),ERA:27*sum(ps,'ER')/sum(ps,'OUTS'),K9:27*sum(ps,'SO')/sum(ps,'OUTS'),maxHR:Math.max(...hsrc.merged.filter(r=>r.Year===y).map(r=>r.HR)),maxSO:Math.max(...psrc.merged.filter(r=>r.Year===y).map(r=>r.SO))});
}
console.log(JSON.stringify(audit,null,2));
if(process.argv.includes('--analyze'))process.exit(0);
await fs.mkdir(out,{recursive:true});
const w=Workbook.create();
const summary=w.worksheets.add('시즌 비교'),hs=w.worksheets.add('타자 100타석'),ps=w.worksheets.add('투수 30이닝'),top=w.worksheets.add('시즌 상위 10명');
const col=n=>{let s='';for(;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
function table(s,heads,rows,row=5) {
  const end=col(heads.length);s.showGridLines=false;
  s.getRange(`A${row}:${end}${row}`).values=[heads];
  s.getRange(`A${row+1}:${end}${row+rows.length}`).values=rows;
  s.getRange(`A${row}:${end}${row+rows.length}`).format.font={name:'Arial',size:11};
  s.getRange(`A${row}:${end}${row}`).format={fill:'#243B53',font:{bold:true,color:'#FFFFFF'},rowHeight:28};
  s.getRange(`A:${end}`).format.columnWidth=12;
  s.getRange(`A${row+1}:${end}${row+rows.length}`).format.rowHeight=21;
  s.freezePanes.freezeRows(row);return rows.length+row;
}
function title(s,t,note){s.mergeCells('A2:K2');s.mergeCells('A3:K3');s.getRange('A2').values=[[t]];s.getRange('A2').format.font={size:16,bold:true};s.getRange('A3').values=[[note]];s.getRange('A3').format.font={size:10,color:'#526578'};}
title(hs,'타자 시즌 기록 · 100타석 이상','2021~2025 · 이적 기록 합산 · K열부터 필터·계산용 보조 항목');
title(ps,'투수 시즌 기록 · 30이닝 이상','2021~2025 · 이적 기록 합산 · 이닝 표기는 야구 표기(63.1 = 63⅓이닝)');
const hend=table(hs,['시즌','선수명','팀','출전경기','타수','안타','홈런','타점','타율','OPS','타석','규정 충족','삼진','볼넷','사구','희생플라이','총루타','원본 ID'],hitters.map(r=>[r.Year,r.Name,r.Team,r.G,r.AB,r.H,r.HR,r.RBI,r.AVG,r.OPS,r.PA,r.qualified,r.SO,r.BB,r.HP,r.SF,r.TB,r.Id]));
const pend=table(ps,['시즌','선수명','팀','출전경기','이닝','승','패','홀드','세이브','ERA','등판 유형','규정 충족','선발등판','아웃 수','자책점','탈삼진','상대타자','원본 ID'],pitchers.map(r=>[r.Year,r.Name,r.Team,r.G,r.IP,r.W,r.L,r.HD,r.S,r.ERA,r.role,r.qualified,r.GS,r.OUTS,r.ER,r.SO,r.TBF,r.Id]));
for(const s of [hs,ps]){s.getRange('B:C').format.columnWidth=16;s.getRange('T2').values=[['출처: https://github.com/d-euh/hw1-kbo-data']];s.getRange('T3').values=[['제3자 자료 · 공식 기록 전체 대조 미완료 · 2026년 미포함']];s.getRange('T4').values=[['규정 충족: 1=충족, 0=미충족. 446타석 / 144이닝 기준.']];s.getRange('T:T').format.columnWidth=88;}
ps.getRange('T5').values=[['선발형: 선발등판/출전경기 ≥ 50%, 나머지는 불펜형. 분석용 분류.']];
hs.getRange(`I6:J${hend}`).format.numberFormat='0.000';ps.getRange(`J6:J${pend}`).format.numberFormat='0.00';
hs.getRange('T5').values=[['타율·OPS는 합산 원자료에서 재계산. 공식 표시값과 반올림 차이가 있을 수 있음.']];
hs.getRange('T6').values=[['규정 기준 참고: https://tigers.co.kr/game/stats/calculation']];
title(summary,'KBO 밸런스 기준 · 2021~2025','선수별 시즌 합산 후 필터 적용 · 평균은 표본 내 기회 수로 가중 · 2026년 제외');
const hrows=[];for(const y of [2021,2022,2023,2024,2025])for(const q of [false,true])hrows.push([y,q?'규정타석':'100타석 이상',null,null,null,null,null,null,null,null,null]);
table(summary,['시즌','타자 표본','선수 수','평균 경기','평균 타수','평균 홈런','평균 타점','합산 타율','합산 OPS','홈런/타석','삼진/타석'],hrows);
summary.getRange('B:B').format.columnWidth=18;
const hRange=k=>`'타자 100타석'!$${k}$6:$${k}$${hend}`;
const pRange=k=>`'투수 30이닝'!$${k}$6:$${k}$${pend}`;
const expectations=[];
for(let i=0;i<hrows.length;i++){
  const r=i+6,qual=i%2===1,criteria=`${hRange('A')},A${r}${qual?','+hRange('L')+',1':''}`;
  const total=k=>`SUMIFS(${hRange(k)},${criteria})`;
  summary.getRange(`C${r}:K${r}`).formulas=[[`=COUNTIFS(${criteria})`,`=${total('D')}/C${r}`,`=${total('E')}/C${r}`,`=${total('G')}/C${r}`,`=${total('H')}/C${r}`,`=${total('F')}/${total('E')}`,`=(${total('F')}+${total('N')}+${total('O')})/(${total('E')}+${total('N')}+${total('O')}+${total('P')})+${total('Q')}/${total('E')}`,`=${total('G')}/${total('K')}`,`=${total('M')}/${total('K')}`]];
  const rs=hitters.filter(x=>x.Year===hrows[i][0]&&(!qual||x.qualified));
  expectations.push({cell:`H${r}`,value:sum(rs,'H')/sum(rs,'AB')});
}
summary.getRange('D6:G15').format.numberFormat='0.0';summary.getRange('H6:I15').format.numberFormat='0.000';summary.getRange('J6:K15').format.numberFormat='0.00%';
const prows=[];for(const y of [2021,2022,2023,2024,2025])for(const type of ['30이닝 전체','선발형','불펜형','규정이닝'])prows.push([y,type,null,null,null,null,null,null,null,null,null]);
table(summary,['시즌','투수 표본','선수 수','평균 경기','평균 이닝','평균 승','평균 패','평균 홀드','평균 세이브','합산 ERA','K/9'],prows,19);
summary.getRange('B:B').format.columnWidth=18;
for(let i=0;i<prows.length;i++){
  const r=i+20,type=prows[i][1],criteria=`${pRange('A')},A${r}${type==='규정이닝'?','+pRange('L')+',1':['선발형','불펜형'].includes(type)?','+pRange('K')+',B'+r:''}`;
  const total=k=>`SUMIFS(${pRange(k)},${criteria})`;
  summary.getRange(`C${r}:K${r}`).formulas=[[`=COUNTIFS(${criteria})`,`=${total('D')}/C${r}`,`=${total('N')}/3/C${r}`,`=${total('F')}/C${r}`,`=${total('G')}/C${r}`,`=${total('H')}/C${r}`,`=${total('I')}/C${r}`,`=${total('O')}*27/${total('N')}`,`=${total('P')}*27/${total('N')}`]];
  const rs=pitchers.filter(x=>x.Year===prows[i][0]&&(type==='규정이닝'?x.qualified:['선발형','불펜형'].includes(type)?x.role===type:true));
  assert(rs.length>0);expectations.push({cell:`J${r}`,value:27*sum(rs,'ER')/sum(rs,'OUTS')});
}
summary.getRange('D20:I39').format.numberFormat='0.0';summary.getRange('J20:K39').format.numberFormat='0.00';summary.freezePanes.unfreeze();
summary.getRange('A42').values=[['평균 이닝은 십진수: 100.5 = 100½이닝. 선수 기록 시트의 야구 표기와 구분.']];
summary.getRange('A43').values=[['규정: 446타석 / 144이닝. 선발형: GS/G ≥ 50%. 표본 평균은 리그 전체 평균과 다름.']];
summary.getRange('A44').values=[['상위 10명은 전체 선수 중 홈런·탈삼진 순, 동률은 원본 ID 순. 현재 자료의 고정 스냅샷.']];
summary.getRange('A45').values=[['자료 제한: 제3자 공개 원본을 가공했으며, 공식 기록 전체 대조와 2026년 수집은 미완료.']];
title(top,'시즌 상위 10명 · 홈런과 탈삼진','전체 선수 대상 · 규정 충족 여부 무관 · 각 시즌 10명 · 동률은 원본 ID 순');
const leaders=[];
for(const y of [2021,2022,2023,2024,2025])for(const [label,src,key] of [['홈런',hsrc.merged,'HR'],['탈삼진',psrc.merged,'SO']]) {
  const rs=src.filter(r=>r.Year===y).sort((a,b)=>b[key]-a[key]||a.Id.localeCompare(b.Id)).slice(0,10);
  for(const [i,r] of rs.entries())leaders.push([y,label,i+1,r.Name,r.Team,r[key],r.G,label==='홈런'?r.PA:null,label==='탈삼진'?r.IP:null,label==='홈런'?r.HR/r.PA:null,label==='탈삼진'?27*r.SO/r.OUTS:null]);
}
table(top,['시즌','기록','정렬 순서','선수명','팀','기록값','출전경기','타석','이닝','홈런/타석','K/9'],leaders);
top.getRange('D:E').format.columnWidth=16;top.getRange('J6:J105').format.numberFormat='0.00%';top.getRange('K6:K105').format.numberFormat='0.00';
await w.recalculate();
for(const e of expectations)assert(Math.abs(summary.getRange(e.cell).values[0][0]-e.value)<1e-10,`formula mismatch ${e.cell}`);
const scan=await w.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!',options:{useRegex:true,maxResults:20},maxChars:2000});
console.log(scan.ndjson);
console.log((await w.inspect({kind:'table',range:'시즌 비교!A5:K8',include:'values,formulas',tableMaxRows:4,tableMaxCols:11,maxChars:3500})).ndjson);
await (await SpreadsheetFile.exportXlsx(w)).save(`${out}/kbo-balance-2021-2025.xlsx`);
for(const [sheet,range,file] of [['시즌 비교','A1:K45','summary'],['타자 100타석','A1:R11','hitters'],['투수 30이닝','A1:R11','pitchers'],['시즌 상위 10명','A1:K12','leaders']]) {
  const img=await w.render({sheetName:sheet,range,scale:1});await fs.writeFile(`${out}/.${file}.png`,new Uint8Array(await img.arrayBuffer()));
}
await fs.writeFile(`${out}/.validation.json`,JSON.stringify(audit,null,2));
