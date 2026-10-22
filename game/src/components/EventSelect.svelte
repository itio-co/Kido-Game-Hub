<script lang="ts">
  let { title, body, cardTitle, cardBody }: { title: string; body: string; cardTitle: string; cardBody: string } =
    $props();
</script>

<section class="events" aria-label={title}>
  <h1>{title}</h1>
  <p class="lead">{body}</p>
  <article class="stub-card">
    <h2>{cardTitle}</h2>
    <p>{cardBody}</p>
  </article>
</section>
