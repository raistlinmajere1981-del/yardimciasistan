import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {resolve} from "node:path";
import {resolveInstallationRepo} from "./lib/installation-registry.mjs";

// All installed sites use the same real PHP projection/views, including empty and withdrawn data.
const code = `require $argv[1].'/core/bootstrap.php';
  $business=['ok'=>true,'business'=>json_decode(stream_get_contents(STDIN),true)];
  $publication=\\YaSite\\project_publication($business,[],'/yardimci-asistan','tr');
  $site=['root'=>$argv[1],'base_path'=>'','module_path'=>'/yardimci-asistan','language'=>\\YaSite\\language_context($argv[1],$business)];
  $pages=\\YaSite\\available_pages($publication,[]);
  ob_start();if(isset($pages['about']))\\YaSite\\render_view('pages/about',['publication'=>$publication,'title'=>'Hakkımızda'],$site);$about=ob_get_clean();
  ob_start();if(isset($pages['gallery']))\\YaSite\\render_view('pages/gallery',['publication'=>$publication,'title'=>'Galeri'],$site);$gallery=ob_get_clean();
  echo json_encode(['about'=>$about,'gallery'=>$gallery,'pages'=>array_keys($pages)]);`;
for(const [name,root] of [['canonical',resolve('web-site-template')],['demo',resolve('test-site/landing/deneme')],['blacksea',resolveInstallationRepo('blacksea')]]) {
  const render=value=>JSON.parse(execFileSync('php',['-r',code,root],{encoding:'utf8',input:JSON.stringify(value)}));
  const checkoutPages = ['cart','checkout-customer','checkout-delivery','checkout-payment','checkout-review','checkout-result'];
  const assertNoBusinessSurface = (pages) => assert.deepEqual(pages, ['home',...checkoutPages], 'Only home and hidden checkout recovery routes may exist without publication');
  const empty=render({});assertNoBusinessSurface(empty.pages);assert.equal(empty.about,'');assert.equal(empty.gallery,'');
  const populated=render({about_text:'Hakkımızda <script>alert(1)</script>',gallery:[
    {id:'bad',url:'javascript:alert(1)',title:'bad'},
    {id:'valid',url:'/yardimci-asistan/media/gallery/gallery/valid.jpg',title:'Oda <b>fotoğrafı</b>'},
    {id:'withdrawn',url:'/yardimci-asistan/media/gallery/gallery/withdrawn.jpg',published:false,title:'WITHDRAWN'}]});
  assert.ok(populated.pages.includes('about'));assert.ok(populated.pages.includes('gallery'));
  assert.ok(populated.about.includes('Hakkımızda &lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(populated.gallery.includes('/yardimci-asistan/media/gallery/gallery/valid.jpg'));assert.ok(!populated.gallery.includes('javascript:'));
  assert.ok(populated.gallery.includes('Oda &lt;b&gt;fotoğrafı&lt;/b&gt;'));assert.ok(!populated.gallery.includes('withdrawn.jpg'));
  assertNoBusinessSurface(render({about_text:'',gallery:[]}).pages);
  console.log(name+'-shared-template-about-gallery-visibility-ok');
}
console.log('business-site-pages-contract-ok');
