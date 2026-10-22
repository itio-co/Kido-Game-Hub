import { mount } from 'svelte';
import App from './App.svelte';
import { registerServiceWorker } from './pwa';
import './app.css';

registerServiceWorker();

const target = document.getElementById('app');
if (!target) throw new Error('missing #app');

const app = mount(App, { target });

export default app;
