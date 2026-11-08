<?php
declare(strict_types=1);
namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

$visitor = ($_GET['view'] ?? '') === 'visitor';
$available = array_diff(array_keys(array_filter($view['pages'], static fn (array $page): bool => empty($page['internal']))), ['home']);
$catalog = [
  'about' => 'HK', 'rooms' => 'OD', 'restaurant' => 'MS',
  'menu' => 'QR', 'catalog' => 'ÜR', 'gallery' => 'GA',
  'announcements' => 'DU', 'reviews' => 'YO', 'contact' => 'İL',
  'account' => 'HS',
];
$status = $view['status'];
?>
<?php if ($visitor): ?>
  <?php render_view('components/hero', $view, $site); ?>
  <figure class="lab-visitor-landscape">
    <img src="<?= e(asset($site, 'site/img/gol-yansima.jpg')) ?>" width="1280" height="853" alt="Göl ve dağların su yüzeyindeki yansıması" decoding="async" fetchpriority="high">
    <figcaption>STATİK SAHNE / YANSIMA · <a href="https://commons.wikimedia.org/wiki/File:Lake_Mountain_Landscape.jpg" rel="noopener noreferrer" target="_blank">Bonnie Moreland · CC0</a></figcaption>
  </figure>
  <div class="lab-visitor-note">
    <span><?= e(t($site, 'lab.visitor')) ?></span>
    <p><?= e(t($site, 'lab.visitor_note')) ?></p>
    <a href="<?= e(page_url($site, 'home')) ?>"><?= e(t($site, 'lab.return')) ?></a>
  </div>
  <?php if (!$available): $key = $status === 'ok' ? 'empty' : 'unavailable'; ?>
    <section class="empty-state" role="status">
      <h2><?= e(t($site, 'state.' . $key . '.title')) ?></h2>
      <p><?= e(t($site, 'state.' . $key . '.text')) ?></p>
    </section>
  <?php else: ?>
    <div class="page-grid">
      <?php foreach ($view['pages'] as $id => $page): if ($id === 'home' || !empty($page['internal'])) continue; ?>
      <a class="page-link" href="<?= e(page_url($site, $id) . '&view=visitor') ?>"><?= e(t($site, $page['key'])) ?></a>
      <?php endforeach; ?>
    </div>
  <?php endif; ?>
<?php else: ?>
  <section class="lab-hero" aria-labelledby="lab-title">
    <div class="lab-hero-main">
      <p class="lab-eyebrow"><span class="lab-pulse" aria-hidden="true"></span><?= e(t($site, 'lab.test')) ?></p>
      <h1 id="lab-title"><?= e(t($site, 'lab.title')) ?></h1>
      <p class="lab-lead"><?= e(t($site, 'lab.lead')) ?></p>
      <div class="lab-status" role="status">
        <span class="lab-status-indicator <?= $status === 'ok' ? 'is-ready' : 'is-offline' ?>" aria-hidden="true"></span>
        <strong><?= e(t($site, $status !== 'ok' ? 'lab.unavailable' : ($available ? 'lab.live' : 'lab.empty'))) ?></strong>
        <?php if ($status === 'ok'): ?><span class="lab-status-count"><?= e(number_text($site, count($available))) ?> <?= e(t($site, 'lab.sections')) ?></span><?php endif; ?>
      </div>
    </div>
    <div class="lab-flow" aria-hidden="true">
      <div class="lab-flow-node"><span>01</span><strong>Desktop</strong></div>
      <div class="lab-flow-arrow">→</div>
      <div class="lab-flow-node"><span>02</span><strong>Web</strong></div>
      <div class="lab-flow-arrow">→</div>
      <div class="lab-flow-node"><span>03</span><strong>Test</strong></div>
    </div>
  </section>

  <section class="lab-scene-showcase" aria-label="Sabit görsel sahneleri">
    <div class="lab-scene-heading">
      <div><span class="lab-scene-kicker">TASARIM ATÖLYESİ / ÖNİZLEME</span>
      <h2>Üç sahne, üç farklı atmosfer.</h2></div>
      <p>Sabit sayfa fotoğrafları. Henüz efekt uygulanmadı; daha sonra dalga, ışık ve yansıma çalışmalarını göstereceğiz.</p>
    </div>
    <div class="lab-scene-grid">
      <figure class="lab-scene-card">
        <div class="lab-scene-media"><img src="<?= e(asset($site, 'site/img/kiyi-dalga.jpg')) ?>" width="1280" height="574" loading="lazy" decoding="async" alt="Ufuk çizgisinde dalgalanan kıyı ve deniz"></div>
        <figcaption><span>01 / SU YÜZEYİ</span><strong>Dalga hareketleri</strong>
        <small><a href="https://commons.wikimedia.org/wiki/File:Coastal_Waves_%26_Horizon.jpg" target="_blank" rel="noopener noreferrer">Rubini Manikandan · CC BY-SA 4.0</a></small></figcaption>
      </figure>
      <figure class="lab-scene-card">
        <div class="lab-scene-media"><img src="<?= e(asset($site, 'site/img/orman-isik.jpg')) ?>" width="1280" height="669" loading="lazy" decoding="async" alt="Ağaçların arasından süzülen güneş ışınları"></div>
        <figcaption><span>02 / IŞIK</span><strong>Güneş ve atmosfer</strong>
        <small><a href="https://commons.wikimedia.org/wiki/File:Sunbeams_through_the_forest.jpg" target="_blank" rel="noopener noreferrer">CLAUDIA DEA · CC BY 2.0</a></small></figcaption>
      </figure>
      <figure class="lab-scene-card">
        <div class="lab-scene-media"><img src="<?= e(asset($site, 'site/img/gol-yansima.jpg')) ?>" width="1280" height="853" loading="lazy" decoding="async" alt="Dağ gölünün durgun yüzeyinde yansıyan manzara"></div>
        <figcaption><span>03 / YANSIMA</span><strong>Durgun göl yüzeyi</strong>
        <small><a href="https://commons.wikimedia.org/wiki/File:Lake_Mountain_Landscape.jpg" target="_blank" rel="noopener noreferrer">Bonnie Moreland · CC0</a></small></figcaption>
      </figure>
    </div>
    <p class="lab-scene-warning">Görseller tasarım denemesidir; işletmenin fotoğrafları veya yayınlanmış efekt sahneleri değildir.</p>
  </section>

  <section class="lab-workspace" aria-label="<?= e(t($site, 'lab.title')) ?>">
    <div class="lab-toolbar">
      <div class="lab-tabs" role="tablist" aria-label="<?= e(t($site, 'lab.title')) ?>">
        <button type="button" role="tab" id="lab-tab-live" aria-selected="true" aria-controls="lab-panel-live" data-lab-tab="live"><?= e(t($site, 'lab.live_tab')) ?></button>
        <button type="button" role="tab" id="lab-tab-examples" aria-selected="false" aria-controls="lab-panel-examples" data-lab-tab="examples"><?= e(t($site, 'lab.example_tab')) ?></button>
      </div>
      <a class="lab-visitor-link" href="<?= e(page_url($site, 'home')) ?>&view=visitor"><?= e(t($site, 'lab.visitor')) ?><span aria-hidden="true">↗</span></a>
    </div>
    <div id="lab-panel-live" class="lab-panel" role="tabpanel" aria-labelledby="lab-tab-live" data-lab-panel="live">
      <div class="lab-panel-intro"><h2><?= e(t($site, 'lab.live_tab')) ?></h2><p><?= e(t($site, 'lab.live_note')) ?></p></div>
      <?php if ($status !== 'ok' || !$available): $key = $status === 'ok' ? 'empty' : 'unavailable'; ?>
      <section class="empty-state" role="status">
        <h2><?= e(t($site, 'state.' . $key . '.title')) ?></h2>
        <p><?= e(t($site, 'state.' . $key . '.text')) ?></p>
      </section>
      <?php else: ?>
      <div class="page-grid lab-live-grid">
        <?php foreach ($view['pages'] as $id => $page): if ($id === 'home' || !empty($page['internal'])) continue; ?>
          <a class="page-link lab-live-card" href="<?= e(page_url($site, $id)) ?>">
            <span class="lab-card-symbol" aria-hidden="true"><?= e($catalog[$id] ?? '•') ?></span>
            <span class="lab-card-text"><strong><?= e(t($site, $page['key'])) ?></strong><small><?= e(t($site, 'lab.live_card')) ?></small></span>
            <span class="lab-card-arrow" aria-hidden="true">↗</span>
          </a>
        <?php endforeach; ?>
      </div>
      <?php endif; ?>
    </div>
    <div id="lab-panel-examples" class="lab-panel" role="tabpanel" aria-labelledby="lab-tab-examples" data-lab-panel="examples" hidden>
      <div class="lab-panel-intro"><h2><?= e(t($site, 'lab.example_tab')) ?></h2><p><?= e(t($site, 'lab.examples_note')) ?></p></div>
      <?php if ($status !== 'ok'): ?>
        <section class="empty-state" role="status"><h2><?= e(t($site, 'state.unavailable.title')) ?></h2><p><?= e(t($site, 'state.unavailable.text')) ?></p></section>
      <?php else: ?>
      <div class="lab-example-grid">
        <?php foreach ($catalog as $id => $symbol):
          if (isset($view['pages'][$id])) continue;
          $registered = page_registry()[$id] ?? null;
          if ($registered === null) continue;
        ?>
          <article class="lab-example-card">
            <div class="lab-preview-image" aria-hidden="true">
              <span class="lab-preview-label"><?= e($symbol) ?></span>
              <span class="lab-preview-line"></span>
              <span class="lab-preview-line short"></span>
              <span class="lab-preview-blocks"><i></i><i></i><i></i></span>
            </div>
            <div class="lab-example-body">
              <span class="lab-example-tag"><?= e(t($site, 'lab.sample_tag')) ?></span>
              <h3><?= e(t($site, $registered['key'])) ?></h3>
              <p><?= e(t($site, 'lab.example.' . $id)) ?></p>
            </div>
          </article>
        <?php endforeach; ?>
      </div>
      <?php endif; ?>
      <?php if (count($available) === count($catalog)): ?><p class="lab-complete"><?= e(t($site, 'lab.all_live')) ?></p><?php endif; ?>
    </div>
  </section>
  <p class="lab-disclaimer"><?= e(t($site, 'lab.disclaimer')) ?></p>
<?php endif; ?>
