<script lang="ts">
  import { version } from '../../package.json';
</script>

<p class="ver">v{version}</p>

<style>
  .ver {
    position: absolute;
    z-index: 40;
    top: calc(4px + env(safe-area-inset-top));
    right: 6px;
    margin: 0;
    font-size: 13px;
    font-weight: 700;
    line-height: 1.2;
    color: #fff;
    background: rgba(0, 0, 0, 0.55);
    padding: 2px 7px;
    border-radius: 8px;
    pointer-events: none;
  }
</style>
