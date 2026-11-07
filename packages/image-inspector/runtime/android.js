/* Narrow native adapter. No remote navigation, upload, account or commerce bridge. */
(function(){
  'use strict';
  let instance;
  window.startInspector=config=>{
    instance?.destroy();
    if(config.personal)config.items.push({name:'Benim parçam',urls:[config.personal],personal:true});
    instance=window.ImageInspector.mount({...config,host:document.body,
      choosePersonal:kind=>window.InspectorHost.choose(kind),
      onClose:()=>window.InspectorHost.close(),
      onPersonalClear:()=>window.InspectorHost.forgetPersonal(),
      onState:state=>window.InspectorHost.state(JSON.stringify(state))});
    instance.view.querySelector('.ii-close').focus({preventScroll:true});

  };
  window.inspectorPersonal=url=>instance?.personalSource(url);
  window.stopInspector=()=>{instance?.destroy();instance=null;};
})();
