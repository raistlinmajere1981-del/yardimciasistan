<?php
declare(strict_types=1);
namespace YaLanding;

// Labels, examples and platform hints only. Graph edges and profile membership come from shared TS.
function discovery_metadata(): array
{
    return json_decode(<<<'JSON'
{
  "core.customers": {
    "key": "discovery.core.customers",
    "platforms": [
      "desktop",
      "companion",
      "web"
    ],
    "ai": true
  },
  "customer.requests": {
    "key": "discovery.customer.requests",
    "platforms": [
      "desktop",
      "web"
    ]
  },
  "core.tasks": {
    "key": "discovery.core.tasks",
    "platforms": [
      "desktop",
      "companion"
    ]
  },
  "core.calendar": {
    "key": "discovery.core.calendar",
    "platforms": [
      "desktop",
      "companion"
    ]
  },
  "core.notifications": {
    "key": "discovery.core.notifications",
    "platforms": [
      "desktop",
      "companion"
    ]
  },
  "core.finance": {
    "key": "discovery.core.finance",
    "platforms": [
      "desktop",
      "companion"
    ],
    "ai": true
  },
  "core.reports": {
    "key": "discovery.core.reports",
    "platforms": [
      "desktop"
    ],
    "ai": true
  },
  "core.web": {
    "key": "discovery.core.web",
    "platforms": [
      "desktop",
      "web"
    ],
    "ai": true
  },
  "core.sync": {
    "key": "discovery.core.sync",
    "platforms": [
      "desktop",
      "companion"
    ]
  },
  "core.backups": {
    "key": "discovery.core.backups",
    "platforms": [
      "desktop"
    ]
  },
  "core.devices": {
    "key": "discovery.core.devices",
    "platforms": [
      "desktop",
      "companion"
    ]
  },
  "document.printing": {
    "key": "discovery.document.printing",
    "platforms": ["desktop"]
  },
  "commerce.benefits": {
    "key": "discovery.commerce.benefits",
    "platforms": ["desktop", "companion"]
  },
  "service.whatsapp": {
    "key": "discovery.service.whatsapp",
    "platforms": [
      "desktop"
    ],
    "ai": true
  },
  "marketing.studio": {
    "key": "discovery.marketing.studio",
    "platforms": [
      "desktop",
      "web"
    ],
    "ai": true
  },
  "messaging.campaigns": {
    "key": "discovery.messaging.campaigns",
    "platforms": [
      "desktop"
    ],
    "ai": true
  },
  "service.ai": {
    "key": "discovery.service.ai",
    "platforms": [
      "desktop",
      "companion",
      "web"
    ],
    "ai": true
  },
  "service.android": {
    "key": "discovery.service.android",
    "platforms": [
      "desktop",
      "companion"
    ]
  },
  "accommodation.rooms": {
    "key": "discovery.accommodation.rooms",
    "platforms": [
      "desktop",
      "companion",
      "web"
    ]
  },
  "accommodation.reservations": {
    "key": "discovery.accommodation.reservations",
    "platforms": [
      "desktop",
      "companion",
      "web"
    ]
  },
  "accommodation.stays": {
    "key": "discovery.accommodation.stays",
    "platforms": [
      "desktop",
      "companion"
    ]
  },
  "accommodation.folio": {
    "key": "discovery.accommodation.folio",
    "platforms": [
      "desktop",
      "companion"
    ]
  },
  "food_service.tables": {
    "key": "discovery.food_service.tables",
    "platforms": [
      "desktop",
      "companion",
      "web"
    ]
  },
  "food_service.reservations": {
    "key": "discovery.food_service.reservations",
    "platforms": [
      "desktop",
      "companion",
      "web"
    ]
  },
  "food_service.orders": {
    "key": "discovery.food_service.orders",
    "platforms": [
      "desktop",
      "companion"
    ],
    "ai": true
  },
  "food_service.menu": {
    "key": "discovery.food_service.menu",
    "platforms": [
      "desktop",
      "companion",
      "web"
    ]
  },
  "channel.qr_menu": {
    "key": "discovery.channel.qr_menu",
    "platforms": [
      "desktop",
      "web"
    ]
  },
  "commerce.catalog": {
    "key": "discovery.commerce.catalog",
    "platforms": [
      "desktop",
      "companion",
      "web"
    ],
    "ai": true
  },
  "commerce.inventory": {
    "key": "discovery.commerce.inventory",
    "platforms": [
      "desktop",
      "companion"
    ],
    "ai": true
  },
  "commerce.sales": {
    "key": "discovery.commerce.sales",
    "platforms": [
      "desktop",
      "companion"
    ]
  },
  "commerce.orders": {
    "key": "discovery.commerce.orders",
    "platforms": [
      "desktop",
      "companion",
      "web"
    ]
  },
  "channel.online_sales": {
    "key": "discovery.channel.online_sales",
    "platforms": [
      "desktop",
      "web"
    ]
  },
  "commerce.wholesale": {
    "key": "discovery.commerce.wholesale",
    "platforms": [
      "desktop",
      "companion",
      "dealer",
      "web"
    ]
  },
  "commerce.customer_credit": {
    "key": "discovery.commerce.customer_credit",
    "platforms": [
      "desktop",
      "companion"
    ]
  },
  "retail.barcode": {
    "key": "discovery.retail.barcode",
    "platforms": [
      "desktop",
      "companion"
    ]
  },
  "retail.purchasing": {
    "key": "discovery.retail.purchasing",
    "platforms": [
      "desktop",
      "companion"
    ]
  },
  "retail.suppliers": {
    "key": "discovery.retail.suppliers",
    "platforms": [
      "desktop",
      "companion"
    ]
  },
  "retail.labels": {
    "key": "discovery.retail.labels",
    "platforms": [
      "desktop"
    ]
  },
  "integration.whatsappCloud": {
    "key": "discovery.integration.whatsappCloud",
    "platforms": [
      "desktop"
    ]
  },
  "integration.birthday": {
    "key": "discovery.integration.birthday",
    "platforms": [
      "desktop"
    ]
  },
  "integration.sms": {
    "key": "discovery.integration.sms",
    "platforms": [
      "desktop"
    ]
  },
  "integration.instagram": {
    "key": "discovery.integration.instagram",
    "platforms": [
      "desktop"
    ]
  },
  "integration.delivery": {
    "key": "discovery.integration.delivery",
    "platforms": [
      "desktop",
      "web",
      "dealer"
    ]
  },
  "integration.shipping": {
    "key": "discovery.integration.shipping",
    "platforms": [
      "desktop"
    ]
  },
  "integration.dealerPortal": {
    "key": "discovery.integration.dealerPortal",
    "platforms": [
      "desktop",
      "web",
      "dealer"
    ]
  },
  "integration.productData": {
    "key": "discovery.integration.productData",
    "platforms": [
      "desktop",
      "companion"
    ]
  },
  "integration.kbs": {
    "key": "discovery.integration.kbs",
    "platforms": [
      "desktop",
      "companion"
    ]
  },
  "integration.googleReviews": {
    "key": "discovery.integration.googleReviews",
    "platforms": [
      "desktop",
      "web"
    ]
  }
}
JSON, true, 512, JSON_THROW_ON_ERROR);
}

function capability_projection(): array
{
    $path = dirname(__DIR__) . '/assets/assistant/capability-projection.json';
    return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
}

function sector_url(string $sector): string
{
    return discovery_url($sector, discovery_explanation());
}

function icon(string $name): string
{
    $paths = [
        'spark' => '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
        'people' => '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M17 15a5 5 0 0 1 4 5"/>',
        'box' => '<path d="m3 7 9-4 9 4v10l-9 4-9-4Zm0 0 9 4 9-4M12 11v10M7 5l9 4"/>',
        'chart' => '<path d="M4 3v17h17M8 15l4-5 4 2 5-7"/>',
        'message' => '<path d="M21 14a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4ZM7 8h10M7 12h6"/>',
        'language' => '<path d="M3 5h12M9 3v2M5 5c0 6 7 9 7 9M13 5c0 6-7 9-7 9M13 21l4-11 4 11M15 17h4"/>',
        'calendar' => '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18M7 15h3M14 15h3"/>',
        'desktop' => '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
        'phone' => '<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 5h4M11 19h2"/>',
        'web' => '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18"/>',
        'arrow' => '<path d="M4 12h16m-6-6 6 6-6 6"/>',
        'check' => '<path d="m5 12 4 4L19 6"/>',
    ];
    return '<svg class="line-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . ($paths[$name] ?? $paths['spark']) . '</svg>';
}

// These groups describe benefits only; they never grant capability or service access.
function discovery_groups(): array
{
    return [
        'daily' => ['icon' => 'calendar', 'ids' => [
            'core.customers', 'customer.requests', 'core.tasks', 'core.calendar', 'core.notifications',
            'accommodation.rooms', 'accommodation.reservations', 'accommodation.stays',
            'food_service.tables', 'food_service.reservations', 'food_service.menu', 'integration.kbs',
        ]],
        'sales' => ['icon' => 'chart', 'ids' => [
            'core.finance', 'core.reports', 'accommodation.folio', 'food_service.orders',
            'commerce.catalog', 'commerce.inventory', 'commerce.sales', 'commerce.orders',
            'commerce.wholesale', 'commerce.customer_credit', 'commerce.benefits', 'retail.barcode', 'retail.purchasing',
            'retail.suppliers', 'retail.labels', 'integration.productData', 'integration.delivery', 'integration.shipping',
        ]],
        'publish' => ['icon' => 'message', 'ids' => [
            'core.web', 'channel.qr_menu', 'channel.online_sales', 'service.whatsapp', 'marketing.studio',
            'messaging.campaigns', 'integration.whatsappCloud', 'integration.birthday', 'integration.sms',
            'integration.instagram', 'integration.dealerPortal', 'integration.googleReviews',
        ]],
        'system' => ['icon' => 'desktop', 'ids' => [
            'core.sync', 'core.backups', 'core.devices', 'document.printing', 'service.ai', 'service.android',
        ]],
    ];
}

function discovery_explanation(): string
{
    return ($_GET['explanation'] ?? '') === 'detailed' ? 'detailed' : 'simple';
}

function discovery_url(string $sector, string $explanation): string
{
    return '/?' . http_build_query(['sector' => $sector, 'lang' => resolve_language()['code'], 'explanation' => $explanation]) . '#yetenekler';
}

function render_discovery_tree(): void
{
    $projection = capability_projection();
    $metadata = discovery_metadata();
    $nodes = array_column($projection['nodes'], null, 'id');
    $requested = $_GET['sector'] ?? 'pension_restaurant';
    $sector = is_string($requested) && in_array($requested, $projection['sectors'], true) ? $requested : 'pension_restaurant';
    $explanation = discovery_explanation();
    $visible = array_filter($projection['nodes'], fn($node) => ($node['levels'][$sector] ?? null) !== null);
?>
    <nav class="sector-filters" aria-label="<?= e(t('tree.filters')) ?>" data-sector-filters>
      <?php foreach (['pension', 'pension_restaurant', 'restaurant', 'market', 'all'] as $id): ?>
        <a href="<?= e(sector_url($id)) ?>" data-sector="<?= e($id) ?>"<?= $sector === $id ? ' aria-current="true"' : '' ?>><?= e(t('tree.' . $id)) ?></a>
      <?php endforeach; ?>
    </nav>
    <div class="explanation-toolbar">
      <nav class="explanation-selector" aria-label="<?= e(t('tree.mode_label')) ?>" data-explanation-selector>
        <?php foreach (['simple', 'detailed'] as $mode): ?><a href="<?= e(discovery_url($sector, $mode)) ?>" data-explanation="<?= e($mode) ?>"<?= $mode === $explanation ? ' aria-current="true"' : '' ?>><?= icon($mode === 'simple' ? 'spark' : 'box') ?><?= e(t('tree.' . $mode)) ?></a><?php endforeach; ?>
      </nav>
      <p data-explanation-hint data-simple-hint="<?= e(t('tree.simple_hint')) ?>" data-detailed-hint="<?= e(t('tree.detailed_hint')) ?>"><?= e(t('tree.' . $explanation . '_hint')) ?></p>
    </div>
    <div class="tree-toolbar"><p role="status" data-tree-count data-count-template="<?= e(t('tree.count')) ?>"><?= e(t('tree.count', ['count' => count($visible)])) ?></p><span><?= e(t('tree.details')) ?></span></div>
    <div class="capability-tree" data-capability-tree data-explanation-mode="<?= e($explanation) ?>">
      <?php foreach (discovery_groups() as $group => $groupMeta):
        $groupVisible = array_filter($groupMeta['ids'], fn($id) => ($nodes[$id]['levels'][$sector] ?? null) !== null);
      ?>
      <section class="tree-level" data-tree-group="<?= e($group) ?>" aria-labelledby="tree-<?= e($group) ?>"<?= !$groupVisible ? ' hidden' : '' ?>>
        <div class="tree-level-heading"><span class="group-symbol" aria-hidden="true"><?= icon($groupMeta['icon']) ?></span><div><h3 id="tree-<?= e($group) ?>"><?= e(t('tree.group.' . $group)) ?></h3><p><?= e(t('tree.group.' . $group . '_desc')) ?></p></div></div>
        <div class="capability-grid">
        <?php foreach ($groupMeta['ids'] as $id):
          $node = $nodes[$id];
          $current = $node['levels'][$sector] ?? null;
          $meta = $metadata[$id];
          $key = $meta['key'];
          $service = in_array('services', $node['levels'], true);
          $cardIcon = match ($id) {
              'core.customers', 'customer.requests', 'accommodation.stays', 'integration.kbs', 'retail.suppliers', 'commerce.wholesale' => 'people',
              'core.tasks', 'core.backups' => 'check',
              'core.notifications' => 'message',
              'core.devices', 'service.android' => 'phone',
              'service.ai', 'marketing.studio' => 'spark',
              'core.web', 'channel.qr_menu', 'channel.online_sales', 'integration.dealerPortal', 'integration.googleReviews' => 'web',
              'core.sync' => 'arrow',
              'commerce.catalog', 'commerce.inventory', 'retail.purchasing', 'retail.labels', 'integration.productData' => 'box',
              default => $groupMeta['icon'],
          };
        ?>
          <details class="capability-card" id="cap-<?= e($id) ?>" data-capability="<?= e($id) ?>" data-levels="<?= e(json_encode($node['levels'])) ?>"<?= $current === null ? ' hidden' : '' ?><?= $explanation === 'detailed' ? ' open' : '' ?>>
            <summary>
              <span class="capability-heading"><span class="card-symbol"><?= icon($cardIcon) ?></span><strong><?= e(t($key . '.title')) ?></strong></span>
              <span class="capability-benefit"><?= e(t($key . '.benefit')) ?></span>
              <span class="capability-badges"><?php foreach ($meta['platforms'] as $platform): ?><span><?= e(t('platform.' . $platform)) ?></span><?php endforeach; ?><?php if ($meta['ai'] ?? false): ?><span class="ai-mark"><?= icon('spark') ?><?= e(t('tree.ai_badge')) ?></span><?php endif; ?><?php if ($service): ?><span><?= e(t('tree.setup')) ?></span><?php endif; ?></span>
              <span class="card-detail-action"><span class="detail-more"><?= e(t('tree.more')) ?></span><span class="detail-less"><?= e(t('tree.less')) ?></span><span class="detail-plus" aria-hidden="true">+</span></span>
            </summary>
            <div class="capability-detail">
              <p><?= e(t($key . '.body')) ?></p>
              <dl><dt><?= e(t('tree.where')) ?></dt><dd class="platform-tags"><?php foreach ($meta['platforms'] as $platform): ?><span><?= e(t('platform.' . $platform)) ?></span><?php endforeach; ?></dd>
              <dt><?= e(t('tree.ai')) ?></dt><dd><?= e(t(($meta['ai'] ?? false) ? $key . '.ai' : 'tree.no_ai')) ?><?php if ($meta['ai'] ?? false): ?><small><?= e(t('tree.ai_note')) ?></small><?php endif; ?></dd>
              <dt><?= e(t(!empty($node['owners']) ? 'tree.owners' : 'tree.needs')) ?></dt><dd>
              <?php $dependencies = !empty($node['owners']) ? $node['owners'] : $node['dependencies']; if (!$dependencies): ?><?= e(t('tree.no_needs')) ?><?php endif; ?>
              <?php foreach ($dependencies as $dependency): ?><a class="dependency-link" href="#cap-<?= e($dependency) ?>"<?= ($nodes[$dependency]['levels'][$sector] ?? null) === null ? ' hidden' : '' ?>><?= e(t($metadata[$dependency]['key'] . '.title')) ?></a><span class="dependency-unavailable" data-dependency="<?= e($dependency) ?>"<?= ($nodes[$dependency]['levels'][$sector] ?? null) !== null ? ' hidden' : '' ?>><?= e(t($metadata[$dependency]['key'] . '.title')) ?></span><?php endforeach; ?>
              </dd></dl>
              <?php if ($service): ?><small><?= e(t('tree.service_note')) ?></small><?php endif; ?>
            </div>
          </details>
        <?php endforeach; ?>
        </div>
      </section>
      <?php endforeach; ?>
    </div>
    <p class="section-footnote"><?= e(t('tree.explanation')) ?></p>
<?php
}
