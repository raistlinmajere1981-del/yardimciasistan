/* Reusable flag-language disclosure: same file in demo and BlackSea. */
(() => {
  const pickers = [...document.querySelectorAll('[data-flag-language]')];
  if (!pickers.length) return;
  document.addEventListener('pointerdown', event => {
    for (const picker of pickers) {
      if (picker.open && !picker.contains(event.target)) picker.open = false;
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      for (const picker of pickers) {
        if (picker.open) {
          picker.open = false;
          picker.querySelector('summary')?.focus();
          event.stopPropagation();
        }
      }
    }
  });
  for (const picker of pickers) {
    picker.addEventListener('toggle', () => {
      if (!picker.open) return;
      for (const other of pickers) if (other !== picker) other.open = false;
    });
  }
})();
