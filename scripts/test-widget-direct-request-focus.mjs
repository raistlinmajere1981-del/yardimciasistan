// Narrow success-transition regression; runs maintained TS without building the app.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function fixture() {
  const document = {activeElement:null, querySelector:()=>null};
  class Element {
    children=[]; dataset={}; attrs={}; listeners={}; isConnected=true;
    classList={toggle(){}};
    appendChild(child) {this.children.push(child); return child;}
    setAttribute(key,value) {this.attrs[key]=value;}
    addEventListener(key,fn) {this.listeners[key]=fn;}
    focus() {document.activeElement=this;}
    click() {this.listeners.click?.();}
    querySelector() {return null;}
  }
  class Form extends Element {
    matches() {return true;}
    reportValidity() {return true;}
    closest() {return subview;}
    querySelector(selector) {return selector==='button[type="submit"]' ? submit : null;}
    replaceWith(node) {
      success=node; node.isConnected=this.isConnected; this.isConnected=false;
      if (document.activeElement===this || document.activeElement===submit) document.activeElement=document.body;
    }
  }
  document.createElement=()=>new Element(); document.body=new Element();
  const submit=new Element(), home=new Element(), intro=new Element(), heading=new Element(), description=new Element(), subview=new Element();
  intro.querySelector=selector=>selector==='h2'?heading:description;
  subview.querySelector=selector=>selector==='.ya-widget-subview-intro'?intro:home;
  let success, requests=0, release;
  const response=new Promise(resolve=>release=()=>resolve({ok:true,json:async()=>({ok:true,request_id:'TEST'})}));
  const context=vm.createContext({document,exports:{}, HTMLFormElement:Form, crypto:globalThis.crypto,
    FormData:class { get(key) {return {request_type:'general_info',customer_name:'TEST',customer_phone:'+905550000000',guest_count:'1'}[key] || ''; } },
    fetch:()=>{requests++;return response;},
    require:name=> name==='./site-language'?{ui:x=>x,html:x=>x}:name==='./widget-nexa'?{widgetNexa:{begin:()=>()=>{}}}:name==='./request-message'?{requestMessage:()=>''}:{normalizeInternationalPhone:()=>({ok:true,e164:'+905550000000'}),createWhatsAppUrl:()=>''}
  });
  const source=readFileSync(new URL('../test-site/landing/assistant/direct-request-flow.ts',import.meta.url),'utf8');
  vm.runInContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
  vm.runInContext("runtimeConfig.apiBaseUrl = 'https://fixture.invalid';",context);
  const form=new Form(); document.activeElement=submit;
  return {context,document,form,home,heading,release,get requests(){return requests;},get success(){return success;}};
}

test('success moves focus from removed form to the connected done action',()=>{
  const f=fixture();f.context.renderSuccess(f.form,'');
  const [summary,actions]=f.success.children, done=actions.children.at(-1);
  assert.equal(summary.attrs.role,'status');assert.equal(done.dataset.yaRequestDone,'1');
  assert.equal(f.document.activeElement,done);assert.match(f.heading.textContent,/iletildi/);
  let returned=false;f.home.listeners.click=()=>returned=true;done.click();assert.equal(returned,true);
});
test('late success after closing never steals page focus',()=>{
  const f=fixture();f.document.activeElement=f.document.body;
  const previous=f.document.activeElement;f.form.isConnected=false;
  f.context.renderSuccess(f.form,'');assert.equal(f.document.activeElement,previous);
});
test('in-flight duplicate submission produces one request and one focused success action',async()=>{
  const f=fixture(), event={target:f.form,preventDefault(){},stopImmediatePropagation(){}};
  f.context.interceptRequestSubmit(event);f.context.interceptRequestSubmit(event);
  assert.equal(f.requests,1);f.release();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.requests,1);assert.equal(f.document.activeElement.dataset.yaRequestDone,'1');
  assert.equal(f.form.isConnected,false);
});
