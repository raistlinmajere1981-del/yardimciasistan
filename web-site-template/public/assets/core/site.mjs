import {createLanguage, formatLanguageElements} from './language.mjs';
import {createIntegrations} from './public-api.mjs';

const context = JSON.parse(document.getElementById('site-context').textContent);
const button = document.querySelector('[data-menu-toggle]');
const navigation = document.getElementById('main-navigation');
const mobile = matchMedia('(max-width: 760px)');
const messages = context.language.messages;
document.body.dataset.js = '';

function setMenu(open, focus = false) {
  if (!button || !navigation) return;
  navigation.hidden = mobile.matches && !open;
  button.setAttribute('aria-expanded', String(!navigation.hidden));
  button.textContent = messages[navigation.hidden ? 'nav.open' : 'nav.close'];
  if (focus) button.focus();
}
if (button && navigation) {
  button.hidden = false;
  setMenu(false);
  button.addEventListener('click', () => setMenu(button.getAttribute('aria-expanded') !== 'true'));
  mobile.addEventListener('change', () => setMenu(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && mobile.matches && !navigation.hidden) setMenu(false, true);
  });
  document.addEventListener('click', event => {
    if (mobile.matches && !navigation.hidden && !navigation.contains(event.target) && !button.contains(event.target)) setMenu(false);
  });
}
document.querySelector('[data-language-select]')?.addEventListener('change', event => event.target.form.requestSubmit());

document.querySelector('[data-menu-category]')?.addEventListener('change', event => event.target.form.requestSubmit());

// Revisit is a real stale-publication case. Offer an explicit refresh rather than
// replacing page/form/cart state or adding a second publication poller.
const readAt = Date.now();
const showFreshness = () => {
  if (document.visibilityState !== 'hidden' && Date.now() - readAt >= 60000) {
    const notice = document.querySelector('[data-publication-freshness]');
    if (notice) notice.hidden = false;
  }
};
window.addEventListener('pageshow', showFreshness);
window.addEventListener('focus', showFreshness);
document.addEventListener('visibilitychange', showFreshness);

const integrations = createIntegrations(context);
const language = createLanguage(context.language);
formatLanguageElements(language);
// Consumers mount with this same versioned context; language switches reload all page state coherently.
window.dispatchEvent(new CustomEvent('ya:language', {detail:language.requestContext}));
// Site behavior is a separate module; it receives the same catalog and transport.
const theme = await import(context.themeModule);
await theme.mount?.({language, integrations, features: Object.freeze({...context.features})});
if (context.effects.length) {
  const {mountEffects} = await import('./effects.mjs');
  mountEffects(context.effects);
}
