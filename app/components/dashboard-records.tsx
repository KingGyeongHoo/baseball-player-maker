import {formatInnings,recordRates} from "../../lib/player-records";
import type {RecordLine} from "../../lib/sim/types";

export function dashboardRecordValues(record:RecordLine,pitching:boolean):[string,string|number][]{
  const rates=recordRates(record),b=record.batting;
  const count=(key:keyof NonNullable<RecordLine["games"]>)=>record.games?.[key]??((key==="batting"?b.PA:record.pitching.BF)?"—":0);
  const rate=(value:number|null,digits=3)=>value===null?"—":value.toFixed(digits).replace(/^0\./,digits===3?".":"0.");
  return pitching?[["출전경기",count("pitching")],["이닝",formatInnings(record.pitching.outs)],["승",count("wins")],["패",count("losses")],["홀드",count("holds")],["세이브",count("saves")],["탈삼진",record.pitching.SO],["평균자책점",rate(rates.era,2)]]
    :[["출전경기",count("batting")],["타수",b.AB],["안타",b.H],["홈런",b.HR],["타점",b.RBI],["도루",b.SB??0],["타율",rate(rates.average)],["OPS",rate(rates.ops)]];
}

type Qualification={games:number;current:number;required:number;qualified:boolean};
export default function DashboardRecords({records,levels,qualification,field}:{field?:"batting"|"pitching";records:RecordLine;levels?:{label:string;records:RecordLine}[];qualification?:{label:string;batting:Qualification;pitching:Qualification}[]}){
  const legacy=!!records.batting.PA&&records.games?.batting===undefined||!!records.pitching.BF&&(["pitching","wins","losses","holds","saves"] as const).some(key=>records.games?.[key]===undefined);
  return <div className="both-records dashboard-records-display">{(field?[field==="pitching"]:[true,false]).map(pitching=>{
    const values=dashboardRecordValues(records,pitching);
    return <section className="record-group" key={String(pitching)}><h3>{pitching?"투수 기록":"타자 기록"}</h3>
      {levels?<div className="table-scroll"><table className="pro-stats-table"><thead><tr><th>구분</th>{values.map(([label])=><th key={label}>{label}</th>)}</tr></thead><tbody>{[...levels,{label:"시즌 합계",records}].map(row=><tr key={row.label}><th scope="row">{row.label}</th>{dashboardRecordValues(row.records,pitching).map(([label,value])=><td key={label}>{value}</td>)}</tr>)}</tbody></table></div>
        :<div className="record-stats">{values.map(([label,value])=><div key={label}><span>{label}</span><b>{value}</b></div>)}</div>}
      {qualification&&<div className="record-qualification">{qualification.map(row=>{const q=pitching?row.pitching:row.batting,unit=pitching?'이닝':'타석',format=(n:number)=>pitching?formatInnings(n):n,status=q.games===0?'pending':q.qualified?'qualified':'short';
        return <div key={row.label} className={`qualification-card ${status}`} aria-label={`${row.label} 규정${unit} ${q.games===0?'개막 전':q.qualified?'충족':'미달'}`}>
          <div className="qualification-heading"><b>{row.label}</b><span className="qualification-status">{q.games===0?'개막 전':q.qualified?'충족':'미달'}</span></div>
          <div className="qualification-amount" aria-label={`${format(q.current)} / ${format(q.required)}${unit}`}><strong>{format(q.current)}</strong><span>/ {q.games===0?'—':format(q.required)}<small>{unit}</small></span></div>
          <progress max={q.required} value={q.games===0?0:Math.min(q.current,q.required)} aria-label={`${row.label} 규정${unit} 충족률`}/>
          <div className="qualification-caption"><span>규정{unit}</span><span>{q.games===0?'정규시즌 개막 전':q.qualified?'기준 충족':`${format(q.required-q.current)}${unit} 부족`}</span></div>
        </div>;
      })}</div>}
    </section>;
  })}{legacy&&<p className="micro muted empty-note">—는 집계되지 않은 기존 기록입니다.</p>}</div>;
}
