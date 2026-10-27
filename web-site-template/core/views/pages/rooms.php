<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
 ?>
<?php if (!empty($view['room'])) { render_view('components/room-detail', $view, $site); return; } ?>
<h1><?= e($view['title']) ?></h1>
<div class="collection"><?php foreach ($view['publication']['rooms'] as $record) render_view('components/resource-card', ['record' => $record, 'rooms' => $view['publication']['rooms']], $site); ?></div>
