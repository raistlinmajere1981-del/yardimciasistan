<?php
declare(strict_types=1);

namespace YaLanding;

// Editorial presentation only. Workflow definitions never enable capabilities or create operations.
function scenario_definitions(): array
{
    return [
        'pension_request' => ['status' => 'setup', 'steps' => ['customer.requests', 'accommodation.reservations', 'accommodation.stays', 'accommodation.folio']],
        'pension_walkin' => ['status' => 'standard', 'steps' => ['accommodation.reservations', 'accommodation.stays', 'accommodation.folio', 'core.finance']],
        'pension_folio' => ['status' => 'setup', 'steps' => ['food_service.orders', 'accommodation.folio', 'core.finance']],
        'pension_language' => ['status' => 'setup', 'steps' => ['core.web', 'core.sync']],
        'pension_android' => ['status' => 'setup', 'steps' => ['core.devices', 'service.android', 'accommodation.folio']],
        'rest_table' => ['status' => 'standard', 'steps' => ['food_service.tables', 'food_service.orders', 'commerce.sales', 'core.finance']],
        'rest_qr' => ['status' => 'setup', 'steps' => ['food_service.menu', 'channel.qr_menu', 'core.web']],
        'rest_booking' => ['status' => 'setup', 'steps' => ['customer.requests', 'food_service.reservations']],
        'rest_benefit' => ['status' => 'setup', 'steps' => ['food_service.orders', 'commerce.benefits']],
        'rest_receipt' => ['status' => 'setup', 'steps' => ['commerce.sales', 'document.printing']],
        'market_sale' => ['status' => 'standard', 'steps' => ['retail.barcode', 'commerce.sales', 'commerce.inventory']],
        'market_purchasing' => ['status' => 'setup', 'steps' => ['retail.purchasing', 'commerce.inventory', 'retail.labels']],
        'market_credit' => ['status' => 'setup', 'steps' => ['commerce.sales', 'commerce.customer_credit', 'core.finance']],
        'market_online' => ['status' => 'local', 'steps' => ['channel.online_sales', 'commerce.orders', 'core.web']],
        'dealer_portal' => ['status' => 'setup', 'steps' => ['commerce.wholesale', 'integration.dealerPortal', 'commerce.orders']],
    ];
}

function scenario_sectors(): array
{
    return [
        'pension' => ['pension_request', 'pension_walkin', 'pension_language', 'pension_android'],
        'pension_restaurant' => ['pension_request', 'pension_folio', 'rest_table', 'rest_qr', 'rest_benefit'],
        'restaurant' => ['rest_table', 'rest_qr', 'rest_booking', 'rest_benefit', 'rest_receipt'],
        'market' => ['market_sale', 'market_purchasing', 'market_credit', 'market_online', 'dealer_portal'],
        'all' => ['pension_request', 'rest_table', 'market_sale', 'dealer_portal'],
    ];
}

function render_scenarios(): void
{
    $definitions = scenario_definitions();
    $sectors = scenario_sectors();
    $metadata = discovery_metadata();
    $requested = $_GET['sector'] ?? 'pension_restaurant';
    $selected = is_string($requested) && isset($sectors[$requested]) ? $requested : 'pension_restaurant';
    $explanation = discovery_explanation();
    ?>
    <div class="scenario-shell" data-scenario-gallery>
      <nav class="scenario-filters" aria-label="<?= e(t('scenario.sectors')) ?>" data-scenario-filters>
        <?php foreach (['pension', 'pension_restaurant', 'restaurant', 'market', 'all'] as $sector):
          $href = '/?' . http_build_query(['sector' => $sector, 'lang' => resolve_language()['code'], 'explanation' => $explanation]) . '#is-akislari'; ?>
          <a href="<?= e($href) ?>" data-scenario-sector="<?= e($sector) ?>"<?= $selected === $sector ? ' aria-current="true"' : '' ?>><?= e(t('tree.' . $sector)) ?></a>
        <?php endforeach; ?>
      </nav>
      <?php foreach ($sectors as $sector => $scenarioIds): ?>
      <div class="scenario-pane" data-scenario-pane="<?= e($sector) ?>"<?= $selected !== $sector ? ' hidden' : '' ?>>
        <div class="scenario-grid">
        <?php foreach ($scenarioIds as $index => $scenarioId):
          $scenario = $definitions[$scenarioId];
          ?>
          <article class="scenario-card" data-scenario-id="<?= e($scenarioId) ?>">
            <div class="scenario-card-top">
              <span class="scenario-number" aria-hidden="true"><?= str_pad((string)($index + 1), 2, '0', STR_PAD_LEFT) ?></span>
              <span class="scenario-status" data-scenario-status="<?= e($scenario['status']) ?>"><?= e(t('scenario.status.' . $scenario['status'])) ?></span>
            </div>
            <h3><?= e(t('scenario.' . $scenarioId . '.title')) ?></h3>
            <p><?= e(t('scenario.' . $scenarioId . '.body')) ?></p>
            <div class="scenario-steps" aria-label="<?= e(t('scenario.steps')) ?>">
              <?php foreach ($scenario['steps'] as $stepIndex => $capability):
                $name = $metadata[$capability]['key'] . '.title'; ?>
                <?php if ($stepIndex > 0): ?><span class="scenario-arrow" aria-hidden="true">›</span><?php endif; ?>
                <a href="#cap-<?= e($capability) ?>" data-scenario-step="<?= e($capability) ?>"><?= e(t($name)) ?></a>
              <?php endforeach; ?>
            </div>
          </article>
        <?php endforeach; ?>
        </div>
      </div>
      <?php endforeach; ?>
      <div class="scenario-outro">
        <p><?= e(t('scenario.note')) ?></p>
        <a href="#yetenekler"><?= e(t('scenario.capabilities')) ?> <?= icon('arrow') ?></a>
        <a href="/deneme/" target="_blank" rel="noopener noreferrer"><?= e(t('scenario.demo')) ?> <?= icon('arrow') ?></a>
      </div>
    </div>
    <?php
}
