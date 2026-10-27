<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
$record = $view['room']; ?>
<p><a href="<?= e(page_url($site, 'rooms')) ?>"><?= e(t($site, 'page.rooms')) ?></a></p>
<h1><?= e($record['name']) ?></h1>
<?php render_view('components/resource-card', ['record' => $record, 'detail' => true], $site); ?>
<?php render_view('components/resource-features', ['record'=>$record,'type'=>'room'], $site); ?>
<?php render_view('components/resource-media', ['record'=>$record], $site); ?>
<?php if ($view['publication']['features']['room_requests']): ?><button class="button" data-ya-action="accommodation.reserve" data-ya-resource-type="room" data-ya-resource-id="<?= e($record['id']) ?>" data-ya-resource-name="<?= e($record['name']) ?>"><?= e(t($site, 'room.reserve')) ?></button><?php endif; ?>
