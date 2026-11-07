<script lang="ts">
  import { RhythmGame } from '../rhythm';
  import { stirfryPack } from './pack';

  let { onExit }: { onExit: () => void } = $props();
</script>

<RhythmGame pack={stirfryPack} {onExit} />
