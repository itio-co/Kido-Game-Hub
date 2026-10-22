<script lang="ts">
  let { show }: { show: boolean } = $props();
</script>

{#if show}
  <div class="demo-ribbon" aria-hidden="true">
    <span>DEMO</span>
  </div>
{/if}

<style>
  .demo-ribbon {
    position: absolute;
    z-index: 8;
    top: 0;
    right: 0;
    width: 112px;
    height: 112px;
    overflow: hidden;
    pointer-events: none;
  }
  .demo-ribbon span {
    position: absolute;
    top: 26px;
    right: -34px;
    width: 148px;
    transform: rotate(45deg);
    background: #c0392b;
    color: #fff;
    text-align: center;
    font-weight: 800;
    letter-spacing: 0.14em;
    font-size: 15px;
    line-height: 1;
    padding: 7px 0;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  }
</style>
