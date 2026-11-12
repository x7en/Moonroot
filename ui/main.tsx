import '@fontsource/young-serif/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './styles/tokens.css';
import './styles/base.css';

import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { registerPwaServiceWorker } from '../platform/pwa';
import { App } from './App';

registerPwaServiceWorker(() => {
  registerSW({ immediate: true });
});

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
