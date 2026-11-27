<script lang="ts">
  /** Reusable free-drag jigsaw board. Pieces are real tab/blank shapes; difficulty comes from the profile. */
  import { jigComplete, isJigBoard, movePiece, selectPiece, setPieceAngle, tapRotate, trySnapPiece, type JigBoard, type JigState } from './board.ts';
  import { piecePath, tabDepth } from './edges.ts';
  import { jigProfile, type JigProfile } from './ruleset.ts';

  let {
    jig,
    imageSrc,
    profile = null,
    aspect = 0.75,
    onUpdate,
    onComplete,
  }: {
    jig: JigState;
    imageSrc: string;
    profile?: JigProfile | null;
    aspect?: number;
    onUpdate: (next: JigBoard) => void;
    onComplete?: () => void;
  } = $props();

  const board = $derived(isJigBoard(jig) ? jig : null);
  const activeProfile = $derived(profile ?? (board ? jigProfile(board.profileId, board.version) : jigProfile('medium')));

  let playEl = $state<HTMLDivElement | null>(null);
  let boardEl = $state<HTMLDivElement | null>(null);
  let playW = $state(300);
  let playH = $state(400);
  let boardX = $state(40);
  let boardY = $state(40);
  let boardW = $state(220);
  let boardH = $state(293);

  const cellW = $derived(board && board.cols ? boardW / board.cols : 1);
  const cellH = $derived(board && board.rows ? boardH / board.rows : 1);
  const tab = $derived(tabDepth(cellW, cellH));

  function measure(): void {
    if (!playEl || !boardEl) return;
    const play = playEl.getBoundingClientRect();
    const frame = boardEl.getBoundingClientRect();
    playW = play.width;
    playH = play.height;
    boardX = frame.left - play.left;
    boardY = frame.top - play.top;
    boardW = frame.width;
    boardH = frame.height;
  }

  $effect(() => {
    if (!playEl || !boardEl) return;
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(playEl);
    ro.observe(boardEl);
    return () => ro.disconnect();
  });

  let completeFired = false;
  $effect(() => {
    const done = !!board && jigComplete(board);
    if (!done) {
      completeFired = false;
      return;
    }
    if (completeFired) return;
    completeFired = true;
    const timer = window.setTimeout(() => onComplete?.(), 800);
    return () => clearTimeout(timer);
  });

  type Drag = {
    ids: number[];
    pointerId: number;
    /** Offset from the piece centre, in cell units. */
    offX: number;
    offY: number;
    startX: number;
    startY: number;
    rotated: boolean;
  };
  type Pinch = {
    pieceId: number;
    a: number;
    b: number;
    startAngle: number;
    startPiece: number;
    midX: number;
    midY: number;
    startX: number;
    startY: number;
  };

  let drags = $state<Drag[]>([]);
  let pinch = $state<Pinch | null>(null);
  let handleDrag = $state<{ id: number; pointerId: number } | null>(null);
  let rightRotate = $state<{ id: number; pointerId: number } | null>(null);
  const pointers = new Map<number, { x: number; y: number; pieceId: number }>();

  function toCell(clientX: number, clientY: number): { x: number; y: number } {
    const play = playEl?.getBoundingClientRect();
    const left = play?.left ?? 0;
    const top = play?.top ?? 0;
    return {
      x: (clientX - left - boardX) / cellW,
      y: (clientY - top - boardY) / cellH,
    };
  }

  function screenAngle(ax: number, ay: number, bx: number, by: number): number {
    return Math.atan2(by - ay, bx - ax) * (180 / Math.PI);
  }

  function emit(next: JigBoard): void {
    onUpdate(next);
  }

  function pieceAt(id: number) {
    return board?.pieces.find((item) => item.id === id);
  }

  function angleToward(piece: { x: number; y: number }, clientX: number, clientY: number): number {
    const cell = toCell(clientX, clientY);
    return Math.atan2(cell.y - piece.y, cell.x - piece.x) * (180 / Math.PI) + 90;
  }

  function downOnPiece(event: PointerEvent, id: number): void {
    if (!board) return;
    const piece = pieceAt(id);
    if (!piece || piece.locked) return;
    if (event.button === 2 && board.rotation === 'free') {
      event.preventDefault();
      event.stopPropagation();
      (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, pieceId: id });
      rightRotate = { id, pointerId: event.pointerId };
      emit(setPieceAngle(selectPiece(board, id), id, angleToward(piece, event.clientX, event.clientY)));
      return;
    }
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const cell = toCell(event.clientX, event.clientY);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, pieceId: id });
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    const others = [...pointers.entries()].filter(([pid, p]) => pid !== event.pointerId && p.pieceId === id);
    if (others.length === 1 && board.rotation === 'free') {
      const other = others[0];
      pinch = {
        pieceId: id,
        a: other[0],
        b: event.pointerId,
        startAngle: screenAngle(other[1].x, other[1].y, event.clientX, event.clientY),
        startPiece: piece.angle,
        midX: (other[1].x + event.clientX) / 2,
        midY: (other[1].y + event.clientY) / 2,
        startX: piece.x,
        startY: piece.y,
      };
      drags = drags.filter((drag) => drag.ids[0] !== id);
      return;
    }
    drags = [...drags.filter((drag) => !drag.ids.includes(id)), {
      ids: [id],
      pointerId: event.pointerId,
      offX: cell.x - piece.x,
      offY: cell.y - piece.y,
      startX: event.clientX,
      startY: event.clientY,
      rotated: false,
    }];
    emit(selectPiece(board, id));
  }

  function downOnHandle(event: PointerEvent, id: number): void {
    if (!board) return;
    const piece = pieceAt(id);
    if (!piece || piece.locked || board.rotation === 'none') return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    handleDrag = { id, pointerId: event.pointerId, };
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, pieceId: id });
    emit(selectPiece(board, id));
    if (board.rotation === 'quarter') {
      // Rotation happens on a short tap (pointerup) so a drag doesn't also spin it.
      return;
    }
    const cell = toCell(event.clientX, event.clientY);
    const angle = Math.atan2(cell.y - piece.y, cell.x - piece.x) * (180 / Math.PI) + 90;
    emit(setPieceAngle(selectPiece(board, id), id, angle));
  }

  function onPointerMove(event: PointerEvent): void {
    if (!board) return;
    const tracked = pointers.get(event.pointerId);
    if (tracked) pointers.set(event.pointerId, { ...tracked, x: event.clientX, y: event.clientY });

    if (pinch && (event.pointerId === pinch.a || event.pointerId === pinch.b)) {
      const pa = pointers.get(pinch.a);
      const pb = pointers.get(pinch.b);
      if (!pa || !pb) return;
      event.preventDefault();
      const delta = screenAngle(pa.x, pa.y, pb.x, pb.y) - pinch.startAngle;
      let next = setPieceAngle(board, pinch.pieceId, pinch.startPiece + delta);
      const mid = toCell((pa.x + pb.x) / 2, (pa.y + pb.y) / 2);
      const startMid = toCell(pinch.midX, pinch.midY);
      next = movePiece(next, pinch.pieceId, pinch.startX + (mid.x - startMid.x), pinch.startY + (mid.y - startMid.y));
      emit(next);
      return;
    }

    if (rightRotate && rightRotate.pointerId === event.pointerId && board.rotation === 'free') {
      const piece = pieceAt(rightRotate.id);
      if (!piece) return;
      event.preventDefault();
      emit(setPieceAngle(board, rightRotate.id, angleToward(piece, event.clientX, event.clientY)));
      return;
    }

    if (handleDrag && handleDrag.pointerId === event.pointerId && board.rotation === 'free') {
      const piece = pieceAt(handleDrag.id);
      if (!piece) return;
      event.preventDefault();
      const cell = toCell(event.clientX, event.clientY);
      const angle = Math.atan2(cell.y - piece.y, cell.x - piece.x) * (180 / Math.PI) + 90;
      emit(setPieceAngle(board, handleDrag.id, angle));
      return;
    }

    const drag = drags.find((item) => item.pointerId === event.pointerId);
    if (!drag) return;
    event.preventDefault();
    const cell = toCell(event.clientX, event.clientY);
    emit(movePiece(board, drag.ids[0], cell.x - drag.offX, cell.y - drag.offY));
  }

  function release(event: PointerEvent): void {
    if (!board) return;
    const idFromHandle = handleDrag && handleDrag.pointerId === event.pointerId ? handleDrag.id : null;
    const idFromRight = rightRotate && rightRotate.pointerId === event.pointerId ? rightRotate.id : null;
    const idFromPinch = pinch && (event.pointerId === pinch.a || event.pointerId === pinch.b) ? pinch.pieceId : null;
    const drag = drags.find((item) => item.pointerId === event.pointerId);
    const id = idFromHandle ?? idFromRight ?? idFromPinch ?? drag?.ids[0];

    let current = isJigBoard(jig) ? jig : board;
    if (drag && current.rotation === 'quarter' && idFromHandle === null && idFromPinch === null) {
      const moved = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
      if (moved < 10) current = tapRotate(current, drag.ids[0], 90);
    }

    pointers.delete(event.pointerId);
    drags = drags.filter((item) => item.pointerId !== event.pointerId);
    if (handleDrag && handleDrag.pointerId === event.pointerId) handleDrag = null;
    if (rightRotate && rightRotate.pointerId === event.pointerId) rightRotate = null;
    if (pinch && (event.pointerId === pinch.a || event.pointerId === pinch.b)) pinch = null;

    if (id === undefined || id === null) {
      if (current !== board) emit(current);
      return;
    }
    const next = trySnapPiece(current, id, activeProfile, cellW, cellH);
    if (next !== board) emit(next);
  }

  $effect(() => {
    const move = (event: PointerEvent) => onPointerMove(event);
    const up = (event: PointerEvent) => release(event);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  });

  function slotStyle(col: number, row: number): string {
    return `left:${(col / (board?.cols ?? 1)) * 100}%;top:${((row) / (board?.rows ?? 1)) * 100}%;width:${100 / (board?.cols ?? 1)}%;height:${100 / (board?.rows ?? 1)}%`;
  }

  function pieceStyle(piece: { x: number; y: number; angle: number; locked: boolean; id: number }, dragging: boolean): string {
    const left = boardX + piece.x * cellW;
    const top = boardY + piece.y * cellH;
    const z = piece.locked ? 2 : dragging || (board?.sel === piece.id) ? 40 : 10 + piece.id;
    return [
      `left:${left}px`,
      `top:${top}px`,
      `width:${cellW + tab * 2}px`,
      `height:${cellH + tab * 2}px`,
      `transform:translate(-50%, -50%) rotate(${piece.angle}deg)`,
      `z-index:${z}`,
    ].join(';');
  }

  function imageAttrs(col: number, row: number): { x: number; y: number; width: number; height: number } {
    return {
      x: -col * cellW,
      y: -row * cellH,
      width: (board?.cols ?? 1) * cellW,
      height: (board?.rows ?? 1) * cellH,
    };
  }
</script>

{#if board}
  <div
    class="play"
    bind:this={playEl}
    data-testid="jigsaw-board"
    data-cols={board.cols}
    data-rows={board.rows}
    data-rotation={board.rotation}
    data-diff={board.profileId}
    data-complete={jigComplete(board) ? 'true' : 'false'}
    data-seed={board.seed}
    style="--aspect:{aspect}"
    oncontextmenu={(event) => event.preventDefault()}
  >
    <div class="frame" bind:this={boardEl} data-testid="jigsaw-frame">
      {#if activeProfile.hint.highlightTarget}
        <div class="ghost" style="background-image:url('{imageSrc}')" aria-hidden="true"></div>
      {/if}
      {#each board.pieces as piece (piece.id)}
        <div
          class="slot"
          class:filled={piece.locked}
          data-testid="jigsaw-slot-{piece.id}"
          data-col={piece.col}
          data-row={piece.row}
          style={slotStyle(piece.col, piece.row)}
        ></div>
      {/each}
    </div>

    {#each board.pieces as piece (piece.id)}
      {@const dragging = drags.some((item) => item.ids.includes(piece.id)) || (pinch?.pieceId === piece.id) || handleDrag?.id === piece.id || rightRotate?.id === piece.id}
      {@const d = piecePath(board.edges[piece.id], cellW, cellH, tab)}
      {@const img = imageAttrs(piece.col, piece.row)}
      {@const clipId = `jig-clip-${board.seed}-${piece.id}`}
      <div
        class="piece"
        class:locked={piece.locked}
        class:sel={board.sel === piece.id && !piece.locked}
        class:dragging
        data-testid="jigsaw-piece-{piece.id}"
        data-col={piece.col}
        data-row={piece.row}
        data-locked={piece.locked ? 'true' : 'false'}
        data-angle={piece.angle}
        data-x={piece.x}
        data-y={piece.y}
        style={pieceStyle(piece, dragging)}
        role="button"
        tabindex={piece.locked ? -1 : 0}
        aria-label="ชิ้น {piece.id + 1}"
        aria-disabled={piece.locked}
        onpointerdown={(event) => downOnPiece(event, piece.id)}
      >
        <svg
          viewBox="{-tab} {-tab} {cellW + tab * 2} {cellH + tab * 2}"
          width="100%"
          height="100%"
          aria-hidden="true"
        >
          <defs>
            <filter id="jig-shadow-{clipId}" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="1.2" dy="2.2" stdDeviation="1.4" flood-color="#2a1608" flood-opacity="0.45" />
            </filter>
            <clipPath id={clipId}><path d={d} /></clipPath>
          </defs>
          <g filter="url(#jig-shadow-{clipId})">
            <image
              href={imageSrc}
              x={img.x}
              y={img.y}
              width={img.width}
              height={img.height}
              clip-path="url(#{clipId})"
              preserveAspectRatio="none"
            />
            <path d={d} fill="none" class="wood" />
            <path d={d} fill="none" class="edge" />
          </g>
        </svg>
      </div>
    {/each}
  </div>
{/if}

<style>
  .play {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    touch-action: none;
    overflow: hidden;
    background:
      radial-gradient(circle at 30% 20%, rgba(255, 236, 200, 0.16), transparent 50%),
      linear-gradient(180deg, #3d2a1c, #2a1b12 70%);
    border-radius: 14px;
    box-shadow: inset 0 0 0 2px #7a5230;
  }
  .frame {
    position: absolute;
    left: 50%;
    top: 4px;
    bottom: 8px;
    width: auto;
    max-width: 94%;
    max-height: calc(100% - 12px);
    height: auto;
    aspect-ratio: var(--aspect, 0.75);
    transform: translateX(-50%);
    background: #efe2c8;
    border: 10px solid #6b4328;
    border-radius: 8px;
    box-shadow: 0 6px 0 #3a2414, inset 0 0 0 2px #c9a36a;
    box-sizing: border-box;
  }
  .ghost {
    position: absolute;
    inset: 0;
    background-size: 100% 100%;
    opacity: 0.2;
    pointer-events: none;
  }
  .slot {
    position: absolute;
    box-sizing: border-box;
    border: 1px dashed rgba(80, 50, 20, 0.28);
    pointer-events: none;
  }
  .slot.filled { border-color: transparent; }
  .piece {
    position: absolute;
    touch-action: none;
    user-select: none;
    cursor: grab;
    filter: none;
  }
  .piece.dragging { cursor: grabbing; }
  .piece.locked { cursor: default; pointer-events: none; }
  .piece.sel:not(.locked) { filter: drop-shadow(0 0 6px #39e0ff); }
  .piece svg { display: block; overflow: visible; pointer-events: none; }
  .wood {
    stroke: #3b2414;
    stroke-width: 2.4;
    stroke-linejoin: round;
  }
  .edge {
    stroke: rgba(255, 232, 196, 0.55);
    stroke-width: 1;
    stroke-linejoin: round;
  }
  .rot {
    position: absolute;
    left: 50%;
    top: -2px;
    width: 28px;
    height: 28px;
    transform: translate(-50%, -110%);
    border: 2px solid #f3e2c2;
    border-radius: 50%;
    background: #6b4328;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
    padding: 0;
    cursor: pointer;
    touch-action: none;
  }
  .rot::before {
    content: '';
    position: absolute;
    inset: 6px;
    border: 2px solid #f3e2c2;
    border-left-color: transparent;
    border-radius: 50%;
  }
</style>
