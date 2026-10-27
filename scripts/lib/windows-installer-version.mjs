import {openSync, readSync, closeSync, fstatSync} from 'node:fs';

/** Read the PE RT_VERSION resource; never infer an EXE version from its filename.
 * https://learn.microsoft.com/windows/win32/api/verrsrc/ns-verrsrc-vs_fixedfileinfo
 */
export function readWindowsInstallerVersion(path) {
  const fd=openSync(path,'r');
  try {
    const fileSize=fstatSync(fd).size;
    const read=(offset,size)=>{
      if(!Number.isSafeInteger(offset)||offset<0||size<0||size>1024*1024||offset+size>fileSize)throw Error('Windows PE kaynağı geçersiz.');
      const buffer=Buffer.alloc(size);
      if(readSync(fd,buffer,0,size,offset)!==size)throw Error('Windows PE kaynağı okunamadı.');
      return buffer;
    };
    const dos=read(0,64);
    if(dos.toString('ascii',0,2)!=='MZ')throw Error('Windows kurulum dosyası PE değil.');
    const peOffset=dos.readUInt32LE(60),pe=read(peOffset,24);
    if(pe.readUInt32LE(0)!==0x4550)throw Error('Windows PE imzası geçersiz.');
    const count=pe.readUInt16LE(6),optionalSize=pe.readUInt16LE(20),optional=read(peOffset+24,optionalSize);
    const directoryOffset=optional.readUInt16LE(0)===0x10b?96:optional.readUInt16LE(0)===0x20b?112:0;
    if(!directoryOffset||optional.length<directoryOffset+24||count>96)throw Error('Windows PE başlığı geçersiz.');
    const resourceRva=optional.readUInt32LE(directoryOffset+16),resourceSize=optional.readUInt32LE(directoryOffset+20);
    if(!resourceRva||resourceSize>1024*1024)throw Error('Windows sürüm kaynağı yok veya çok büyük.');
    const sections=read(peOffset+24+optionalSize,count*40);
    const rvaOffset=(rva,size)=>{
      for(let i=0;i<count;i++) {
        const offset=i*40,virtualAddress=sections.readUInt32LE(offset+12),rawSize=sections.readUInt32LE(offset+16);
        if(rva>=virtualAddress&&rva+size<=virtualAddress+rawSize)return sections.readUInt32LE(offset+20)+rva-virtualAddress;
      }
      throw Error('Windows PE kaynak adresi geçersiz.');
    };
    const resources=read(rvaOffset(resourceRva,resourceSize),resourceSize);
    const entries=offset=>{
      if(offset<0||offset+16>resources.length)throw Error('Windows kaynak dizini geçersiz.');
      const length=resources.readUInt16LE(offset+12)+resources.readUInt16LE(offset+14);
      if(offset+16+length*8>resources.length)throw Error('Windows kaynak dizini eksik.');
      return Array.from({length},(_,i)=>({id:resources.readUInt32LE(offset+16+i*8),child:resources.readUInt32LE(offset+20+i*8)}));
    };
    const versionRoot=entries(0).find(entry=>entry.id===16);
    if(!versionRoot||(versionRoot.child>>>31)!==1)throw Error('Windows RT_VERSION kaynağı yok.');
    let leaf;
    const descend=(child,depth)=>{
      if(depth>3)throw Error('Windows kaynak derinliği geçersiz.');
      if(child>>>31) { for(const entry of entries(child&0x7fffffff))descend(entry.child,depth+1); }
      else if(leaf===undefined)leaf=child;
    };
    descend(versionRoot.child,0);
    if(leaf===undefined||leaf+16>resources.length)throw Error('Windows sürüm kaynağı eksik.');
    const data=read(rvaOffset(resources.readUInt32LE(leaf),resources.readUInt32LE(leaf+4)),resources.readUInt32LE(leaf+4));
    const key=Buffer.from('VS_VERSION_INFO\0','utf16le');
    if(data.length<92||data.readUInt16LE(2)!==52||!data.subarray(6,6+key.length).equals(key))throw Error('Windows sürüm bilgisi geçersiz.');
    const valueOffset=(6+key.length+3)&~3;
    if(data.readUInt32LE(valueOffset)!==0xfeef04bd)throw Error('Windows sabit sürüm bilgisi geçersiz.');
    const version=(ms,ls)=>[ms>>>16,ms&65535,ls>>>16,ls&65535].join('.');
    return {fileVersion:version(data.readUInt32LE(valueOffset+8),data.readUInt32LE(valueOffset+12)),productVersion:version(data.readUInt32LE(valueOffset+16),data.readUInt32LE(valueOffset+20))};
  } finally {closeSync(fd);}
}
