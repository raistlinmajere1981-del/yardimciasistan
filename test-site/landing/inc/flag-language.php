<?php
declare(strict_types=1);

/** Site-owned flag picker. Same component is used by the demo and BlackSea. */
function render_flag_language(string $active, array $available): void {
    $names = ['tr' => 'Türkçe', 'en' => 'English'];
    $languages = array_values(array_unique(array_filter($available, static fn(string $code): bool => isset($names[$code]))));
    if (count($languages) < 2) return;
    $active = in_array($active, $languages, true) ? $active : 'tr';
    $label = $active === 'en' ? 'Change language' : 'Dil değiştir';
    $escape = static fn(string $text): string => htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    ?>
    <details class="flag-language" data-flag-language>
      <summary class="flag-language__trigger" aria-label="<?= $escape($label) ?>" title="<?= $escape($label) ?>">
        <span class="flag-language__cloth flag-language__cloth--active"><img src="/assets/flags/<?= $escape($active) ?>.svg" alt="" width="34" height="24" aria-hidden="true"></span>
        <span class="flag-language__chevron" aria-hidden="true"></span>
      </summary>
      <div class="flag-language__menu">
        <form method="get" class="flag-language__choices" aria-label="<?= $escape($label) ?>">
          <?php foreach ($_GET as $key => $value): if ($key !== 'lang' && is_string($value)): ?>
          <input type="hidden" name="<?= $escape((string)$key) ?>" value="<?= $escape($value) ?>">
          <?php endif; endforeach; ?>
          <?php foreach ($languages as $language): ?>
          <button type="submit" name="lang" value="<?= $escape($language) ?>" lang="<?= $escape($language) ?>"
                  aria-label="<?= $escape($names[$language]) ?>" aria-pressed="<?= $language === $active ? 'true' : 'false' ?>"
                  class="flag-language__choice<?= $language === $active ? ' is-current' : '' ?>">
            <span class="flag-language__cloth"><img src="/assets/flags/<?= $escape($language) ?>.svg" alt="" width="34" height="24" aria-hidden="true"></span>
            <span class="flag-language__name"><?= $escape($names[$language]) ?></span>
          </button>
          <?php endforeach; ?>
        </form>
      </div>
    </details>
    <?php
}
