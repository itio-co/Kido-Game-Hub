import { mount } from 'svelte';
import God from './God.svelte';

const target = document.getElementById('god');
if (!target) throw new Error('missing #god');
mount(God, { target });
