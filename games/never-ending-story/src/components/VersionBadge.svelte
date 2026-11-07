<script lang="ts">
  import { version } from '../../package.json';
</script>

<p class="ver">v{version}</p>

<style>
  /* Sit under the HUD on the left — never overlaps the settings gear (top-right). */
  .ver {
    position: absolute;
    z-index: 40;
    top: calc(52px + env(safe-area-inset-top));
    left: 8px;
    right: auto;
    bottom: auto;
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.2;
    color: rgba(255, 255, 255, 0.9);
    background: rgba(0, 0, 0, 0.45);
    padding: 2px 6px;
    border-radius: 8px;
    pointer-events: none;
  }
</style>
