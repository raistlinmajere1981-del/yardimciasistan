<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
 ?>
<?php if (!empty($view['table'])): ?>
<?php render_view('components/resource-detail', ['record' => $view['table'], 'type' => 'table', 'request_enabled' => $view['publication']['features']['table_requests']], $site); return; ?>
<?php endif; ?>
<?php render_view('components/page-header', ['title' => $view['title'], 'eyebrow' => t($site, 'page.restaurant'), 'lede' => text($view['publication']['description'] ?? '')], $site); ?>
<div class="collection"><?php foreach ($view['publication']['tables'] as $record): ?>
<?php render_view('components/resource-card', ['record' => $record, 'resource_type' => 'table', 'request_enabled' => $view['publication']['features']['table_requests']], $site); ?>
<?php endforeach; ?></div>
