import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const temp = mkdtempSync(join(tmpdir(), "ya-public-site-contract-"));
try {
  for (const [name, src] of [
    ["demo", resolve("test-site/landing/inc/site.php")],
    ["blacksea", "/home/raistlin/blacksea_web/inc/site.php"]
  ]) {
    const site = join(temp, name);
    mkdirSync(join(site, "inc"), {recursive:true});
    mkdirSync(join(site, "yardimci-asistan", "lib"), {recursive:true});
    cpSync(src, join(site, "inc", "site.php"));
    const sourceRoot = name === "demo" ? resolve("test-site/landing") : "/home/raistlin/blacksea_web";
    for (const f of ["header.php", "footer.php"]) cpSync(join(sourceRoot, "inc", f), join(site, "inc", f));
    for (const page of ["hakkimizda", "galeri"]) {
      mkdirSync(join(site, page), {recursive:true});
      cpSync(join(sourceRoot, page, "index.php"), join(site, page, "index.php"));
    }
    const render = (content, page) => execFileSync("php", ["-r", '$_SERVER["REQUEST_URI"]=$argv[2]; require $argv[1];', join(site, page, "index.php"), "/"+page+"/"], {
      env: {...process.env, SITE_TEST_CONTEXT: JSON.stringify(content)}, encoding:"utf8"
    });
    writeFileSync(join(site, "yardimci-asistan", "lib", "storage.php"), '<?php function ya_storage_get_publication($name,$fallback) { if ($name !== "business_context") return $fallback; return json_decode(getenv("SITE_TEST_CONTEXT") ?: "[]", true); }');
    function read(content) {
      const expression = name === "demo" ?
        'require $argv[1]; echo json_encode(["about"=>site_about_text(),"gallery"=>site_gallery_images(),"nav"=>array_column(site_navigation(),"id")]);' :
        'require $argv[1]; echo json_encode(["about"=>published_about_text(),"gallery"=>published_gallery_images()]);';
      return JSON.parse(execFileSync("php", ["-r", expression, join(site, "inc", "site.php")],{
        env:{...process.env,SITE_TEST_CONTEXT:JSON.stringify(content)},encoding:"utf8"
      }));
    }
    const empty=read({});
    assert.equal(empty.about,"");
    assert.equal(empty.gallery.length,0);
    if (name === "demo") { assert.ok(!empty.nav.includes("about")); assert.ok(!empty.nav.includes("gallery")); }
    const example={_publication:{published_at:"2026-10-18"},about_text:"Hakkımızda <script>alert(1)</script>",
      gallery:[
        {url:"javascript:alert(1)",title:"bad"},
        {url:"/yardimci-asistan/media/gallery/gallery/valid.jpg",title:"Oda <b>fotoğrafı</b>"}
      ]};
    const populated=read(example);
    assert.equal(populated.about,"Hakkımızda <script>alert(1)</script>");
    assert.equal(populated.gallery.length,1);
    assert.equal(populated.gallery[0].title,"Oda <b>fotoğrafı</b>");
    if (name === "demo") { assert.ok(populated.nav.includes("about")); assert.ok(populated.nav.includes("gallery")); }
    const aboutHtml = render(example, "hakkimizda");
    const galleryHtml = render(example, "galeri");
    assert.ok(aboutHtml.includes("Hakkımızda &lt;script&gt;alert(1)&lt;/script&gt;"), name + " about HTML escaping");
    assert.ok(galleryHtml.includes('/yardimci-asistan/media/gallery/gallery/valid.jpg'), name + " image URL");
    assert.ok(!galleryHtml.includes('javascript:alert(1)'), name + " invalid URL blocked");
    if (name === "blacksea") {
      assert.ok(galleryHtml.includes("data-business-gallery"));
      assert.ok(!galleryHtml.includes("data-room-gallery"), "room-media renderer cannot append unrelated photos");
    }
    assert.ok(!render({}, "hakkimizda").includes('href="/hakkimizda/"'), name + " empty about hidden from navigation");
    assert.ok(!render({}, "galeri").includes('href="/galeri/"'), name + " empty gallery hidden from navigation");
    console.log(name + "-about-gallery-visibility-ok");
  }
  console.log("business-site-pages-contract-ok");
} finally { rmSync(temp,{recursive:true,force:true}); }
