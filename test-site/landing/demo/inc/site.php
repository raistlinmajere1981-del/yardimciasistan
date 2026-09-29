<?php
declare(strict_types=1);
const DEMO_SITE_NAME = 'Yardımcı Asistan Canlı Demo';
function demo_url(string $path = ''): string { return '/demo/' . ltrim($path, '/'); }
function demo_asset(string $path): string { $relative=ltrim($path,'/'); $file=dirname(__DIR__).'/assets/'.$relative; $url=demo_url('assets/'.$relative); return is_file($file)?$url.'?v='.filemtime($file):$url; }
function demo_current_path(): string { $path=parse_url($_SERVER['REQUEST_URI']??'/demo/',PHP_URL_PATH)?:'/demo/'; return '/'.ltrim($path,'/'); }
function demo_is_current(string $prefix): bool { return str_starts_with(demo_current_path(), demo_url($prefix)); }
function demo_e(string $value): string { return htmlspecialchars($value, ENT_QUOTES|ENT_SUBSTITUTE, 'UTF-8'); }
function render_demo_hero(string $eyebrow,string $title,string $description=''): void { ?>
<section class="demo-page-hero"><div class="shell"><p class="eyebrow"><?= demo_e($eyebrow) ?></p><h1><?= demo_e($title) ?></h1><?php if($description!==''): ?><p><?= demo_e($description) ?></p><?php endif; ?></div></section>
<?php }
