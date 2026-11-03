<?php declare(strict_types=1); namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }
render_view('components/resource-detail', [
    'record' => $view['room'],
    'type' => 'room',
    'request_enabled' => $view['publication']['features']['room_requests']
], $site);
