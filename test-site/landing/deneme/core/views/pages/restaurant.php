<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
 ?>
<?php if (!empty($view['table'])): ?>
<p><a href="<?= e(page_url($site, 'restaurant')) ?>"><?= e(t($site, 'page.restaurant')) ?></a></p>
<h1><?= e($view['table']['name']) ?></h1>
<?php render_view('components/resource-card', ['record'=>$view['table'], 'resource_type'=>'table', 'detail'=>true, 'request_enabled'=>$view['publication']['features']['table_requests']], $site); return; ?>
<?php endif; ?>
<h1><?= e($view['title']) ?></h1>
<div class="collection"><?php foreach ($view['publication']['tables'] as $record): ?>
<?php render_view('components/resource-card', ['record' => $record, 'resource_type'=>'table', 'request_enabled'=>$view['publication']['features']['table_requests']], $site); ?>
<?php endforeach; ?></div>
