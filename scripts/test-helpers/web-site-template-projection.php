<?php
declare(strict_types=1);
require_once $argv[1] . '/core/bootstrap.php';

function check(bool $value, string $message): void { if (!$value) throw new RuntimeException($message); }
$business = ['ok' => true, 'business' => ['id' => 'b', 'display_name' => 'Published identity', 'profile_id' => 'pension_restaurant', 'public_surfaces' => []]];
$sources = [
    'rooms' => ['data' => ['ok' => true, 'enabled' => true, 'rooms' => [['id' => 'r', 'name' => 'Hidden room']]]],
    'catalog' => ['data' => ['ok' => true, 'enabled' => true, 'products' => [['product_id' => 'p', 'name' => 'Hidden product']]]],
    'menu' => ['data' => ['ok' => true, 'categories' => [['id' => 'c', 'name' => 'Hidden category']], 'items' => [['id' => 'm', 'name' => 'Hidden menu', 'category_id' => 'c']]]],
];
$project = \YaSite\project_publication($business, $sources, '/yardimci-asistan', 'tr');
check($project['rooms'] === [] && $project['products'] === [] && $project['menu'] === [], 'Profile or records cannot grant a public surface');
$business['business']['profile_id'] = 'market';
$business['business']['public_surfaces'] = ['rooms', 'store', 'qr_menu'];
$sources['rooms']['data']['rooms'][] = ['id' => 'inactive', 'name' => 'Inactive room', 'is_active' => false];
$sources['catalog']['data']['products'][] = ['product_id' => 'unpublished', 'name' => 'Unpublished', 'published' => false];
$sources['menu']['data']['items'][] = ['id' => 'orphan', 'name' => 'Orphan', 'category_id' => 'missing'];
$project = \YaSite\project_publication($business, $sources, '/yardimci-asistan', 'tr');
check(count($project['rooms']) === 1 && count($project['products']) === 1 && count($project['menu']) === 1, 'Explicit record gates and menu category relation');
check(!$project['features']['orders'], 'Catalog visibility does not activate ordering');
check($project['features']['availability'] && !$project['features']['requests'], 'Reading availability does not require creating a customer request');
$sources['account/config'] = ['data' => ['ok' => true, 'enabled' => true]];
$accountProject = \YaSite\project_publication($business, $sources, '/yardimci-asistan', 'tr');
check(isset(\YaSite\available_pages($accountProject, [])['account']) && !$accountProject['features']['orders'], 'Account availability does not depend on delivery');
$sources['catalog']['data']['products'] = [];
$accountProject = \YaSite\project_publication($business, $sources, '/yardimci-asistan', 'tr');
check(isset(\YaSite\available_pages($accountProject, [])['account']), 'Account remains available when the last product is withdrawn');
$sources['account/config']['data']['enabled'] = false;
$accountProject = \YaSite\project_publication($business, $sources, '/yardimci-asistan', 'tr');
check(!isset(\YaSite\available_pages($accountProject, ['account_enabled' => true])['account']), 'Site configuration cannot grant a disabled account');
$sources['catalog']['data']['products'] = [['product_id' => 'p', 'name' => 'Published product']];
$business['business']['requests_enabled'] = true;
$business['business']['request_types'] = ['general_info'];
$requestProject = \YaSite\project_publication($business, $sources, '/yardimci-asistan', 'tr');
check($requestProject['features']['requests'] && !$requestProject['features']['room_requests'], 'General requests do not grant room reservation requests');
$business['business']['request_types'][] = 'pension_reservation';
$requestProject = \YaSite\project_publication($business, $sources, '/yardimci-asistan', 'tr');
check($requestProject['features']['room_requests'], 'Explicit reservation availability enables the published room CTA');
$business['business']['requests_enabled'] = false;
$requestProject = \YaSite\project_publication($business, $sources, '/yardimci-asistan', 'tr');
check(!$requestProject['features']['room_requests'], 'Withdrawn global requests deny stale request types');
$sources['rooms']['data']['enabled'] = false;
$sources['catalog']['data']['enabled'] = false;
$sources['menu']['data']['enabled'] = false;
$project = \YaSite\project_publication($business, $sources, '/yardimci-asistan', 'tr');
check($project['rooms'] === [] && $project['products'] === [] && $project['menu'] === [], 'Disabled publication hides stale records');
$project = \YaSite\project_publication([], $sources, '/yardimci-asistan', 'tr');
check(count(\YaSite\available_pages($project, [])) === 1, 'No business response means only home');
foreach (['javascript:alert(1)', 'data:image/svg+xml,unsafe', '//foreign.test/image.png', '/private.png', '/yardimci-asistan/media/../config/business.json', '/yardimci-asistan/media/%2e%2e/config/business.json', '/yardimci-asistan/media/photo%0a.png'] as $url) {
    check(\YaSite\media_url($url, '/yardimci-asistan') === '', 'Unsafe media URL');
}
check(\YaSite\media_url('/yardimci-asistan/media/gallery/gallery/my%20photo.png', '/yardimci-asistan') !== '', 'Valid percent-encoded public media reference');

// Map visualization follows published mapDisplayMode; no fixed maps or fallback coordinates.
$manualMap = \YaSite\contact_projection(['mapDisplayMode'=>'manual', 'latitude'=>40.16296, 'longitude'=>32.783079]);
check($manualMap['mapProvider'] === 'osm' && str_starts_with($manualMap['embed'], 'https://www.openstreetmap.org/export/embed.html?')
    && str_contains($manualMap['embed'], 'marker=40.16296%2C32.783079')
    && str_contains($manualMap['map'], 'destination=40.16296%2C32.783079')
    && $manualMap['available'], 'Manual map published by Desktop renders embeddable OSM and directions');
foreach ([['latitude'=>null,'longitude'=>32.7], ['latitude'=>91,'longitude'=>32.7], ['latitude'=>40.1,'longitude'=>INF],
          ['latitude'=>'','longitude'=>32.7]] as $invalid) {
    $hidden = \YaSite\contact_projection($invalid + ['mapDisplayMode'=>'manual']);
    check($hidden['embed'] === '' && $hidden['map'] === '' && !$hidden['available'], 'Missing/invalid coordinate hides map');
}
$mapGoogle = \YaSite\contact_projection(['mapDisplayMode'=>'google_maps_embed', 'googleMapsEmbedUrl'=>'https://www.google.com/maps/embed?pb=valid']);
check($mapGoogle['mapProvider']==='google' && $mapGoogle['available'], 'Google embed mode renders validated map');
check($mapGoogle['map'] === $mapGoogle['embed'], 'An embed-only publication retains a safe open-map link');
foreach (['https://evil.example/maps/embed?pb=x','https://www.google.com/maps/search?q=x',
          'javascript:alert(1)', 'https://www.google.com/maps/embed'] as $unsafe) {
    $hidden=\YaSite\contact_projection(['mapDisplayMode'=>'google_maps_embed','googleMapsEmbedUrl'=>$unsafe]);
    check($hidden['embed']==='' && !$hidden['available'], 'Untrusted Google embeds are blocked');
}
check(\YaSite\contact_projection(['mapDisplayMode'=>'google_maps_embed','latitude'=>40.1,'longitude'=>32.7])['embed']==='', 'No manual fallback when Google mode selected');

$payload = ['localization' => ['version' => 1, 'source_language' => 'tr', 'target_languages' => ['de'], 'translations' => ['room' => ['r' => ['de' => ['name' => 'Translated field']]]]]];
check(\YaSite\localized_field($payload, 'room', 'r', 'name', 'Source field', 'de') === 'Translated field', 'Language contract is not hardcoded to English');
check(\YaSite\localized_field($payload, 'room', 'r', 'description', 'Source field', 'de') === 'Source field', 'Per-field source fallback');
check(\YaSite\localized_field($payload, 'room', 'r', 'name', 'Source field', 'fr') === 'Source field', 'Unpublished translation target');
$project['about'] = 'Published description';
$project['rooms'] = [['id' => 'r', 'name' => 'Published room']];
$pages = \YaSite\available_pages($project, ['page_order' => ['rooms', 'unknown', 'about'], 'hidden_pages' => ['rooms']]);
check(array_keys($pages) === ['home', 'about'], 'Site can restrict and order; cannot add unknown/unavailable routes');
$extensionRoot = sys_get_temp_dir() . '/ya-extension-' . bin2hex(random_bytes(6));
mkdir($extensionRoot . '/site/views/pages', 0777, true);
file_put_contents($extensionRoot . '/site/views/pages/guide.php', '<?php echo "Editorial";');
$extensions = ['guide'=>['key'=>'theme.guide','editorial'=>true], 'rooms'=>['key'=>'theme.bad','editorial'=>true], '../escape'=>['key'=>'theme.bad','editorial'=>true], 'absent'=>['key'=>'theme.bad','editorial'=>true]];
$pages = \YaSite\available_pages(\YaSite\project_publication([], [], '/yardimci-asistan', 'tr'), ['extensions'=>$extensions], $extensionRoot);
check(array_keys($pages) === ['home','guide'], 'Only present site-owned editorial extensions, no publication override or path traversal');
check(array_keys(\YaSite\available_pages($project, ['extensions'=>$extensions, 'hidden_pages'=>['guide','rooms','about']], $extensionRoot)) === ['home'], 'Editorial extension respects hidden pages');
unlink($extensionRoot . '/site/views/pages/guide.php'); rmdir($extensionRoot . '/site/views/pages'); rmdir($extensionRoot . '/site/views'); rmdir($extensionRoot . '/site'); rmdir($extensionRoot);


// SEO provenance: a public bootstrap label is not a published business identity.
$seoBusiness = ['ok'=>true, 'business'=>['display_name'=>'Bootstrap fallback', 'address'=>'Unpublished config address', 'public_surfaces'=>[]]];
$seoSite = ['public_origin'=>'https://projection.example.test', 'base_path'=>'', 'module_path'=>'/yardimci-asistan', 'language'=>['code'=>'tr']];
$seoView = ['page'=>'home', 'title'=>'Home', 'canonical'=>'https://projection.example.test/?page=home&lang=tr'];
$seoView['publication'] = \YaSite\project_publication($seoBusiness, [], '/yardimci-asistan', 'tr');
check(\YaSite\structured_data($seoSite, $seoView) === [], 'Bootstrap/config identity must not become structured business data');
$seoBusiness['business_publication'] = ['enabled'=>true, 'fields'=>['business_name']];
$seoView['publication'] = \YaSite\project_publication($seoBusiness, [], '/yardimci-asistan', 'tr');
$seoJson = \YaSite\json_html(\YaSite\structured_data($seoSite, $seoView));
check(str_contains($seoJson, 'Bootstrap fallback') && !str_contains($seoJson, 'Unpublished config address'), 'Only explicitly published business fields enter structured data');
$seoBusiness['business_publication']['fields'] = 'malformed';
$seoView['publication'] = \YaSite\project_publication($seoBusiness, [], '/yardimci-asistan', 'tr');
check(\YaSite\structured_data($seoSite, $seoView) === [], 'Malformed provenance is closed');
echo "template-projection-ok\n";
