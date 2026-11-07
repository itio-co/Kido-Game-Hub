<script lang="ts">
  import { RhythmGame } from '../rhythm';
  import { stirfryEdition } from './edition';

  let { onExit }: { onExit: () => void } = $props();
</script>

<RhythmGame edition={stirfryEdition} {onExit} />
