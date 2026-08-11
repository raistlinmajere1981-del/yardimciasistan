(function () {
  "use strict";

  var source = document.currentScript;
  if (!source || !source.src) return;

  function copyScriptContext(target) {
    Object.keys(source.dataset).forEach(function (key) {
      target.dataset[key] = source.dataset[key];
    });
    if (source.nonce) target.nonce = source.nonce;
    if (source.crossOrigin) target.crossOrigin = source.crossOrigin;
    if (source.referrerPolicy) target.referrerPolicy = source.referrerPolicy;
  }

  var core = document.createElement("script");
  core.src = new URL("widget-core.js", source.src).href;
  copyScriptContext(core);
  core.addEventListener("load", function () {
    var directFlow = document.createElement("script");
    directFlow.src = new URL("direct-request-flow.js", source.src).href;
    copyScriptContext(directFlow);
    document.head.appendChild(directFlow);
  }, { once: true });
  document.head.appendChild(core);
})();
