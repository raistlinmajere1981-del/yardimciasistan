<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
 ?>
<?php if (!empty($view['room'])) { render_view('components/room-detail', $view, $site); return; } ?>
<?php render_view('components/page-header', ['title' => $view['title'], 'eyebrow' => t($site, 'page.rooms'), 'lede' => text($view['publication']['description'] ?? '')], $site); ?>
<div class="collection"><?php foreach ($view['publication']['rooms'] as $record) render_view('components/resource-card', ['record' => $record, 'rooms' => $view['publication']['rooms'], 'resource_type' => 'room', 'request_enabled' => $view['publication']['features']['room_requests']], $site); ?></div>
