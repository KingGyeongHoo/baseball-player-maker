export async function gzipText(text:string){
  const stream=new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function gunzipBytes(bytes:Uint8Array){
  try{
    const stream=new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  }catch{throw new Error('압축 저장 파일을 읽지 못했습니다. 원본 파일은 유지됩니다.');}
}
export async function saveBlobText(blob:Blob){
  const magic=new Uint8Array(await blob.slice(0,2).arrayBuffer());
  return magic[0]===31&&magic[1]===139?gunzipBytes(new Uint8Array(await blob.arrayBuffer())):blob.text();
}
