import '@fontsource/young-serif/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './styles/tokens.css';
import './styles/base.css';

import { Capacitor } from '@capacitor/core';
import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';

if (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  !Capacitor.isNativePlatform()
) {
  registerSW({ immediate: true });
}

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
