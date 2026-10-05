import { multichannelFixture } from './marketing-multichannel-fixtures.mjs';
import { editorialInput } from './marketing-fixtures.mjs';
export function scheduleFixture() {
  const f=multichannelFixture();let timestamp=Date.parse('2030-01-01T00:00:00Z'),allowed=true;
  const now=()=>new Date(timestamp);
  const {MarketingScheduleService}=f.load('marketing/schedule-service');
  const {MarketingScheduledTargetService}=f.load('marketing/scheduled-target-service');
  const {MarketingSchedulerService}=f.load('marketing/scheduler-service');
  const service=new MarketingScheduleService(()=>f.db,()=>{},now),targets=new MarketingScheduledTargetService(()=>f.db,f.campaigns,f.service,f.instagram);
  let runtime=new MarketingSchedulerService(()=>f.db,targets,{allowed:()=>allowed,now});
  function publication(channel='website') {
    const p=channel==='instagram'?f.publication():f.db.saveMarketingPublication({contentId:f.service.saveContent(editorialInput()).content.id,channel:'website',placement:'homepage_feature',title:'PUBLICATION_PRIVATE',text:'BODY_PRIVATE',mediaAssetIds:[]});
    const d=f.db.listMarketingContents().find(d=>d.content.id===p.contentId);
    f.service.saveContent({...editorialInput(),id:d.content.id,expectedRevision:d.content.revision,status:'ready'});
    return p;
  }
  const input=(p,changes={})=>({name:'SCHEDULE_PRIVATE',targetType:'public_publication',targetId:p.id,channel:p.channel,expectedTargetRevision:p.revision,scheduleType:'once',timezone:'Europe/Istanbul',startsLocal:'2030-01-01T04:00',missedRunPolicy:'run_once_when_resumed',...changes});
  const tick=async()=>{runtime.start();await runtime.runOnce();await runtime.suspendAndDrain();};
  const restart=async()=>{await runtime.suspendAndDrain();f.reopen();runtime=new MarketingSchedulerService(()=>f.db,targets,{allowed:()=>allowed,now});};
  return {...f,get db(){return f.db;},scheduleService:service,targets,now,input,publication,tick,restart,get runtime(){return runtime;},advance:ms=>{timestamp+=ms;},setTime:s=>{timestamp=Date.parse(s);},setAllowed:v=>{allowed=v;},dispose:async()=>{await runtime.suspendAndDrain();await f.dispose();}};
}
