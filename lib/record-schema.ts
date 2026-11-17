// v2 numeric records have a negative marker, so old positional arrays can be
// decoded without confusing removed batting fields with pitching statistics.
export function migratePackedRecord(values:number[]){
  return values[0]===-2?values:[-2,...values.slice(0,10),...values.slice(12)];
}
export function removeBattedBallRecords<T>(value:T):T{
  function walk(value:unknown,key='',packed=false):unknown{
    if(!value||typeof value!=='object')return value;
    if(Array.isArray(value)){
      if((packed||key==='record'||key==='records')&&value.every(v=>typeof v==='number')&&[20,22,26,28].includes(value.length)&&value[0]!==-2)return migratePackedRecord(value);
      let changed=false;
      const copy=value.map(v=>{const next=walk(v,key,key==='recentAppearances');if(next!==v)changed=true;return next;});
      return changed?copy:value;
    }
    const object=value as Record<string,unknown>,copy:Record<string,unknown>={};let changed=false;
    const batting=typeof object.PA==='number'&&typeof object.AB==='number';
    for(const [name,entry]of Object.entries(object)){
      if(batting&&(name==='GB'||name==='FB')){changed=true;continue;}
      const next=walk(entry,name,['records','recent','league','history'].includes(key));
      copy[name]=next;if(next!==entry)changed=true;
    }
    return changed?copy:value;
  }
  return walk(value) as T;
}
