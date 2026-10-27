import { installShowcaseAvatar } from './showcase-avatar';

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installShowcaseAvatar, { once: true });
else installShowcaseAvatar();
