import {formatInnings,recordRates} from "../../lib/player-records";
import type {RecordLine} from "../../lib/sim/types";

export function dashboardRecordValues(record:RecordLine,pitching:boolean):[string,string|number][]{
  const rates=recordRates(record),b=record.batting;
  const count=(key:keyof NonNullable<RecordLine["games"]>)=>record.games?.[key]??((key==="batting"?b.PA:record.pitching.BF)?"—":0);
  const rate=(value:number|null,digits=3)=>value===null?"—":value.toFixed(digits).replace(/^0\./,digits===3?".":"0.");
  return pitching?[["출전경기",count("pitching")],["이닝",formatInnings(record.pitching.outs)],["승",count("wins")],["패",count("losses")],["홀드",count("holds")],["세이브",count("saves")],["ERA",rate(rates.era,2)]]
    :[["출전경기",count("batting")],["타수",b.AB],["안타",b.H],["홈런",b.HR],["타점",b.RBI],["타율",rate(rates.average)],["OPS",rate(rates.ops)]];
}

export default function DashboardRecords({records,levels}:{records:RecordLine;levels?:{label:string;records:RecordLine}[]}){
  const legacy=!!records.batting.PA&&records.games?.batting===undefined||!!records.pitching.BF&&(["pitching","wins","losses","holds","saves"] as const).some(key=>records.games?.[key]===undefined);
  return <div className="both-records dashboard-records-display">{[true,false].map(pitching=>{
    const values=dashboardRecordValues(records,pitching);
    return <section className="record-group" key={String(pitching)}><h3>{pitching?"투수 기록":"타자 기록"}</h3>
      {levels?<div className="table-scroll"><table className="pro-stats-table"><thead><tr><th>구분</th>{values.map(([label])=><th key={label}>{label}</th>)}</tr></thead><tbody>{[...levels,{label:"시즌 합계",records}].map(row=><tr key={row.label}><th scope="row">{row.label}</th>{dashboardRecordValues(row.records,pitching).map(([label,value])=><td key={label}>{value}</td>)}</tr>)}</tbody></table></div>
        :<div className="record-stats">{values.map(([label,value])=><div key={label}><span>{label}</span><b>{value}</b></div>)}</div>}
    </section>;
  })}{legacy&&<p className="micro muted empty-note">—는 집계되지 않은 기존 기록입니다.</p>}</div>;
}
