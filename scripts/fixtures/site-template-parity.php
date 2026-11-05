<?php
// No socket, database, publication write or AI provider. Synthetic projection only.
declare(strict_types=1);
function check(bool $condition, string $message): void { if (!$condition) throw new RuntimeException($message); }
[$script, $entry, $root, $expectedId, $expectedCommonEntry, $base] = $argv;
putenv('YA_SITE_API_ORIGIN=offline-contract');
putenv('YA_SITE_LOCAL_API_ROOT');
$_SERVER['REQUEST_URI'] = $base . '/'; $_SERVER['REQUEST_METHOD'] = 'GET';
$_GET = ['lang'=>'de']; $_COOKIE = ['ya_site_language'=>'de'];
ob_start(); require $entry; $initial = ob_get_clean();
check(in_array(realpath($expectedCommonEntry), get_included_files(), true), 'Actual root must include the common entry');
check(str_contains($initial, '<html lang="tr"'), 'Language OFF ignores stale query/cookie');
check(str_contains($initial, $base.'/assets/site/theme.css'), 'Active site-owned theme');
check(str_contains($initial, $base.'/assets/core/site.mjs'), 'Active common application');
check(!preg_match('~/assets/(?:assistant|js|i18n)/~', $initial), 'Legacy independent runtime inactive');
$source = \YaSite\source_catalog($root);
check($source['id'] === $expectedId && $source['source_language'] === 'tr', 'Site source identity');
check(count($source['entries']) <= 2048 && strlen(json_encode($source,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)) <= 512*1024, 'Source limits');
foreach (['room.panorama.expand','room.panorama.close'] as $key) check(isset($source['entries'][$key]), 'Panorama source key');
$business = ['ok'=>true, 'business'=>['display_name'=>'TEST', 'public_surfaces'=>['rooms'], 'ai_enabled'=>false, 'requests_enabled'=>true, 'request_types'=>['general_info','pension_reservation']]];
$sources = ['rooms'=>['status'=>'ok','data'=>['ok'=>true,'enabled'=>true,'rooms'=>[['id'=>'TEST-room','name'=>'TEST room','media'=>[
 ['kind'=>'panorama_180','url'=>'/yardimci-asistan/media/TEST-180.jpg'],
 ['kind'=>'panorama_360','url'=>'/yardimci-asistan/media/TEST-360.jpg'],
 ['kind'=>'panorama_360','url'=>'/yardimci-asistan/media/PRIVATE.jpg','published'=>false]
]]]]]];
$config = require $root.'/site/config.php';
$publication = \YaSite\project_publication($business,$sources,'/yardimci-asistan','tr');
check($publication['features']['chat'] === false && $publication['features']['requests'] === true && $publication['features']['room_requests'] === true, 'AI OFF / requests ON projection');
$pages = \YaSite\available_pages($publication,$config,$root);
$site = ['root'=>$root,'base_path'=>$base,'module_path'=>'/yardimci-asistan','public_origin'=>'https://fixture.example.test','language'=>\YaSite\language_context($root,$business),'favicon'=>''];
$view = ['publication'=>$publication,'pages'=>$pages,'page'=>'rooms','title'=>'TEST room','room'=>$publication['rooms'][0],'table'=>null,'menu_category'=>'','menu_categories'=>[],'effects'=>[],'canonical'=>'','status'=>'ok','demo_widget_visible'=>false];
ob_start(); \YaSite\render_view('layout',$view,$site); $rendered = ob_get_clean();
check(substr_count($rendered,'src="'.$base.'/assets/core/widget.js"') === 1, 'Exactly one common widget');
check(str_contains($rendered,'data-ai-enabled="false"') && str_contains($rendered,'data-requests-enabled="true"'), 'Independent widget gates in rendered HTML');
check(str_contains($rendered,$base.'/assets/core/panorama.mjs') && str_contains($rendered,'data-panorama="panorama_180"') && str_contains($rendered,'data-panorama="panorama_360"') && !str_contains($rendered,'PRIVATE.jpg'), 'Common panorama owner, both public types only');
$business['localization'] = ['version'=>1,'source_language'=>'tr','target_languages'=>['de'],'languages'=>[['code'=>'de','locale'=>'de-DE','nativeName'=>'Deutsch'],['code'=>'fr','locale'=>'fr-FR','nativeName'=>'Français']], 'site_catalog'=>$source,'translations'=>['site_text'=>[$source['id'].':page.home'=>['de'=>['text'=>'TEST translated home']]]]];
$_GET=['lang'=>'de']; $language=\YaSite\language_context($root,$business);
check($language['code']==='de' && $language['messages']['page.home']==='TEST translated home', 'Published target + source hash');
check(array_keys($language['catalogs'])===['tr','de'], 'Only published target languages');
$_GET=['lang'=>'fr']; check(\YaSite\language_context($root,$business)['code']==='tr', 'Unpublished target rejected');
$business['localization']['site_catalog']['entries']['page.home']['hash']='stale'; $_GET=['lang'=>'de'];
check(\YaSite\language_context($root,$business)['messages']['page.home']===$source['entries']['page.home']['text'], 'Stale source hash falls back per key');
$business['business']['requests_enabled']=false;
$closed=\YaSite\project_publication($business,$sources,'/yardimci-asistan','tr');
check(!$closed['features']['chat'] && !$closed['features']['requests'] && !$closed['features']['room_requests'], 'Independent request OFF gate');
echo json_encode(['id'=>$source['id'],'entries'=>count($source['entries']),'source_bytes'=>strlen(json_encode($source,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)),'actual_root'=>true,'ai_off_requests_on'=>true,'published_targets_only'=>true,'panorama_ssr'=>true], JSON_THROW_ON_ERROR).PHP_EOL;
