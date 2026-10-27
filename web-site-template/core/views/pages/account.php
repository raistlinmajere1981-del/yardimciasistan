<?php
declare(strict_types=1);
namespace YaSite;
if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) { http_response_code(404); exit; }

?>
<section class="state account-container" aria-labelledby="portal-title">
  <p class="eyebrow"><?= e(t($site, 'account.eyebrow')) ?></p>
  <h1 id="portal-title"><?= e(t($site, 'page.account')) ?></h1>
  <p id="account-dealer-badge" class="eyebrow" hidden><?= e(t($site, 'account.dealer_badge')) ?></p>
  <p id="portal-message" role="status" aria-live="polite"><?= e(t($site, 'account.status_checking')) ?></p>

  <div id="account-forms" hidden>
    <form id="account-login" class="account-card">
      <h2><?= e(t($site, 'account.login')) ?></h2>
      <label><?= e(t($site, 'account.email')) ?><input name="email" type="email" autocomplete="email" required></label>
      <label><?= e(t($site, 'account.password')) ?><input name="password" type="password" autocomplete="current-password" required></label>
      <button class="button"><?= e(t($site, 'account.login')) ?></button>
    </form>
    <form id="account-register" class="account-card">
      <h2><?= e(t($site, 'account.register')) ?></h2>
      <label><?= e(t($site, 'account.name')) ?><input name="fullName" autocomplete="name" required maxlength="160"></label>
      <label><?= e(t($site, 'account.email')) ?><input name="email" type="email" autocomplete="email" required></label>
      <button class="button"><?= e(t($site, 'account.register')) ?></button>
    </form>
    <form id="account-recover" class="account-card">
      <h2><?= e(t($site, 'account.forgot_password')) ?></h2>
      <label><?= e(t($site, 'account.email')) ?><input name="email" type="email" autocomplete="email" required></label>
      <button class="button secondary"><?= e(t($site, 'account.send_link')) ?></button>
    </form>
  </div>

  <form id="account-token" class="account-card" hidden>
    <h2><?= e(t($site, 'account.new_password')) ?></h2>
    <label><?= e(t($site, 'account.new_password')) ?><input name="password" type="password" minlength="12" maxlength="72" autocomplete="new-password" required></label>
    <button class="button"><?= e(t($site, 'account.save')) ?></button>
  </form>

  <form id="account-profile" class="account-card" hidden>
    <h2><?= e(t($site, 'account.profile')) ?></h2>
    <p id="account-email"></p>
    <label><?= e(t($site, 'account.name')) ?><input name="fullName" autocomplete="name" maxlength="160" required></label>
    <button class="button"><?= e(t($site, 'account.save_profile')) ?></button>
  </form>

  <div id="account-providers"></div>

  <section id="account-orders" class="account-card" hidden>
    <h2><?= e(t($site, 'account.my_orders')) ?></h2>
    <button id="account-refresh-orders" class="quiet" type="button"><?= e(t($site, 'account.refresh_orders')) ?></button>
    <div id="account-order-list"></div>
    <div id="account-order-detail" hidden></div>
  </section>

  <div class="account-actions">
    <?php if (isset($view['pages']['catalog'])): ?>
      <a class="button" href="<?= e(page_url($site, 'catalog')) ?>"><?= e(t($site, 'account.browse_catalog')) ?></a>
    <?php endif; ?>
    <button id="account-refresh" class="button secondary" type="button" hidden><?= e(t($site, 'account.refresh_session')) ?></button>
    <button id="account-logout-all" class="button secondary" type="button" hidden><?= e(t($site, 'account.logout_all')) ?></button>
    <button id="logout" class="button secondary" type="button" hidden><?= e(t($site, 'account.logout')) ?></button>
  </div>
</section>

<noscript><p class="state"><?= e(t($site, 'account.noscript')) ?></p></noscript>
