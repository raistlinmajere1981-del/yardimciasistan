// One-time fixture provenance helper. Reads the pre-V2 Java at the recorded commit;
// never participates in a production build or supplies a second runtime algorithm.
import {mkdtempSync,writeFileSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const baseline='2e26033eef636fca11be758fad2561f07bfb6661';
const directory=mkdtempSync(join(tmpdir(),'inspector-golden-'));
try {
 const dir=join(directory,'com/yardimciasistan/dealer');mkdirSync(dir,{recursive:true});
 writeFileSync(join(dir,'DealerPhotoPixels.java'),execFileSync('git',['show',baseline+':apps/dealer-android-app/src/main/java/com/yardimciasistan/dealer/DealerPhotoPixels.java']));
 const rgba=[0,0,0,255,32,32,32,255,255,255,255,255,50,100,150,128,90,40,210,255,190,190,190,255,100,100,100,255,0,200,255,32,7,27,77,255,230,150,40,255,77,210,100,255,230,230,230,0];
 const argb=Array.from({length:12},(_,i)=>(rgba[i*4+3]<<24)|(rgba[i*4]<<16)|(rgba[i*4+1]<<8)|rgba[i*4+2]);
 writeFileSync(join(dir,'Golden.java'),`package com.yardimciasistan.dealer; public class Golden {public static void main(String[]a){int[]s={${argb}};for(DealerPhotoPixels.Mode m:DealerPhotoPixels.Mode.values()){int[]r=DealerPhotoPixels.apply(s,4,3,m,()->false);System.out.print(m.name()+":");for(int p:r)System.out.print((p>>>16&255)+","+(p>>>8&255)+","+(p&255)+","+(p>>>24&255)+",");System.out.println();}}}`);
 execFileSync('javac',[join(dir,'DealerPhotoPixels.java'),join(dir,'Golden.java')]);
 const lines=execFileSync('java',['-cp',directory,'com.yardimciasistan.dealer.Golden'],{encoding:'utf8'}).trim().split('\n');
 const expected=Object.fromEntries(lines.map(line=>{const [mode,values]=line.split(':');return [mode.toLowerCase(),values.split(',').filter(Boolean).map(Number)];}));
 writeFileSync(new URL('fixture.json',import.meta.url),JSON.stringify({provenance:'Native Android baseline '+baseline,width:4,height:3,rgba,expected},null,2)+'\n');
 console.log('Golden fixture written from native Android baseline.');
}finally{rmSync(directory,{recursive:true,force:true});}
