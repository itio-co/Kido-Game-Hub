<script lang="ts">
  import { tick } from 'svelte';
  import { ASSET_CATALOG, ASSET_KINDS, editorHref, filterAssets, kindLabel, type AssetFilter, type AssetRecord } from '../lib/assetCatalog';

  const params = new URLSearchParams(location.hash.split('?')[1] ?? '');
  let query = $state(params.get('q') ?? '');
  let category = $state<AssetFilter>(ASSET_KINDS.find((item) => item.id === params.get('type'))?.id ?? 'all');
  let sort = $state(params.get('sort') ?? 'project');
  let layout = $state(params.get('view') === 'list' ? 'list' : 'grid');
  let selectedKey = $state(params.get('asset') ?? ASSET_CATALOG[0]!.key);
  let detailDialog: HTMLDialogElement;
  let searchInput: HTMLInputElement;
  function searchShortcut(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (event.key === "/" && !event.ctrlKey && !event.metaKey && !["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName) && !detailDialog?.open) { event.preventDefault(); searchInput?.focus(); }
  }
  let lastCard: HTMLButtonElement | null = null;
  let showReference = $state(false);
  let copied = $state(false);
  const results = $derived(filterAssets(ASSET_CATALOG, query, category, sort));
  const selected = $derived(ASSET_CATALOG.find((item) => item.key === selectedKey) ?? ASSET_CATALOG[0]!);
  const modelCount = ASSET_CATALOG.filter((item) => item.kind === 'model').length;

  function remember(): void {
    const state = new URLSearchParams();
    if (query) state.set('q', query);
    if (category !== 'all') state.set('type', category);
    if (sort !== 'project') state.set('sort', sort);
    if (layout !== 'grid') state.set('view', layout);
    if (selectedKey) state.set('asset', selectedKey);
    history.replaceState(null, '', `#/assets${state.size ? `?${state}` : ''}`);
  }
  function chooseCategory(value: AssetFilter): void { category = value; remember(); }
  async function selectAsset(item: AssetRecord, event: MouseEvent): Promise<void> {
    selectedKey = item.key; showReference = false; copied = false;
    lastCard = event.currentTarget as HTMLButtonElement; remember();
    await tick();
    if (window.matchMedia('(max-width: 950px)').matches) detailDialog.showModal();
  }
  function closeDetails(): void { detailDialog.close(); lastCard?.focus(); }
  function clearFilters(): void { query = ''; category = 'all'; remember(); }
  async function copyPath(): Promise<void> {
    try { await navigator.clipboard.writeText(selected.source); copied = true; }
    catch { copied = false; }
  }
</script>

<svelte:window onkeydown={searchShortcut} />

{#snippet icon(name: string, size = 20)}
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    {#if name === 'search'}<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>
    {:else if name === 'model'}<path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z M3 8l9 5 9-5 M12 13v8 M7.5 5.5l9 5"/>
    {:else if name === 'scene'}<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 6-5 4 3 4-5 4 5"/>
    {:else if name === 'character'}<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>
    {:else if name === 'story'}<path d="M3 4h7a2 2 0 0 1 2 2v15a3 3 0 0 0-3-2H3V4Z M21 4h-7a2 2 0 0 0-2 2v15a3 3 0 0 1 3-2h6V4Z"/>
    {:else if name === 'reference'}<path d="M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5"/><rect x="7" y="7" width="10" height="10" rx="1"/>
    {:else if name === 'list'}<path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1"/>
    {:else if name === 'arrow'}<path d="M5 12h14m-5-5 5 5-5 5"/>
    {:else if name === 'download'}<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>
    {:else if name === 'close'}<path d="m6 6 12 12M6 18 18 6"/>
    {:else}<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>{/if}
  </svg>
{/snippet}

{#snippet picture(item: AssetRecord, reference = false)}
  <div class="asset-picture" class:turntable={item.imageMode === 'turntable' && !reference} class:render={item.imageMode === 'render' && !reference} class:reference>
    {#if item.imageMode === 'turntable' && !reference}<div class="turntable-frame"><img src={item.image} alt={item.titleEn} loading="lazy" /></div>
    {:else}<img src={reference && item.model?.ref ? item.model.ref.src : item.image} alt={reference ? `${item.titleEn} original reference` : item.titleEn} loading="lazy" />{/if}
  </div>
{/snippet}

{#snippet details()}
  <div class="inspect-heading"><span>ASSET DETAILS</span><button class="close-detail" aria-label="Close asset details" onclick={closeDetails}>{@render icon('close')}</button></div>
  <div class="inspect-preview">
    {@render picture(selected, showReference)}
    <span class="preview-caption">{showReference || selected.kind === 'reference' ? 'Original reference' : selected.kind === 'model' ? '3D render · preview' : 'Original artwork'}</span>
  </div>
  {#if selected.kind === 'model' && selected.model?.ref}
    <div class="preview-switch" aria-label="Preview image"><button class:active={!showReference} aria-pressed={!showReference} onclick={() => showReference = false}>Render</button><button class:active={showReference} aria-pressed={showReference} onclick={() => showReference = true}>Reference</button></div>
  {/if}
  <div class="inspect-content">
    <div class="detail-tag">{@render icon(selected.kind, 15)}{kindLabel(selected.kind)}</div>
    <h2>{selected.titleEn}</h2><p class="thai-name" lang="th">{selected.title}</p>
    {#if selected.kind === 'model' && selected.model}
      <a class="primary" href={editorHref(selected.model)}>Open in 3D editor {@render icon('arrow', 18)}</a>
    {:else if selected.kind === 'reference' && selected.model}
      <a class="primary" href={editorHref(selected.model)}>Open matching model {@render icon('arrow', 18)}</a>
    {:else}<a class="primary" href={selected.image} target="_blank" rel="noreferrer">View full image {@render icon('arrow', 18)}</a>{/if}
    <p class="description">{selected.description}</p>
    {#if selected.metadata}
      <div class="specs"><div><span>Editable parts</span><strong>{selected.metadata.exports.partNodes.length}</strong></div><div><span>W × D × H</span><strong>{selected.metadata.dimensionsCm.width} × {selected.metadata.dimensionsCm.depth} × {selected.metadata.dimensionsCm.height} cm</strong></div></div>
      <p class="note">Dimensions are estimates. {selected.metadata.dimensionsNotes.split('.')[0]}.</p>
    {/if}
    <h3>{selected.kind === 'model' ? 'Model files' : 'Image file'}</h3>
    {#if selected.kind === 'model' && selected.model}
      {#each selected.model.variants as variant}
        <div class="file-row"><div><strong>{variant.id === 'master' ? 'Master' : 'Low-poly'}</strong><small>GLB{#if selected.metadata} · {selected.metadata.exports[variant.id as 'master' | 'lowpoly']?.triangles.toLocaleString()} triangles{/if}</small></div><a class="icon-link" href={variant.url} download aria-label={`Download ${selected.titleEn} ${variant.id} GLB`} title="Download GLB">{@render icon('download', 18)}</a><a class="file-open" href={editorHref(selected.model, variant.id)}>Edit</a></div>
      {/each}
    {:else}<a class="file-download" href={selected.image} download>{@render icon('download', 17)} Download image</a>{/if}
    <h3>Source</h3><div class="source"><code>{selected.source}</code><button onclick={copyPath} aria-label="Copy source path">{copied ? 'Copied' : 'Copy'}</button></div>
    <dl><dt>Asset slug</dt><dd>{selected.slug}</dd>{#if selected.model}<dt>Entity ID</dt><dd>{selected.model.id}</dd>{/if}</dl>
    {#if selected.metadata}<details><summary>Source notes</summary><ul>{#each selected.metadata.notes as note}<li>{note}</li>{/each}</ul></details>{/if}
    <p class="local-note">Project files are read-only here. Editor drafts stay on this device.</p>
  </div>
{/snippet}

<div class="asset-browser">
  <header class="app-header"><a href="#/assets" class="brand" aria-label="Never Ending Story assets"><span class="brand-mark">{@render icon('model', 23)}</span><span>Never Ending Story<small>CREATIVE WORKSPACE</small></span></a><nav aria-label="Workspace"><a href="#/assets" aria-current="page">Assets</a><a href="#/editor">3D Editor</a><a href="#/" class="game-link">Back to game {@render icon('arrow', 16)}</a></nav></header>
  <div class="workspace">
    <aside class="sidebar"><p class="section-label">LIBRARY</p><div class="categories" aria-label="Asset categories">{#each ASSET_KINDS as kind}<button class:chosen={category === kind.id} aria-pressed={category === kind.id} onclick={() => chooseCategory(kind.id)}>{@render icon(kind.id, 18)}<span>{kind.label}</span><b>{ASSET_CATALOG.filter((asset) => kind.id === 'all' || asset.kind === kind.id).length}</b></button>{/each}</div><div class="library-note"><span class="status-dot"></span>Project catalog<p>{modelCount} editable models<br/>Original artwork & references</p></div></aside>
    <main>
      <div class="page-heading"><div><p class="breadcrumb">Never Ending Story / Library</p><h1>Asset browser<span>{ASSET_CATALOG.length}</span></h1><p class="intro">Every piece of your story, in one place.</p></div><span class="project-chip"><span class="status-dot"></span>Project assets</span></div>
      <div class="search-row"><label class="search">{@render icon('search', 20)}<input type="search" placeholder="Search assets, names or paths…" aria-label="Search assets" bind:this={searchInput} bind:value={query} oninput={(event) => { query = event.currentTarget.value; remember(); }}/><kbd>/</kbd></label></div>
      <div class="collection-bar"><p aria-live="polite"><strong>{category === 'all' ? 'All assets' : ASSET_KINDS.find((kind) => kind.id === category)?.label}</strong><span>{results.length} {results.length === 1 ? 'asset' : 'assets'}{query ? ' found' : ''}</span></p><div class="view-controls"><label class="sort"><span class="sr-only">Sort assets</span><select aria-label="Sort assets" bind:value={sort} onchange={(event) => { sort = event.currentTarget.value; remember(); }}><option value="project">Project order</option><option value="name">Name A–Z</option><option value="type">Asset type</option></select></label><div class="view-toggle"><button class:active={layout === 'grid'} aria-label="Grid view" aria-pressed={layout === 'grid'} onclick={() => { layout = 'grid'; remember(); }}>{@render icon('all', 17)}</button><button class:active={layout === 'list'} aria-label="List view" aria-pressed={layout === 'list'} onclick={() => { layout = 'list'; remember(); }}>{@render icon('list', 18)}</button></div></div></div>
      <div class="asset-grid" class:list={layout === 'list'}>
        {#each results as item (item.key)}
          <button class="asset-card" class:selected={selectedKey === item.key} aria-label={`Inspect ${item.titleEn}`} aria-pressed={selectedKey === item.key} onclick={(event) => selectAsset(item, event)}>
            <div class="card-preview">{@render picture(item)}<span class="file-badge">{item.kind === 'model' ? '3D' : item.kind === 'reference' ? 'REF' : 'JPG'}</span>{#if item.kind === 'model'}<span class="variant-badge">2 variants</span>{/if}</div>
            <div class="card-info"><span class="card-type">{@render icon(item.kind, 14)}{kindLabel(item.kind)}</span><h2>{item.titleEn}</h2><p lang="th">{item.title}</p><span class="list-path">{item.source}</span></div><span class="card-arrow">{@render icon('arrow', 18)}</span>
          </button>
        {/each}
      </div>
      {#if !results.length}<div class="empty">{@render icon('search', 35)}<h2>No assets found</h2><p>Try another name, path or category.</p><button onclick={clearFilters}>Clear filters</button></div>{/if}
      <footer class="catalog-footer">From the project’s model registry and artwork files. Only 3D models open in the editor.</footer>
    </main>
    <aside class="inspector" aria-label="Selected asset details">{@render details()}</aside>
  </div>
  <dialog bind:this={detailDialog} aria-label="Asset details" onclose={() => lastCard?.focus()}>{@render details()}</dialog>
</div>

<style>
  .asset-browser { position: absolute; inset: 0; display: flex; flex-direction: column; background: #101923; color: #e2eaf2; font-size: 13px; user-select: text; }
  button, a, input, select { -webkit-tap-highlight-color: transparent; }
  button, select { font: inherit; color: inherit; cursor: pointer; }
  button, a { touch-action: manipulation; }
  button { background: transparent; border: 0; }
  a { color: inherit; text-decoration: none; }
  button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible { outline: 2px solid #9cddff; outline-offset: 3px; }
  .app-header { min-height: 78px; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 12px 24px; border-bottom: 1px solid #2b3745; background: #15202c; }
  .brand { display: flex; align-items: center; gap: 11px; font-size: 14px; font-weight: 700; line-height: 1.4; }
  .brand-mark { display: grid; place-items: center; width: 38px; height: 40px; border-radius: 11px; background: #a5dcf2; color: #173349; }
  .brand small { display: block; margin-top: 3px; color: #89a0b5; font-size: 9px; font-weight: 400; letter-spacing: .16em; }
  nav { display: flex; align-items: center; gap: 8px; }
  nav a { display: flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 17px; color: #a6b8c9; border-radius: 8px; gap: 10px; }
  nav a[aria-current] { color: #c6ebff; background: #263b4b; }
  nav .game-link { border: 1px solid #3c4c5b; margin-left: 15px; }
  .workspace { display: grid; grid-template-columns: 192px minmax(0, 1fr) 296px; flex: 1; min-height: 0; }
  .sidebar { padding: 28px 12px; display: flex; flex-direction: column; border-right: 1px solid #2b3745; background: #15202c; min-width: 0; }
  .section-label { margin: 0 14px 13px; font-size: 10px; letter-spacing: .15em; color: #8097ac; }
  .categories { display: grid; gap: 5px; }
  .categories button { min-height: 44px; padding: 10px 12px; border-radius: 7px; display: flex; align-items: center; gap: 11px; color: #a7b8c8; text-align: left; font-size: 12px; }
  .categories button.chosen { color: #bae6fc; background: #284152; }
  .categories button:hover { background: #233444; }
  .categories b { font-size: 10px; margin-left: auto; color: #96adc0; font-weight: 400; }
  .library-note { margin: auto 13px 0; padding-top: 40px; color: #b6c7d4; font-size: 11px; }
  .status-dot { display: inline-block; width: 6px; height: 6px; background: #9bcbab; border-radius: 50%; margin-right: 6px; }
  .library-note p { font-size: 10px; color: #7f95a8; line-height: 1.8; margin: 9px 0 0; }
  main { overflow-y: auto; padding: 30px 28px 20px; min-width: 0; scrollbar-width: thin; }
  .page-heading { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 24px; }
  .breadcrumb { font-size: 10px; margin: 0 0 8px; color: #859cb0; }
  h1 { font-size: 28px; line-height: 1.3; margin: 0 0 8px; letter-spacing: -.04em; font-weight: 700; display: flex; align-items: center; gap: 12px; }
  h1 span { background: #263747; border: 1px solid #35495b; padding: 2px 7px; border-radius: 6px; font-size: 11px; letter-spacing: 0; color: #b3ccdf; }
  .intro { color: #91a5b7; font-size: 12px; margin: 0; }
  .project-chip { display: flex; align-items: center; border: 1px solid #344756; border-radius: 20px; padding: 7px 10px; font-size: 10px; color: #a9c0cb; white-space: nowrap; }
  .search { display: flex; align-items: center; gap: 11px; border: 1px solid #344555; background: #1b2835; min-height: 46px; padding: 0 14px; border-radius: 8px; color: #849fb4; }
  .search input { width: 100%; min-width: 0; font-size: 12px; color: #e2eaf2; padding: 12px 0; border: 0; background: transparent; outline-offset: 0; }
  .search input::placeholder { color: #8ba2b6; }
  kbd { border: 1px solid #455567; border-radius: 4px; padding: 0 6px; font-size: 10px; }
  .collection-bar { display: flex; gap: 12px; justify-content: space-between; align-items: center; margin: 21px 0 16px; }
  .collection-bar p { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; margin: 0; }
  .collection-bar strong { font-size: 12px; font-weight: 600; }.collection-bar p span { color: #8196a8; font-size: 10px; }
  .view-controls { display: flex; align-items: center; gap: 10px; }
  select { min-height: 44px; font-size: 10px; border: 0; background: #101923; max-width: 120px; padding: 4px; }
  .view-toggle { display: flex; border: 1px solid #344555; background: #172431; padding: 3px; border-radius: 8px; }
  .view-toggle button { min-width: 44px; min-height: 44px; display: grid; place-items: center; border-radius: 5px; color: #879eb1; }
  .view-toggle button.active { color: #c4e9fb; background: #324959; }
  .asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; }
  .asset-card { position: relative; padding: 0; border: 1px solid #304252; background: #1a2734; border-radius: 10px; overflow: hidden; text-align: left; min-width: 0; transition: border-color .15s, background .15s; }
  .asset-card:hover { border-color: #739db8; background: #213343; }
  .asset-card.selected { border-color: #92cce9; box-shadow: 0 0 0 1px #92cce933; }
  .card-preview { aspect-ratio: 1.38; position: relative; background: #2a3740; overflow: hidden; }
  .asset-picture { width: 100%; height: 100%; position: relative; overflow: hidden; }
  .asset-picture img { width: 100%; height: 100%; display: block; object-fit: cover; object-position: center 40%; }
  .asset-picture.turntable { background: #edd6bc; }.turntable-frame { height: 100%; aspect-ratio: 512 / 568; margin: auto; overflow: hidden; }.asset-picture.turntable img { max-width: none; width: auto; height: 100%; }
  .asset-picture.render { background: radial-gradient(ellipse at center, #445251, #26383f); }
  .asset-picture.render img { object-fit: contain; }
  .asset-picture.reference { background: #273442; }
  .asset-picture.reference img { object-fit: contain; padding: 14px; }
  .file-badge, .variant-badge { position: absolute; top: 10px; background: #122331dd; border: 1px solid #71818a55; border-radius: 4px; color: #d9e9f1; font-size: 8px; letter-spacing: .05em; padding: 3px 5px; }
  .file-badge { left: 10px; }.variant-badge { right: 10px; letter-spacing: 0; }
  .card-info { padding: 12px 13px 13px; }.card-type { display: flex; align-items: center; gap: 5px; color: #8eacc1; font-size: 9px; }
  .card-info h2 { font-size: 13px; margin: 7px 0 2px; line-height: 1.4; overflow-wrap: anywhere; }.card-info p { color: #8da2b4; font-size: 10px; margin: 0; line-height: 1.6; }
  .list-path, .card-arrow { display: none; }
  .asset-grid.list { display: flex; flex-direction: column; gap: 8px; }.list .asset-card { display: flex; align-items: center; min-height: 90px; }.list .card-preview { width: 100px; min-width: 100px; align-self: stretch; aspect-ratio: auto; }.list .card-info { flex: 1; min-width: 0; padding: 12px 17px; }.list .card-info h2 { margin: 2px 0; }.list .file-badge { top: 5px; left: 5px; }.list .variant-badge { display: none; }.list .card-info p { display: none; }.list .list-path { display: block; color: #8299ac; font-size: 9px; overflow-wrap: anywhere; }.list .card-arrow { display: flex; padding: 15px; color: #9eb9cc; }
  .empty { text-align: center; display: grid; justify-items: center; padding: 70px 20px; color: #90a9bd; }.empty h2 { color: #e1edf5; font-size: 18px; margin: 16px 0 0; }.empty button { color: #c0e9ff; padding: 10px 18px; border: 1px solid #466276; border-radius: 6px; min-height: 44px; }
  .catalog-footer { font-size: 9px; color: #8198ac; padding: 24px 0 0; line-height: 1.7; }
  .inspector { border-left: 1px solid #2e3c4b; background: #172330; overflow-y: auto; scrollbar-width: thin; }.inspect-heading { padding: 18px 20px; min-height: 60px; display: flex; justify-content: space-between; align-items: center; font-size: 9px; letter-spacing: .13em; color: #99afc2; }
  .close-detail { display: none; }.inspect-preview { position: relative; height: 235px; margin: 0 16px; border-radius: 8px; overflow: hidden; background: #253644; }.preview-caption { position: absolute; bottom: 8px; left: 8px; background: #172531e8; border-radius: 4px; padding: 3px 6px; font-size: 8px; color: #c2d4df; }
  .preview-switch { display: flex; margin: 10px 16px 0; padding: 3px; border-radius: 7px; background: #101c28; gap: 4px; }.preview-switch button { flex: 1; min-height: 44px; border-radius: 4px; font-size: 10px; color: #95aabd; }.preview-switch button.active { background: #304455; color: #d4e9f6; }
  .inspect-content { padding: 23px 20px 24px; }.detail-tag { color: #9cbbd0; font-size: 9px; display: flex; gap: 5px; align-items: center; }.inspect-content h2 { font-size: 22px; letter-spacing: -.03em; line-height: 1.4; margin: 7px 0 0; overflow-wrap: anywhere; }.thai-name { font-size: 12px; color: #9eb4c6; margin: 3px 0 16px; }
  .primary { min-height: 44px; display: flex; justify-content: center; align-items: center; gap: 10px; padding: 8px; border-radius: 7px; background: #a5dcf2; color: #153448; font-size: 11px; font-weight: 700; }.primary:hover { background: #c0e9fb; }.description { font-size: 11px; color: #b3c2d0; line-height: 1.8; margin: 17px 0; }
  .specs { display: grid; gap: 10px; padding: 14px 0; border-block: 1px solid #304252; }.specs div { display: flex; justify-content: space-between; gap: 12px; font-size: 10px; }.specs span { color: #8ca4b8; }.specs strong { font-weight: 400; text-align: right; }.note { font-size: 9px; color: #8ea5b8; line-height: 1.6; }
  h3 { font-size: 10px; font-weight: 700; margin: 23px 0 10px; }.file-row { display: flex; gap: 8px; align-items: center; border-top: 1px solid #304252; min-height: 63px; }.file-row div { flex: 1; min-width: 0; }.file-row strong { display: block; font-size: 11px; font-weight: 500; }.file-row small { display: block; color: #8fa7bb; font-size: 9px; margin-top: 3px; }.icon-link { width: 44px; height: 44px; display: grid; place-items: center; color: #a2bcd0; }.file-open { display: grid; place-items: center; min-width: 44px; min-height: 44px; font-size: 10px; color: #afe2fa; }.file-download { display: flex; align-items: center; gap: 10px; min-height: 44px; border: 1px solid #3c5367; border-radius: 6px; padding: 7px 10px; font-size: 11px; }
  .source { background: #101b26; border: 1px solid #2d4052; border-radius: 6px; padding: 9px 10px; display: flex; gap: 6px; align-items: center; }code { font-family: ui-monospace, monospace; font-size: 9px; color: #a7bdcf; overflow-wrap: anywhere; }.source button { min-height: 44px; min-width: 44px; font-size: 9px; color: #a5d7ef; padding: 0; }.source code { flex: 1; }
  dl { margin: 17px 0; font-size: 9px; }dt { color: #91a9bd; margin: 12px 0 4px; }dd { margin: 0; color: #afc1d0; overflow-wrap: anywhere; }summary { cursor: pointer; min-height: 44px; padding: 13px 0; font-size: 10px; color: #b3c8d8; }details ul { margin: 0; padding-left: 16px; color: #98acbd; font-size: 10px; line-height: 1.8; }details li { margin-bottom: 8px; }.local-note { color: #8199ad; font-size: 9px; line-height: 1.7; margin: 20px 0 0; }
  dialog { width: min(520px, calc(100vw - 24px)); max-height: calc(100dvh - 30px); border: 1px solid #4e6a80; border-radius: 15px; background: #172330; color: #e2eaf2; padding: 0; overflow-y: auto; }dialog::backdrop { background: #050d16c9; backdrop-filter: blur(5px); }dialog .close-detail { display: grid; place-items: center; min-width: 44px; min-height: 44px; color: #bbd0df; border-radius: 7px; background: #233647; }dialog .inspect-heading { padding: 8px 16px; }dialog .inspect-preview { height: 250px; }dialog .inspect-content { padding: 20px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
  @media (max-width: 1250px) { .workspace { grid-template-columns: 172px minmax(0, 1fr) 270px; }main { padding: 25px 20px; }.categories button { padding: 9px; gap: 8px; font-size: 11px; }.project-chip { display: none; }.asset-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 13px; }.inspect-preview { height: 215px; } }
  @media (max-width: 950px) { .workspace { grid-template-columns: 180px minmax(0, 1fr); }.inspector { display: none; }.asset-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }.project-chip { display: flex; } }
  @media (max-width: 650px) { .app-header { padding: 10px 14px; min-height: 68px; gap: 8px; }.brand { font-size: 11px; gap: 8px; }.brand small { font-size: 7px; letter-spacing: .09em; }.brand-mark { width: 31px; height: 34px; border-radius: 8px; }nav { gap: 2px; }nav a { padding: 0 9px; font-size: 11px; }nav .game-link { display: none; }.workspace { display: flex; flex-direction: column; overflow: hidden; }.sidebar { padding: 10px 12px; flex: 0 0 auto; border-right: 0; border-bottom: 1px solid #2b3745; }.section-label, .library-note { display: none; }.categories { display: flex; overflow-x: auto; scrollbar-width: none; gap: 5px; }.categories button { min-height: 44px; flex: 0 0 auto; padding: 7px 10px; }.categories b { font-size: 9px; }.categories :global(svg) { width: 15px; }.categories button:not(.chosen) { background: #1a2a38; }main { padding: 23px 16px; flex: 1; }.page-heading { margin-bottom: 19px; }h1 { font-size: 27px; }.breadcrumb { font-size: 9px; }.intro { font-size: 11px; }.project-chip { display: none; }.search { padding-inline: 11px; }.search input { font-size: 12px; }kbd { display: none; }.collection-bar { gap: 7px; margin: 16px 0 12px; }.collection-bar p { gap: 5px; }.collection-bar strong { font-size: 11px; }.collection-bar p span { font-size: 9px; }.view-controls { gap: 4px; }select { max-width: 92px; font-size: 9px; }.view-toggle button { min-width: 44px; min-height: 44px; }.asset-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px; }.card-info { padding: 10px; }.card-info h2 { font-size: 12px; }.card-info p { font-size: 9px; }.file-badge { top: 7px; left: 7px; }.variant-badge { top: 7px; right: 7px; font-size: 7px; }.card-type { font-size: 8px; }.list .card-preview { width: 82px; min-width: 82px; }.list .card-info { padding: 10px 12px; }.list .card-arrow { padding: 9px; }dialog { margin: auto auto 10px; max-height: calc(100dvh - 20px); }dialog .inspect-preview { height: 230px; }.catalog-footer { font-size: 9px; } }
  @media (max-width: 360px) { .brand small { display: none; }.brand { max-width: 150px; }.brand-mark { flex-shrink: 0; }nav a { padding: 0 7px; }main { padding-inline: 12px; }.collection-bar p { max-width: 85px; min-width: 0; }.collection-bar strong { width: 100%; }.asset-grid { gap: 9px; }.variant-badge { display: none; }.card-info h2 { font-size: 11px; }.card-type { font-size: 8px; } }
  @media (prefers-reduced-motion: reduce) { .asset-card { transition: none; } }
</style>
