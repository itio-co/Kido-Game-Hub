import { mount } from 'svelte';
import App from './App.svelte';
import { registerServiceWorker } from './pwa';
import { pullOnStartup, startBackgroundSync } from './lib/cloudSync';
import './app.css';

registerServiceWorker();

const target = document.getElementById('app');
if (!target) throw new Error('missing #app');

void pullOnStartup().finally(() => {
  mount(App, { target });
  startBackgroundSync();
});
