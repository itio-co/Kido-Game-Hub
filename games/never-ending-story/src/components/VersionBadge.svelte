<script lang="ts">
  import { version } from '../../package.json';
</script>

<p class="ver">v{version}</p>

<style>
  .ver {
    position: absolute;
    z-index: 40;
    /* Bottom-left edge, under the back button: in the top-right corner it sat on the settings button and the DEMO ribbon. */
    bottom: env(safe-area-inset-bottom);
    left: 12px;
    margin: 0;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.2;
    color: #fff;
    background: rgba(0, 0, 0, 0.55);
    padding: 1px 6px;
    border-radius: 8px;
    pointer-events: none;
  }
</style>
