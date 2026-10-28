/* The original daily-backup ZIP transport, implemented against the preview Map.
 * No current campaign, browser database or real filesystem is read or written.
 */
(() => {
  'use strict';
  const LIMIT = {manifest:4*1024*1024,file:16*1024*1024,zip:512*1024*1024,total:1024*1024*1024,count:10000};
  const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal:true});
  const transfers = new Map(), metadata = new WeakMap(), queues = new WeakMap();
  const labels = {c1:'循环 I',c2:'循环 II',c3:'循环 III',c4:'循环 IV',c5:'循环 V'};
  const failure = (message,status=400) => Object.assign(new Error(message),{status});
  const json = (value,status=200) => ({status,body:JSON.stringify(value),headers:[['content-type','application/json; charset=utf-8'],['cache-control','no-store']]});
  const text = (value,max=256) => {
    if(typeof value!=='string'||!value||encoder.encode(value).length>max||/[\x00-\x1f\x7f]/.test(value))throw failure('备份中的战役、循环或日期信息无效。');
    return value;
  };
  const identity = campaign => {
    const dashboard=campaign?.sections?.dashboard;
    if(!dashboard||typeof dashboard!=='object'||Array.isArray(dashboard))throw failure('备份缺少主控台数据。');
    const profileId=text(dashboard.activeProfileId),profile=dashboard.profiles?.[profileId];
    if(!profile||typeof profile!=='object'||Array.isArray(profile))throw failure('备份中的战役不存在。');
    const cycleId=text(profile.activeCycleId),day=profile.cycles?.[cycleId]?.state?.day;
    if(!['string','number','boolean'].includes(typeof day)||typeof day==='number'&&!Number.isFinite(day))throw failure('备份缺少有效天数。');
    return {profileId,cycleId,day:text(typeof day==='boolean'?(day?'1':''):String(day),128)};
  };
  const hex = bytes => [...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
  const sha = bytes => window.ATO_PREVIEW_SHA256(bytes);
  const bytesOf = value => {
    if(value instanceof ArrayBuffer)return new Uint8Array(value);
    if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
    throw failure('请选择导出的备份 ZIP 压缩包。');
  };
  const crcTable = Uint32Array.from({length:256},(_,index)=>{
    let value=index;for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;
  });
  const crc32 = bytes => {let crc=0xffffffff;for(const value of bytes)crc=crcTable[(crc^value)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;};

  // Same conventional stored-ZIP layout as briefing-report.js createZip().
  function zip(entries) {
    const pieces=[],directory=[];let offset=0;
    for(const entry of entries){
      const name=encoder.encode(entry.name),bytes=entry.bytes,crc=crc32(bytes);
      const local=new Uint8Array(30+name.length),view=new DataView(local.buffer);
      view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x800,true);view.setUint16(12,33,true);
      view.setUint32(14,crc,true);view.setUint32(18,bytes.length,true);view.setUint32(22,bytes.length,true);view.setUint16(26,name.length,true);local.set(name,30);
      const central=new Uint8Array(46+name.length),cv=new DataView(central.buffer);
      cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,33,true);
      cv.setUint32(16,crc,true);cv.setUint32(20,bytes.length,true);cv.setUint32(24,bytes.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);central.set(name,46);
      pieces.push(local,bytes);directory.push(central);offset+=local.length+bytes.length;
    }
    const directoryLength=directory.reduce((n,part)=>n+part.length,0),length=offset+directoryLength+22;
    if(length>LIMIT.zip)throw failure('备份压缩包超过 512 MB。',413);
    const end=new Uint8Array(22),ev=new DataView(end.buffer);
    ev.setUint32(0,0x06054b50,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);ev.setUint32(12,directoryLength,true);ev.setUint32(16,offset,true);
    const result=new Uint8Array(length);let position=0;
    for(const part of [...pieces,...directory,end]){result.set(part,position);position+=part.length;}
    return result;
  }

  function readDirectory(bytes) {
    if(bytes.length<22||bytes.length>LIMIT.zip)throw failure('备份压缩包大小无效。',413);
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const within=(start,size)=>{if(start<0||size<0||start+size>bytes.length)throw failure('ZIP 文件不完整。');};
    let end=-1;
    for(let cursor=bytes.length-22;cursor>=Math.max(0,bytes.length-65557);cursor--){
      if(view.getUint32(cursor,true)===0x06054b50&&cursor+22+view.getUint16(cursor+20,true)===bytes.length){end=cursor;break;}
    }
    if(end<0)throw failure('不是有效的 ZIP 压缩包。');
    const count=view.getUint16(end+10,true),length=view.getUint32(end+12,true),offset=view.getUint32(end+16,true);
    if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+8,true)!==count||count>LIMIT.count+1||offset+length!==end)throw failure('不支持分卷或 ZIP64 压缩包。');
    let cursor=offset,total=0;const files=new Map();
    for(let index=0;index<count;index++){
      within(cursor,46);if(view.getUint32(cursor,true)!==0x02014b50)throw failure('ZIP 文件目录损坏。');
      const flags=view.getUint16(cursor+8,true),method=view.getUint16(cursor+10,true),crc=view.getUint32(cursor+16,true),compressed=view.getUint32(cursor+20,true),size=view.getUint32(cursor+24,true);
      const nameLength=view.getUint16(cursor+28,true),extra=view.getUint16(cursor+30,true),comment=view.getUint16(cursor+32,true),disk=view.getUint16(cursor+34,true),external=view.getUint32(cursor+38,true),localOffset=view.getUint32(cursor+42,true);
      within(cursor+46,nameLength+extra+comment);const name=decoder.decode(bytes.subarray(cursor+46,cursor+46+nameLength));
      if(flags&1||![0,8].includes(method)||disk||((external>>>16)&0xf000)===0xa000||(name!=='manifest.json'&&!/^backups\/[0-9]{8}\.json$/.test(name))||files.has(name))throw failure('ZIP 含有不支持、重复或不安全的文件。');
      const limit=name==='manifest.json'?LIMIT.manifest:LIMIT.file;
      if(size>limit||compressed>LIMIT.zip||localOffset+30>offset)throw failure('ZIP 中的单份备份超过支持大小。',413);
      total+=size;if(total>LIMIT.total)throw failure('备份解压后的总大小超过 1 GB。',413);
      files.set(name,{name,flags,method,crc,compressed,size,offset:localOffset});cursor+=46+nameLength+extra+comment;
    }
    if(cursor!==offset+length||!files.has('manifest.json'))throw failure('备份清单缺失或 ZIP 目录损坏。');
    async function extract(name) {
      const file=files.get(name);if(!file)throw failure('清单中的备份文件缺失。');
      const start=file.offset;within(start,30);if(view.getUint32(start,true)!==0x04034b50)throw failure('ZIP 文件头损坏。');
      const flags=view.getUint16(start+6,true),method=view.getUint16(start+8,true),localCrc=view.getUint32(start+14,true),localCompressed=view.getUint32(start+18,true),localSize=view.getUint32(start+22,true),nameLength=view.getUint16(start+26,true),extra=view.getUint16(start+28,true);
      within(start+30,nameLength+extra);const actualName=decoder.decode(bytes.subarray(start+30,start+30+nameLength)),dataStart=start+30+nameLength+extra;
      if(actualName!==name||flags!==file.flags||method!==file.method||!(flags&8)&&(localCrc!==file.crc||localCompressed!==file.compressed||localSize!==file.size))throw failure('ZIP 目录与文件头或文件大小不一致。');
      if(dataStart+file.compressed>offset)throw failure('ZIP 文件边界无效。');
      const compressed=bytes.subarray(dataStart,dataStart+file.compressed);let raw;
      if(method===0)raw=compressed;
      else {
        if(typeof DecompressionStream!=='function')throw failure('当前浏览器不支持解压备份，请使用新版浏览器。');
        const reader=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),parts=[];let size=0;
        try{for(;;){const result=await reader.read();if(result.done)break;size+=result.value.length;if(size>file.size){await reader.cancel();throw failure('ZIP 备份实际大小与目录不一致。',413);}parts.push(result.value);}}catch(error){if(error.status)throw error;throw failure('ZIP 备份解压失败。');}
        raw=new Uint8Array(size);let at=0;for(const part of parts){raw.set(part,at);at+=part.length;}
      }
      if(raw.length!==file.size||crc32(raw)!==file.crc)throw failure('ZIP 备份实际大小或校验值与目录不一致。');
      return raw;
    }
    return {files,extract};
  }

  function parseJson(bytes) {try{const value=JSON.parse(decoder.decode(bytes));if(!value||typeof value!=='object'||Array.isArray(value))throw Error();return value;}catch{throw failure('压缩包中含有无效的备份 JSON。');}}
  const dayKey = day => {const prologue=/^T(\d+)(?:[/-](\d+))?$/.exec(day);return prologue?[0,Number(prologue[1]),Number(prologue[2]||0)]:/^-?\d+$/.test(day)?[1,Number(day),0]:[2,0,0];};
  function mergeCycle(cycles,item,campaign) {
    const key=item.profileId+'\0'+item.cycleId,old=cycles.get(key),left=dayKey(item.day),right=dayKey(old?.day||'');
    if(!old||left.some((n,i)=>n!==right[i]&&left.slice(0,i).every((v,j)=>v===right[j])&&n>right[i])){
      const name=campaign.sections.dashboard.profiles[item.profileId].name;
      cycles.set(key,{...item,profileName:typeof name==='string'&&name?name:item.profileId,label:labels[item.cycleId]||item.cycleId});
    }
  }
  function timestamp(campaign) {const value=Date.parse(campaign.updatedAt);return Number.isFinite(value)&&value>=0&&value<=253402300799000?Math.trunc(value):Date.now();}
  function storedBytes(campaign) {return metadata.get(campaign)?.bytes||encoder.encode(JSON.stringify(campaign));}
  async function exportArchive(ctx) {
    if(!ctx.daily.size)throw failure('当前账号还没有每日备份。',404);
    if(ctx.daily.size>LIMIT.count)throw failure('每日备份超过 10000 份。',413);
    const entries=[],files=[],cycles=new Map();let total=0,index=0;
    for(const [,campaign] of [...ctx.daily].sort((a,b)=>String(a[0])<String(b[0])?-1:String(a[0])>String(b[0])?1:0)){
      const item=identity(campaign),bytes=storedBytes(campaign);
      if(bytes.length>LIMIT.file)throw failure('单份备份超过支持的大小。',413);
      total+=bytes.length;if(total>LIMIT.total)throw failure('备份总大小超过 1 GB。',413);
      const file=`backups/${String(++index).padStart(8,'0')}.json`,hash=await sha(bytes),time=metadata.get(campaign)?.timestamp??timestamp(campaign);
      entries.push({...item,file,sha256:hash,timestamp:time});files.push({name:file,bytes});mergeCycle(cycles,item,campaign);
    }
    const cycleList=[...cycles.values()],manifest=encoder.encode(JSON.stringify({format:'ato-daily-backups',version:1,createdAt:new Date().toISOString(),cycles:cycleList,entries}));
    if(manifest.length>LIMIT.manifest)throw failure('备份清单超过支持的大小。',413);
    files.push({name:'manifest.json',bytes:manifest});
    return {bytes:zip(files),total:entries.length,cycles:cycleList};
  }
  async function importArchive(input,ctx) {
    const reader=readDirectory(bytesOf(input)),manifest=parseJson(await reader.extract('manifest.json'));
    if(manifest.format!=='ato-daily-backups'||manifest.version!==1||!Array.isArray(manifest.entries)||!Array.isArray(manifest.cycles)||manifest.entries.length>LIMIT.count||manifest.entries.length!==reader.files.size-1)throw failure('不是支持的每日备份压缩包。');
    const names=new Set(),validated=[],cycles=new Map();
    for(const entry of manifest.entries){
      if(!entry||typeof entry!=='object'||!/^backups\/[0-9]{8}\.json$/.test(entry.file)||names.has(entry.file)||typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256)||!Number.isSafeInteger(entry.timestamp)||entry.timestamp<0||entry.timestamp>253402300799000)throw failure('每日备份清单无效。');
      names.add(entry.file);const bytes=await reader.extract(entry.file);
      if(await sha(bytes)!==entry.sha256)throw failure('每日备份内容校验失败。');
      const campaign=parseJson(bytes),item=identity(campaign);
      if(Object.entries(item).some(([key,value])=>entry[key]!==value))throw failure('备份清单与实际战役、循环或日期不一致。');
      mergeCycle(cycles,item,campaign);validated.push({entry,campaign,bytes});
    }
    // Validation and decompression finish before the first mutation of daily.
    const known=new Set();for(const campaign of ctx.daily.values())known.add(await sha(storedBytes(campaign)));
    const additions=[];let skipped=0;
    for(const item of validated){
      if(known.has(item.entry.sha256)){skipped++;continue;}
      const key=`${item.entry.profileId}:${item.entry.cycleId}:${item.entry.day}:import:${item.entry.timestamp}:${item.entry.sha256}`;
      if(ctx.daily.has(key))throw failure('目标备份已存在且内容不同，导入已取消。',409);
      const campaign=ctx.copy?ctx.copy(item.campaign):structuredClone(item.campaign);
      additions.push({key,campaign,bytes:item.bytes,timestamp:item.entry.timestamp});known.add(item.entry.sha256);
    }
    for(const item of additions){ctx.daily.set(item.key,item.campaign);metadata.set(item.campaign,{bytes:item.bytes.slice(),timestamp:item.timestamp});}
    return {ok:true,imported:additions.length,skipped,total:validated.length,cycles:[...cycles.values()]};
  }
  async function withLock(map,task){const previous=queues.get(map)||Promise.resolve(),next=previous.catch(()=>{}).then(task);queues.set(map,next);try{return await next;}finally{if(queues.get(map)===next)queues.delete(map);}}

  window.ATO_PREVIEW_BACKUPS = {
    async handle(url,method='GET',body={},ctx={}) {
      if(!url.pathname.endsWith('/briefing/backups.php'))return null;
      try{
        if(!ctx.user?.id)return json({ok:false,code:'AUTH_REQUIRED',error:'请先登录主控台。'},401);
        if(!ctx.daily||typeof ctx.daily.set!=='function')throw failure('每日备份服务不可用。',500);
        const action=url.searchParams.get('action')||'',verb=method.toUpperCase();
        const allowed=action==='import'?['PUT','POST']:action==='prepare-export'?['POST']:['GET'];
        if(!allowed.includes(verb))return json({ok:false,error:'不支持这种备份操作方式。'},405);
        const now=Date.now();for(const [token,transfer]of transfers)if(now-transfer.createdAt>15*60*1000)transfers.delete(token);
        if(action==='download'){
          const token=url.searchParams.get('token');if(!/^[a-f0-9]{32}$/.test(token||''))throw failure('备份下载地址无效。');
          const transfer=transfers.get(token);if(!transfer||transfer.userId!==ctx.user.id)throw failure('备份压缩包已过期，请重新导出。',404);
          return {status:200,body:transfer.bytes.slice().buffer,headers:[['content-type','application/zip'],['cache-control','no-store'],['content-disposition',`attachment; filename="${transfer.filename}"`],['content-length',String(transfer.bytes.length)]]};
        }
        if(action==='import')return await withLock(ctx.daily,async()=>json(await importArchive(body.bytes,ctx)));
        if(action!=='prepare-export'&&action!=='export')throw failure('未知备份操作。');
        return await withLock(ctx.daily,async()=>{
          const result=await exportArchive(ctx),filename='ATO-daily-backups-'+new Date().toISOString().replace(/[-:]/g,'').replace('T','-').slice(0,15)+'.zip';
          if(action==='export')return {status:200,body:result.bytes.buffer,headers:[['content-type','application/zip'],['content-disposition',`attachment; filename="${filename}"`],['cache-control','no-store']]};
          const token=hex(crypto.getRandomValues(new Uint8Array(16))),downloadUrl=new URL(url.href);downloadUrl.search='';downloadUrl.searchParams.set('action','download');downloadUrl.searchParams.set('token',token);
          transfers.set(token,{...result,filename,userId:ctx.user.id,createdAt:Date.now()});
          return json({ok:true,total:result.total,cycles:result.cycles,filename,downloadUrl:downloadUrl.href});
        });
      }catch(error){return json({ok:false,code:'BACKUP_ARCHIVE_INVALID',error:error.message||'备份操作失败。'},error.status||400);}
    },
  };
})();
