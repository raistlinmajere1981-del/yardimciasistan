import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const adb=process.env.ADB||'adb',serial=process.env.ANDROID_SERIAL;
const args=serial?['-s',serial]:[];
const run=(...rest)=>execFileSync(adb,[...args,...rest],{encoding:'utf8',timeout:120000});
const devices=run('devices').split('\n').filter(line=>/\tdevice$/.test(line));
if(!serial&&devices.length!==1)throw Error('Select exactly one authorized device using ANDROID_SERIAL.');
console.log(run('install','-r','apps/dealer-android-app/build/outputs/apk/debug/yardimci-asistan-bayi-debug.apk'));
console.log(run('install','-r','apps/dealer-android-app/build/outputs/apk/androidTest/debug/yardimci-asistan-dealer-debug-androidTest.apk'));
const wasAsleep=/mWakefulness=Asleep/.test(run('shell','dumpsys','power'));
run('shell','input','keyevent','KEYCODE_WAKEUP');
let result;
try{result=run('shell','am','instrument','-w','com.yardimciasistan.dealer.test/com.yardimciasistan.dealer.InspectorInstrumentation');}
finally{if(wasAsleep)run('shell','input','keyevent','KEYCODE_SLEEP');}
console.log(result);
mkdirSync('artifacts/image-inspector',{recursive:true});writeFileSync('artifacts/image-inspector/android.txt',result);
if(!result.includes('PASS Android WebView:')||/FAIL|INSTRUMENTATION_FAILED|Process crashed/.test(result))throw Error('Android inspector device verification failed.');
