import {syncJerseyNumbers} from "./jersey-numbers";
import {discardRetiredPlayers} from "./sim/retired-records";
import {syncProClubNames} from "./sim/club-names";
import {statKeys,type GameState} from "./sim/types";

export type CareerSave={format:"baseball-life";version:1;id:string;name:string;date:string;year:number;savedAt:string;manual:boolean;checksum:string;state:GameState};
export type CareerSaveSummary=Pick<CareerSave,"id"|"name"|"date"|"savedAt"|"manual">&{mode:GameState["careerMode"];retired:boolean};
export function saveChecksum(text:string){let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return (h>>>0).toString(16);}
export function validateCareerState(value:unknown):asserts value is GameState {
  if(!value||typeof value!=="object")throw new Error("커리어 데이터가 아닙니다.");
  const s=value as GameState;
  if(s.schemaVersion!==1||s.proWorld&&s.proWorld.version!==1)throw new Error("지원하지 않는 저장 버전입니다. 원본 파일은 변경하지 않았습니다.");
  if(typeof s.seed!=="string"||typeof s.playerId!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||!["weekStart","ended"].includes(s.phase)||!Array.isArray(s.players)||!Array.isArray(s.teams)||!Array.isArray(s.calendar?.events))throw new Error("필수 커리어 데이터가 누락됐습니다.");
  const ids=new Set<string>();for(const p of s.players){
    if(!p||typeof p.id!=="string"||ids.has(p.id)||!Number.isInteger(p.teamId)||p.teamId>=s.teams.length||p.teamId< -1||statKeys.some(k=>!Number.isFinite(p.stats?.[k])||p.stats[k]<1||p.stats[k]>100)||!p.trainingPolicy?.tickets||!Array.isArray(p.career))throw new Error("선수·소속·능력 데이터가 손상됐습니다.");ids.add(p.id);
    const trial=p.professional?.roleTrial;if(trial?.version===1&&(!Array.isArray(trial.trainingDates)||typeof trial.started!=="string"||typeof trial.until!=="string"||typeof trial.sourceId!=="string"))throw new Error("보직 평가의 훈련 근거를 복원할 수 없습니다.");
  }
  if(!ids.has(s.playerId)||!s.rngStates||Object.values(s.rngStates).some(n=>!Number.isInteger(n)))throw new Error("선수 또는 난수 상태를 복원할 수 없습니다.");
  if(s.weekProgress&&(!Number.isInteger(s.weekProgress.remainingDays)||s.weekProgress.remainingDays<0||s.weekProgress.remainingDays>7))throw new Error("주간 중단 위치가 올바르지 않습니다.");
  if(s.matchProgress&&!s.calendar.events.some(g=>g.id===s.matchProgress!.gameId))throw new Error("진행 중인 경기를 찾을 수 없습니다.");
  if(s.proEvents&&(s.proEvents.version!==1||!Array.isArray(s.proEvents.history)||!Array.isArray(s.proEvents.attemptedGames)||!Array.isArray(s.proEvents.cancellations)||!s.proEvents.national||Object.values(s.proEvents.national).some(row=>!Array.isArray(row.roster)||row.roster.length>23||new Set(row.roster.map(p=>p.id)).size!==row.roster.length)))throw new Error("프로 이벤트 저장 상태가 손상됐거나 지원하지 않는 버전입니다.");
  if(s.careerEvent?.proEvent&&s.careerEvent.proEvent.version!==1)throw new Error("지원하지 않는 프로 이벤트 버전입니다.");
  if(s.calendar.events.some(game=>game.proPreparedLineup?.some(side=>[...side.field,...side.order,...side.pitchers,side.starter].some(id=>!ids.has(id)))))throw new Error("경기 준비 명단의 선수를 복원할 수 없습니다.");
}
export function encodeCareerSave(state:GameState,manual=false,now=new Date().toISOString()):CareerSave {
  validateCareerState(state);const p=state.players.find(p=>p.id===state.playerId)!;
  return {format:"baseball-life",version:1,id:`${manual?"manual":"auto"}:${state.seed}:${state.playerId}${manual?`:${now}`:""}`,name:p.name,date:state.date,year:state.calendar.seasonYear,savedAt:now,manual,checksum:saveChecksum(JSON.stringify(state)),state};
}
export function decodeCareerSave(raw:string):CareerSave {
  let file:CareerSave;try{file=JSON.parse(raw);}catch{throw new Error("JSON 저장 파일을 읽지 못했습니다. 원본 파일은 유지됩니다.");}
  return validateCareerSave(file);
}
function validateCareerSave(file:CareerSave):CareerSave {
  if(file?.format!=="baseball-life"||file.version!==1)throw new Error("지원하지 않는 저장 형식입니다. 원본 파일은 유지됩니다.");
  validateCareerState(file.state);if(saveChecksum(JSON.stringify(file.state))!==file.checksum)throw new Error("저장 파일의 무결성 확인에 실패했습니다. 원본 파일은 유지됩니다.");
  const retiredRemoved=discardRetiredPlayers(file.state);
  const namesChanged=syncProClubNames(file.state);
  const needsNumbers=file.state.players.some(p=>p.jerseyNumber===undefined);
  if(needsNumbers)syncJerseyNumbers(file.state);
  if(retiredRemoved||needsNumbers||namesChanged)file.checksum=saveChecksum(JSON.stringify(file.state));
  return file;
}
let database:Promise<IDBDatabase>|undefined;
function openDatabase(){
  if(typeof indexedDB==="undefined")return Promise.reject(new Error("이 환경에서는 로컬 저장소를 사용할 수 없습니다."));
  database??=new Promise((resolve,reject)=>{const request=indexedDB.open("baseball-life-careers",1);request.onupgradeneeded=()=>{request.result.createObjectStore("careers",{keyPath:"id"});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>{database=undefined;reject(new Error("로컬 저장소를 열지 못했습니다."));};});return database;
}
async function transaction<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction("careers",mode),request=work(tx.objectStore("careers"));let result:T;
    request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(new Error("저장소 작업에 실패했습니다. 기존 저장은 보존됩니다."));});
}
export async function putCareerSave(file:CareerSave){validateCareerState(file.state);if(file.checksum!==saveChecksum(JSON.stringify(file.state)))throw new Error("저장 무결성을 확인하지 못했습니다.");await transaction("readwrite",store=>store.put(file));}
export async function listCareerSaves():Promise<CareerSaveSummary[]>{
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const files:CareerSaveSummary[]=[],tx=db.transaction("careers","readonly"),request=tx.objectStore("careers").openCursor();
    request.onsuccess=()=>{const cursor=request.result;if(!cursor)return;const file=cursor.value as CareerSave;
      files.push({id:file.id,name:file.name,date:file.date,savedAt:file.savedAt,manual:file.manual,mode:file.state.careerMode,retired:file.state.proWorld?.stage==="retired"});cursor.continue();};
    tx.oncomplete=()=>resolve(files.sort((a,b)=>b.savedAt.localeCompare(a.savedAt)));
    tx.onerror=tx.onabort=()=>reject(new Error("저장 목록을 불러오지 못했습니다."));
  });
}
export async function getCareerSave(id:string){const file=await transaction("readonly",store=>store.get(id)) as CareerSave|undefined;if(!file)throw new Error("저장된 커리어를 찾을 수 없습니다.");return validateCareerSave(file);}
let autoQueue=Promise.resolve();const autoGenerations=new Map<string,number>();
export function queueCareerAutoSave(state:GameState){
  const key=`${state.seed}:${state.playerId}`,generation=(autoGenerations.get(key)??0)+1;autoGenerations.set(key,generation);
  const job=autoQueue.catch(()=>{}).then(async()=>{
    if(autoGenerations.get(key)!==generation)return;
    try {
      // encodeCareerSave validates and checksums this private snapshot once.
      // Imported/manual files still go through putCareerSave's verification.
      const file=encodeCareerSave(state);
      await transaction("readwrite",store=>store.put(file));
    } finally {if(autoGenerations.get(key)===generation)autoGenerations.delete(key);}
  });autoQueue=job;return job;
}
