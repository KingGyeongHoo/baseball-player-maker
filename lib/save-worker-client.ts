type SaveWorker=Pick<Worker,"postMessage"|"terminate"|"onmessage"|"onerror"|"onmessageerror">;
type Reply={id?:number;type?:"ready"|"progress";error?:string};

export class SaveWorkerUnavailableError extends Error {}

// A constructed worker may never execute after a development hot update.
// Wait for its entrypoint handshake before sending a large career snapshot.
export class SaveWorkerClient {
  private worker:SaveWorker|undefined;
  private ready=false;
  private sequence=0;
  constructor(private readonly createWorker:()=>SaveWorker,private readonly startupTimeoutMs=8000,private readonly requestTimeoutMs=30000){}

  request(payload:()=>object):Promise<void>{
    return new Promise((resolve,reject)=>{
      let current:SaveWorker|undefined,timer:ReturnType<typeof setTimeout>|undefined,settled=false,sent=false;
      const finish=(error?:Error)=>{
        if(settled)return;settled=true;clearTimeout(timer);
        if(error){current?.terminate();if(this.worker===current){this.worker=undefined;this.ready=false;}reject(error);}else resolve();
      };
      const watch=(milliseconds:number,message:string)=>{clearTimeout(timer);timer=setTimeout(()=>finish(new SaveWorkerUnavailableError(message)),milliseconds);};
      try{
        current=this.worker??=this.createWorker();const id=++this.sequence;
        const send=()=>{if(sent||settled)return;sent=true;watch(this.requestTimeoutMs,"저장 워커의 응답 시간이 초과되었습니다.");try{current!.postMessage({id,...payload()});}catch{finish(new SaveWorkerUnavailableError("저장 워커로 데이터를 보내지 못했습니다."));}};
        current.onmessage=(event:MessageEvent<Reply>)=>{
          if(settled)return;
          if(event.data.type==="ready"){this.ready=true;send();return;}
          if(event.data.id!==id||!sent)return;
          if(event.data.type==="progress"){watch(this.requestTimeoutMs,"저장 워커의 응답 시간이 초과되었습니다.");return;}
          finish(event.data.error?new Error(event.data.error):undefined);
        };
        current.onerror=()=>finish(new SaveWorkerUnavailableError("저장 워커를 실행하지 못했습니다."));
        current.onmessageerror=()=>finish(new SaveWorkerUnavailableError("저장 워커의 응답을 읽지 못했습니다."));
        if(this.ready)send();else watch(this.startupTimeoutMs,"저장 워커가 시작되지 않았습니다.");
      }catch{finish(new SaveWorkerUnavailableError("저장 워커를 만들지 못했습니다."));}
    });
  }
}
