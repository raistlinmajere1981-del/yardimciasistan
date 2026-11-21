<?php
declare(strict_types=1);
require_once __DIR__ . '/../web-site-template/core/publication.php';
require_once __DIR__ . '/../web-site-template/core/render.php';
require_once __DIR__ . '/../web-site-template/core/seo.php';

use function YaSite\seo_page_meta;
use function YaSite\seo_is_indexable;
use function YaSite\seo_alternate_urls;
use function YaSite\sitemap_xml;
use function YaSite\canonical_url;

function ensure(bool $valid, string $message): void {
    if (!$valid) throw new RuntimeException($message);
}
$site = [
    'public_origin'=>'https://pansiyon.example',
    'base_path'=>'',
    'module_path'=>'/yardimci-asistan',
    'language'=>[
        'code'=>'en','locale'=>'en','catalogs'=>['tr'=>[],'en'=>[],'de'=>[]],
        'messages'=>[]
    ]
];
$pub=[
    'name'=>'Guesthouse',
    'description'=>'English public description',
    'gallery'=>[],
    'seo'=>['version'=>1,'pages'=>[
        'rooms'=>[
            'title'=>'Türkçe Oda Başlığı',
            'description'=>'Türkçe açıklama',
            'og_title'=>'Türkçe OG',
            'og_description'=>'Türkçe OG Açıklama'
        ]
    ]],
    'seo_localization'=>[
        'rooms'=>['en'=>[
            'title'=>'English Room SEO',
            'description'=>'English room description',
            'og_title'=>'Share Rooms',
            'og_description'=>'Share English Rooms'
        ]]
    ],
    'rooms'=>[['id'=>'r1','name'=>'Test Room']],
    'tables'=>[],
    'menu'=>[],
    'categories'=>[],
    'contact'=>['available'=>false]
];
$view=[
    'page'=>'rooms','status'=>'ok',
    'title'=>'Rooms',
    'room'=>null,'table'=>null,
    'menu_category'=>'',
    'canonical'=>'https://pansiyon.example/?page=rooms&lang=en',
    'menu_categories'=>[],
    'pages'=>[
        'home'=>['key'=>'page.home'],
        'rooms'=>['key'=>'page.rooms'],
        'menu'=>['key'=>'page.menu'],
        'account'=>['key'=>'account','internal'=>true]
    ],
    'publication'=>$pub
];
$meta=seo_page_meta($site,$view);
ensure($meta['title']==='English Room SEO','SEO override must use selected language');
ensure($meta['description']==='English room description','Localized description missing');
ensure($meta['ogTitle']==='Share Rooms','Open Graph override missing');
$alt=seo_alternate_urls($site,$view);
ensure(count($alt)===4,'Expected 3 locales and x-default');
ensure($alt['en']===$view['canonical'],'Hreflang self URL must match canonical');
ensure(str_contains($alt['de'],'lang=de'),'Expected German alternate');
ensure($alt['x-default']===$alt['tr'],'x-default must follow source locale');
ensure(seo_is_indexable($view),'Public page should be indexable');

$site['language']['code']='de';
$meta=seo_page_meta($site,$view);
ensure($meta['title']==='Rooms · Guesthouse','Untranslated German SEO must not reuse Turkish override');
ensure($meta['description']==='English public description','Fallback must be published source context');
$view['room']=['id'=>'r1','name'=>'Test Room','description'=>'Room detail'];
$view['canonical']=canonical_url($site,$view);
$meta=seo_page_meta($site,$view);
ensure($meta['title']==='Rooms · Guesthouse','Detail page must not inherit generic listing SEO title');
$alternates=seo_alternate_urls($site,$view,'rooms','r1');
ensure(str_contains($alternates['de'],'id=r1'),'Localized room detail URL missing');

$view['room']=null;
$view['canonical']='https://pansiyon.example/?page=rooms&lang=de';
$view['page']='menu';
$view['table_token']='abcdefghijklmnopqrstuvwx';
ensure(!seo_is_indexable($view),'Tokenized menu must not expose alternate links');
ensure(seo_alternate_urls($site,$view)===[],'QR token should never enter hreflang');
unset($view['table_token']);
$view['page']='home';
$view['canonical']='https://pansiyon.example/?page=home&lang=de';
$xml=sitemap_xml($site,$view);
ensure(str_contains($xml,'xmlns:xhtml="http://www.w3.org/1999/xhtml"'),'Sitemap xhtml namespace missing');
ensure(str_contains($xml,'hreflang="de"'),'Sitemap locale alternates missing');
ensure(str_contains($xml,'hreflang="x-default"'),'Sitemap source fallback missing');
ensure(!str_contains($xml,'page=account'),'Account route must be excluded from sitemap');
ensure(!str_contains($xml,'abcdefghijklmnopqrstuvwx'),'QR bearer must never enter sitemap');
if (function_exists('simplexml_load_string')) {
    ensure(simplexml_load_string($xml)!==false,'Sitemap must be well-formed XML');
}
echo "SEO head, canonical, hreflang, QR noindex, and XML checks PASS\n";
