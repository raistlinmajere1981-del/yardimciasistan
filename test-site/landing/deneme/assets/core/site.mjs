import {createLanguage, formatLanguageElements} from './language.mjs';
import {createIntegrations} from './public-api.mjs';
import {bootTraffic} from './traffic.mjs';

const context = JSON.parse(document.getElementById('site-context').textContent);
bootTraffic(context);
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
