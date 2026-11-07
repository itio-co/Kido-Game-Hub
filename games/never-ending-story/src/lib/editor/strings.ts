/**
 * Typed facade over the editor strings. The text itself lives in `src/locales/<locale>.json` (English is the source
 * language; keys are dotted English). Constant entries are getters so they re-read the active locale on every access
 * and Svelte re-renders when the editor language is switched.
 */
import { t } from '../i18n/core.ts';

const AXES = ['X', 'Y', 'Z'] as const;
const onOff = (on: boolean): string => t(on ? 'editor.common.on' : 'editor.common.off');
const st = (on: boolean) => ({ state: onOff(on) });

export const T = {
  common: {
    get on() {
      return t('editor.common.on');
    },
    get off() {
      return t('editor.common.off');
    },
    onOff,
    lines: (n: number) => t('editor.common.lines', { n }),
    get undo() {
      return t('editor.common.undo');
    },
    get redo() {
      return t('editor.common.redo');
    },
    get redoNext() {
      return t('editor.common.redoNext');
    },
    get undoAria() {
      return t('editor.common.undoAria');
    },
    get redoAria() {
      return t('editor.common.redoAria');
    },
    mm: (v: string | number) => t('editor.common.mm', { v }),
  },

  /** 2D view-window zoom / pan of the mock-up and camera-match stage. */
  stage: {
    get zoomIn() {
      return t('editor.stage.zoomIn');
    },
    get zoomOut() {
      return t('editor.stage.zoomOut');
    },
    get fit() {
      return t('editor.stage.fit');
    },
    zoomLabel: (pct: number) => t('editor.stage.zoomLabel', { pct }),
    get mockHint() {
      return t('editor.stage.mockHint');
    },
    get focus() {
      return t('editor.stage.focus');
    },
    get focusTitle() {
      return t('editor.stage.focusTitle');
    },
    get crop() {
      return t('editor.stage.crop');
    },
    get cropTitle() {
      return t('editor.stage.cropTitle');
    },
    get follow() {
      return t('editor.stage.follow');
    },
    get followTitle() {
      return t('editor.stage.followTitle');
    },
  },

  /** Part origin: Set Origin, Affect Only Origins and the 3D cursor (Blender names). */
  origin: {
    get heading() {
      return t('editor.origin.heading');
    },
    get options() {
      return t('editor.origin.options');
    },
    get transform() {
      return t('editor.origin.transform');
    },
    get affectOnly() {
      return t('editor.origin.affectOnly');
    },
    get origins() {
      return t('editor.origin.origins');
    },
    get affect() {
      return t('editor.origin.affect');
    },
    get affectTitle() {
      return t('editor.origin.affectTitle');
    },
    get affectOnHint() {
      return t('editor.origin.affectOnHint');
    },
    get noRotate() {
      return t('editor.origin.noRotate');
    },
    toast: (on: boolean) => t('editor.origin.toast', st(on)),
    get setOrigin() {
      return t('editor.origin.setOrigin');
    },
    get toGeometry() {
      return t('editor.origin.toGeometry');
    },
    get toCursor() {
      return t('editor.origin.toCursor');
    },
    get geometryToOrigin() {
      return t('editor.origin.geometryToOrigin');
    },
    get toBottom() {
      return t('editor.origin.toBottom');
    },
    get reset() {
      return t('editor.origin.reset');
    },
    get local() {
      return t('editor.origin.local');
    },
    get world() {
      return t('editor.origin.world');
    },
    get localSub() {
      return t('editor.origin.localSub');
    },
    get worldSub() {
      return t('editor.origin.worldSub');
    },
    get spaceAria() {
      return t('editor.origin.spaceAria');
    },
    snapped: (kind: 'vertex' | 'edge' | 'face' | 'bbox' | 'grid') => t('editor.origin.snapped', { what: t(`editor.origin.kind.${kind}`) }),
  },
  cursor: {
    get place() {
      return t('editor.cursor.place');
    },
    get placeTitle() {
      return t('editor.cursor.placeTitle');
    },
    get hint() {
      return t('editor.cursor.hint');
    },
    get reset() {
      return t('editor.cursor.reset');
    },
  },
  tool: {
    get aria() {
      return t('editor.tool.aria');
    },
    get move() {
      return t('editor.tool.move');
    },
    get rotate() {
      return t('editor.tool.rotate');
    },
    get scale() {
      return t('editor.tool.scale');
    },
    get moveTitle() {
      return t('editor.tool.moveTitle');
    },
    get rotateTitle() {
      return t('editor.tool.rotateTitle');
    },
    get scaleTitle() {
      return t('editor.tool.scaleTitle');
    },
  },
  /** Status / header text of a running G / R / S modal transform. */
  modal: {
    name: (kind: 'grab' | 'rotate' | 'scale') => t(`editor.modal.${kind}`),
    get originOnly() {
      return t('editor.modal.originOnly');
    },
    free: (x: string, y: string, z: string) => t('editor.modal.free', { x, y, z }),
    dist: (v: string) => t('editor.modal.dist', { v }),
    rot: (v: string) => t('editor.modal.rot', { v }),
    factor: (v: string) => t('editor.modal.factor', { v }),
    along: (space: 'global' | 'local', axis: string) => t('editor.modal.along', { space: t(`editor.modal.${space}`), axis }),
    keys: (snapOn: boolean) => t('editor.modal.keys', { snap: onOff(snapOn) }),
  },
  get keysTip() {
    return t('editor.keys.tip');
  },
  del: {
    get confirm() {
      return t('editor.del.confirm');
    },
    get ok() {
      return t('editor.del.ok');
    },
    get cancel() {
      return t('editor.del.cancel');
    },
  },
  get selectAll() {
    return t('editor.select.all');
  },
  /** Whole-object placement (Object mode on the root). */
  place: {
    get scope() {
      return t('editor.place.scope');
    },
    get scopePart() {
      return t('editor.place.scopePart');
    },
    get scopeObject() {
      return t('editor.place.scopeObject');
    },
    get scopePartTitle() {
      return t('editor.place.scopePartTitle');
    },
    get scopeObjectTitle() {
      return t('editor.place.scopeObjectTitle');
    },
    get rootRow() {
      return t('editor.place.rootRow');
    },
    rootRowSub: (name: string) => t('editor.place.rootRowSub', { name }),
    get heading() {
      return t('editor.place.heading');
    },
    get location() {
      return t('editor.place.location');
    },
    get rotation() {
      return t('editor.place.rotation');
    },
    get scale() {
      return t('editor.place.scale');
    },
    dims: (x: string, y: string, z: string, base: string) => t('editor.place.dims', { x, y, z, base }),
    get scaleLocked() {
      return t('editor.place.scaleLocked');
    },
    get scaleUnlock() {
      return t('editor.place.scaleUnlock');
    },
    get scaleWarn() {
      return t('editor.place.scaleWarn');
    },
    get scaleBlocked() {
      return t('editor.place.scaleBlocked');
    },
    get floorSnap() {
      return t('editor.place.floorSnap');
    },
    get floorSnapTitle() {
      return t('editor.place.floorSnapTitle');
    },
    get dropToFloor() {
      return t('editor.place.dropToFloor');
    },
    get clear() {
      return t('editor.place.clear');
    },
    clearOf: (kind: 'position' | 'rotation' | 'scale') =>
      t(kind === 'position' ? 'editor.place.clearLocation' : kind === 'rotation' ? 'editor.place.clearRotation' : 'editor.place.clearScale'),
    cleared: (what: string) => t('editor.place.cleared', { what }),
    get cameraNote() {
      return t('editor.place.cameraNote');
    },
    get bake() {
      return t('editor.place.bake');
    },
    get bakeTitle() {
      return t('editor.place.bakeTitle');
    },
    get axes() {
      return [t('editor.place.axisX'), t('editor.place.axisY'), t('editor.place.axisZ')];
    },
  },
  /** Part panel labels, Blender axis names; fields stay in glTF order (x, y = up, z = front). */
  part: {
    get position() {
      return t('editor.part.position');
    },
    get size() {
      return t('editor.part.size');
    },
    get rotation() {
      return t('editor.part.rotation');
    },
    get posLabels() {
      return [t('editor.part.posX'), t('editor.part.posZ'), t('editor.part.posY')];
    },
    get sizeLabels() {
      return [t('editor.part.width'), t('editor.part.height'), t('editor.part.depth')];
    },
    get rotLabels() {
      return [t('editor.part.rotX'), t('editor.part.rotZ'), t('editor.part.rotY')];
    },
  },
  sidebarToast: (on: boolean) => t('editor.sidebar.toast', st(on)),

  /** Showing an overlay: while dragging / always / never. */
  showModes: {
    get drag() {
      return t('editor.match.showModes.drag');
    },
    get always() {
      return t('editor.match.showModes.always');
    },
    get off() {
      return t('editor.match.showModes.off');
    },
  },

  groups: {
    get object() {
      return t('editor.match.groups.object');
    },
    get room() {
      return t('editor.match.groups.room');
    },
    get pickerAria() {
      return t('editor.match.groups.pickerAria');
    },
    get cropButton() {
      return t('editor.match.groups.cropButton');
    },
    get wideButton() {
      return t('editor.match.groups.wideButton');
    },
    get cropToast() {
      return t('editor.match.groups.cropToast');
    },
    get wideToast() {
      return t('editor.match.groups.wideToast');
    },
    get editing() {
      return t('editor.match.groups.editing');
    },
    lineOf: (group: string) => t('editor.match.groups.lineOf', { group }),
    count: (n: number) => t('editor.match.groups.count', { n }),
    otherCount: (group: string, n: number) => t('editor.match.groups.otherCount', { group, n }),
    get roomHowTo() {
      return t('editor.match.groups.roomHowTo');
    },
    get objectHowTo() {
      return t('editor.match.groups.objectHowTo');
    },
    get sharedCamera() {
      return t('editor.match.groups.sharedCamera');
    },
    ghost: (group: string, on: boolean) => t('editor.match.groups.ghost', { group, ...st(on) }),
    rays: (on: boolean) => t('editor.match.groups.rays', st(on)),
    get roomSeedNote() {
      return t('editor.match.groups.roomSeedNote');
    },
  },

  snap: {
    get label() {
      return t('editor.match.snap.label');
    },
    get title() {
      return t('editor.match.snap.title');
    },
    button: (on: boolean) => t('editor.match.snap.button', st(on)),
    toast: (on: boolean) => t('editor.match.snap.toast', st(on)),
    get unlink() {
      return t('editor.match.snap.unlink');
    },
    get unlinked() {
      return t('editor.match.snap.unlinked');
    },
    get undoLinesAria() {
      return t('editor.match.snap.undoLinesAria');
    },
    get redoLinesAria() {
      return t('editor.match.snap.redoLinesAria');
    },
    kinds: {
      get endpoint() {
        return t('editor.match.snap.kinds.endpoint');
      },
      get intersection() {
        return t('editor.match.snap.kinds.intersection');
      },
      get segment() {
        return t('editor.match.snap.kinds.segment');
      },
    },
    get cornerSplit() {
      return t('editor.match.snap.cornerSplit');
    },
    get cornerLinked() {
      return t('editor.match.snap.cornerLinked');
    },
    get dragLineAria() {
      return t('editor.match.snap.dragLineAria');
    },
    get endpointAria() {
      return t('editor.match.snap.endpointAria');
    },
    get tipDrag() {
      return t('editor.match.snap.tipDrag');
    },
    get tipLinked() {
      return t('editor.match.snap.tipLinked');
    },
    get tipLinkedRest() {
      return t('editor.match.snap.tipLinkedRest');
    },
    get tipHold() {
      return t('editor.match.snap.tipHold');
    },
    get tipHoldRest() {
      return t('editor.match.snap.tipHoldRest');
    },
    tipLinkedEnds: (n: number) => t('editor.match.snap.tipLinkedEnds', { n }),
  },

  /** Master guide line per axis. `name` = a line label such as "X2". */
  master: {
    get set() {
      return t('editor.match.master.set');
    },
    setTitle: (axis: string) => t('editor.match.master.setTitle', { axis }),
    label: (axis: string) => t('editor.match.master.label', { axis }),
    selectAria: (axis: string) => t('editor.match.master.selectAria', { axis }),
    option: (name: string) => t('editor.match.master.option', { name }),
    get cycle() {
      return t('editor.match.master.cycle');
    },
    cycleAria: (axis: string) => t('editor.match.master.cycleAria', { axis }),
    isMaster: (axis: string) => t('editor.match.master.isMaster', { axis }),
    setToast: (name: string, axis: string) => t('editor.match.master.setToast', { name, axis }),
    promoted: (name: string, axis: string) => t('editor.match.master.promoted', { name, axis }),
    onlyMaster: (axis: string) => t('editor.match.master.onlyMaster', { axis }),
    get menuAria() {
      return t('editor.match.master.menuAria');
    },
    get menuClose() {
      return t('editor.match.master.menuClose');
    },
    get legend() {
      return t('editor.match.master.legend');
    },
    get legendText() {
      return t('editor.match.master.legendText');
    },
    get deleteSelected() {
      return t('editor.match.master.deleteSelected');
    },
    label2: (axis: string) => t('editor.match.master.label2', { axis }),
    select2Aria: (axis: string) => t('editor.match.master.select2Aria', { axis }),
    get none() {
      return t('editor.match.master.none');
    },
    get toggleSet() {
      return t('editor.match.master.toggleSet');
    },
    get toggleUnset() {
      return t('editor.match.master.toggleUnset');
    },
    toggleTitle: (axis: string) => t('editor.match.master.toggleTitle', { axis }),
    isMaster1: (axis: string) => t('editor.match.master.isMaster1', { axis }),
    isMaster2: (axis: string) => t('editor.match.master.isMaster2', { axis }),
    get addSecond() {
      return t('editor.match.master.addSecond');
    },
    replaceOldest: (name: string) => t('editor.match.master.replaceOldest', { name }),
    secondToast: (name: string, axis: string) => t('editor.match.master.secondToast', { name, axis }),
    replacedOldestToast: (old: string, m1: string, m2: string, axis: string) => t('editor.match.master.replacedOldestToast', { old, m1, m2, axis }),
    parallelOne: (name: string, axis: string) => t('editor.match.master.parallelOne', { name, axis }),
    parallelIgnored: (name: string) => t('editor.match.master.parallelIgnored', { name }),
    unsetToast: (name: string, axis: string) => t('editor.match.master.unsetToast', { name, axis }),
    keepOne: (axis: string) => t('editor.match.master.keepOne', { axis }),
    nearParallel: (axis: string, deg: string) => t('editor.match.master.nearParallel', { axis, deg }),
    get degenerate() {
      return t('editor.match.master.degenerate');
    },
    edgeKept: (n: number) => t('editor.match.master.edgeKept', { n }),
  },

  vp: {
    get heading() {
      return t('editor.match.vp.heading');
    },
    get headingNote() {
      return t('editor.match.vp.headingNote');
    },
    get parallelTag() {
      return t('editor.match.vp.parallelTag');
    },
    outliers: (n: number) => t('editor.match.vp.outliers', { n }),
    get needTwo() {
      return t('editor.match.vp.needTwo');
    },
    consolidateAxis: (axis: string) => t('editor.match.vp.consolidateAxis', { axis }),
    parallelAxis: (axis: string) => t('editor.match.vp.parallelAxis', { axis }),
    get consolidateTitle() {
      return t('editor.match.vp.consolidateTitle');
    },
    get parallelTitle() {
      return t('editor.match.vp.parallelTitle');
    },
    hintFar: (diag: string) => t('editor.match.vp.hintFar', { diag }),
    hintCheap: (deg: string) => t('editor.match.vp.hintCheap', { deg }),
    hint: (axis: string, why: string) => t('editor.match.vp.hint', { axis, why }),
    get consolidateAll() {
      return t('editor.match.vp.consolidateAll');
    },
    lock: (on: boolean) => t('editor.match.vp.lock', st(on)),
    lockToast: (on: boolean) => t(on ? 'editor.match.vp.lockToastOn' : 'editor.match.vp.lockToastOff'),
    get legendColor() {
      return t('editor.match.vp.legendColor');
    },
    get legendOutlier() {
      return t('editor.match.vp.legendOutlier');
    },
    get legendConsolidate() {
      return t('editor.match.vp.legendConsolidate');
    },
    get legendConsolidateText() {
      return t('editor.match.vp.legendConsolidateText');
    },
    get legendLock() {
      return t('editor.match.vp.legendLock');
    },
    get legendLockText() {
      return t('editor.match.vp.legendLockText');
    },
    get legendParallel() {
      return t('editor.match.vp.legendParallel');
    },
    get legendParallelText() {
      return t('editor.match.vp.legendParallelText');
    },
    overlayParallel: (axis: string) => t('editor.match.vp.overlayParallel', { axis }),
    // consolidate() results
    axisName: (axis: number) => t('editor.match.vp.axisName', { axis: AXES[axis] ?? '?' }),
    needTwoBefore: (name: string, parallel: boolean) =>
      t(parallel ? 'editor.match.vp.needTwoBeforeParallel' : 'editor.match.vp.needTwoBeforeConsolidate', {
        name: name || t('editor.match.vp.sameAxis'),
      }),
    madeParallel: (name: string, n: number) => t('editor.match.vp.madeParallel', { name, n }),
    alreadyParallel: (name: string) => t('editor.match.vp.alreadyParallel', { name }),
    consolidated: (name: string, n: number) => t('editor.match.vp.consolidated', { name, n }),
    alreadyConsolidated: (name: string) => t('editor.match.vp.alreadyConsolidated', { name }),
    skippedLinked: (n: number) => t('editor.match.vp.skippedLinked', { n }),
    get skipBothLinked() {
      return t('editor.match.vp.skipBothLinked');
    },
    get skipPivotAtVp() {
      return t('editor.match.vp.skipPivotAtVp');
    },
    // solver messages
    get onePointNoLens() {
      return t('editor.match.vp.onePointNoLens');
    },
    get oneRealVpNoLens() {
      return t('editor.match.vp.oneRealVpNoLens');
    },
    get principalNeedsThree() {
      return t('editor.match.vp.principalNeedsThree');
    },
  },

  /** Line detection on the edge view (candidates → guide lines). */
  detect: {
    get heading() {
      return t('editor.match.detect.heading');
    },
    get headingNote() {
      return t('editor.match.detect.headingNote');
    },
    get run() {
      return t('editor.match.detect.run');
    },
    get runTitle() {
      return t('editor.match.detect.runTitle');
    },
    running: (pct: number) => t('editor.match.detect.running', { pct }),
    found: (n: number, x: number, y: number, z: number, u: number) => t('editor.match.detect.found', { n, x, y, z, u }),
    get none() {
      return t('editor.match.detect.none');
    },
    minLen: (px: number) => t('editor.match.detect.minLen', { px }),
    acceptAll: (axis: string) => t('editor.match.detect.acceptAll', { axis }),
    acceptedAll: (n: number, axis: string) => t('editor.match.detect.acceptedAll', { n, axis }),
    accepted: (name: string) => t('editor.match.detect.accepted', { name }),
    get needAxis() {
      return t('editor.match.detect.needAxis');
    },
    get clear() {
      return t('editor.match.detect.clear');
    },
    get cleared() {
      return t('editor.match.detect.cleared');
    },
    axisSet: (axis: string) => t('editor.match.detect.axisSet', { axis }),
    get chooserAria() {
      return t('editor.match.detect.chooserAria');
    },
    chooserAccept: (axis: string) => t('editor.match.detect.chooserAccept', { axis }),
    get legend() {
      return t('editor.match.detect.legend');
    },
  },

  /** Axis origin of the mock-up view (not the part origin, T.origin). */
  axisOrigin: {
    get heading() {
      return t('editor.match.axisOrigin.heading');
    },
    get headingNote() {
      return t('editor.match.axisOrigin.headingNote');
    },
    get notSet() {
      return t('editor.match.axisOrigin.notSet');
    },
    setAt: (x: number, y: number) => t('editor.match.axisOrigin.setAt', { x, y }),
    fromOther: (group: string) => t('editor.match.axisOrigin.fromOther', { group }),
    candidates: (n: number) => t('editor.match.axisOrigin.candidates', { n }),
    get noCandidates() {
      return t('editor.match.axisOrigin.noCandidates');
    },
    get useDetected() {
      return t('editor.match.axisOrigin.useDetected');
    },
    get place() {
      return t('editor.match.axisOrigin.place');
    },
    get placeTitle() {
      return t('editor.match.axisOrigin.placeTitle');
    },
    get modeOn() {
      return t('editor.match.axisOrigin.modeOn');
    },
    get clear() {
      return t('editor.match.axisOrigin.clear');
    },
    get cleared() {
      return t('editor.match.axisOrigin.cleared');
    },
    get set() {
      return t('editor.match.axisOrigin.set');
    },
    get setNoCam() {
      return t('editor.match.axisOrigin.setNoCam');
    },
    flip: (axis: string) => t('editor.match.axisOrigin.flip', { axis }),
    flipTitle: (axis: string, other: string) => t('editor.match.axisOrigin.flipTitle', { axis, other }),
    flipped: (a: string, b: string, c: string) => t('editor.match.axisOrigin.flipped', { a, b, c }),
    get objectNote() {
      return t('editor.match.axisOrigin.objectNote');
    },
    get roomNote() {
      return t('editor.match.axisOrigin.roomNote');
    },
    get legend() {
      return t('editor.match.axisOrigin.legend');
    },
    candAria: (i: number) => t('editor.match.axisOrigin.candAria', { i }),
    get handleAria() {
      return t('editor.match.axisOrigin.handleAria');
    },
  },

  edges: {
    get heading() {
      return t('editor.match.edges.heading');
    },
    get headingNote() {
      return t('editor.match.edges.headingNote');
    },
    get loading() {
      return t('editor.match.edges.loading');
    },
    get showAria() {
      return t('editor.match.edges.showAria');
    },
    get line() {
      return t('editor.match.edges.line');
    },
    get none() {
      return t('editor.match.edges.none');
    },
    get noneNearLine() {
      return t('editor.match.edges.noneNearLine');
    },
    offBy: (px: string) => t('editor.match.edges.offBy', { px }),
    score: (score: number, coverage: number) => t('editor.match.edges.score', { score, coverage }),
    get snapped() {
      return t('editor.match.edges.snapped');
    },
    get loupeSnapped() {
      return t('editor.match.edges.loupeSnapped');
    },
    loupeOff: (px: string) => t('editor.match.edges.loupeOff', { px }),
    get refineSelected() {
      return t('editor.match.edges.refineSelected');
    },
    get refineAll() {
      return t('editor.match.edges.refineAll');
    },
    snapWhileDrag: (on: boolean) => t('editor.match.edges.snapWhileDrag', st(on)),
    snapWhileDragToast: (on: boolean) =>
      t(on ? 'editor.match.edges.snapWhileDragToastOn' : 'editor.match.edges.snapWhileDragToastOff'),
    get legendLead() {
      return t('editor.match.edges.legendLead');
    },
    get legendRefine() {
      return t('editor.match.edges.legendRefine');
    },
    get legendRefineText() {
      return t('editor.match.edges.legendRefineText');
    },
    // edgeAlign / refine results
    get bothLinked() {
      return t('editor.match.edges.bothLinked');
    },
    get noClearEdge() {
      return t('editor.match.edges.noClearEdge');
    },
    refinedOne: (before: string, after: string) => t('editor.match.edges.refinedOne', { before, after }),
    get alreadyOnEdge() {
      return t('editor.match.edges.alreadyOnEdge');
    },
    get preparing() {
      return t('editor.match.edges.preparing');
    },
    get selectFirst() {
      return t('editor.match.edges.selectFirst');
    },
    refinedMany: (n: number, before: string, after: string) => t('editor.match.edges.refinedMany', { n, before, after }),
    get nothingToRefine() {
      return t('editor.match.edges.nothingToRefine');
    },
    skippedLinked: (n: number) => t('editor.match.edges.skippedLinked', { n }),
  },

  diff: {
    get aria() {
      return t('editor.match.diff.aria');
    },
    get label() {
      return t('editor.match.diff.label');
    },
    get badge() {
      return t('editor.match.diff.badge');
    },
    get solveFailed() {
      return t('editor.match.diff.solveFailed');
    },
  },

  room: {
    get aligned() {
      return t('editor.match.room.aligned');
    },
    get yawLead() {
      return t('editor.match.room.yawLead');
    },
    yawRest: (deg: string) => t('editor.match.room.yawRest', { deg }),
    get agreement() {
      return t('editor.match.room.agreement');
    },
    get bandGood() {
      return t('editor.match.room.bandGood');
    },
    get bandWarn() {
      return t('editor.match.room.bandWarn');
    },
    get bandBad() {
      return t('editor.match.room.bandBad');
    },
    max: (deg: string) => t('editor.match.room.max', { deg }),
    get drawBoth() {
      return t('editor.match.room.drawBoth');
    },
    highlighted: (n: number, axis: string) => t('editor.match.room.highlighted', { n, axis }),
    get needTwoBoth() {
      return t('editor.match.room.needTwoBoth');
    },
    get diffParallel() {
      return t('editor.match.room.diffParallel');
    },
    get diffVp() {
      return t('editor.match.room.diffVp');
    },
    notParallel: (groups: string) => t('editor.match.room.notParallel', { groups }),
    get showLines() {
      return t('editor.match.room.showLines');
    },
    lenses: (obj: string, room: string) => t('editor.match.room.lenses', { obj, room }),
    get legendAngle() {
      return t('editor.match.room.legendAngle');
    },
    get legendLens() {
      return t('editor.match.room.legendLens');
    },
    get legendTap() {
      return t('editor.match.room.legendTap');
    },
    solvedFromLines: (groups: boolean, lens: string, yaw: string | null, extra: string | null) =>
      t('editor.match.room.solvedFromLines', {
        groups: groups ? t('editor.match.room.solvedGroupsTag') : '',
        lens,
        yaw: yaw === null ? '' : t('editor.match.room.solvedYawTag', { deg: yaw }),
        extra: extra ? t('editor.match.room.solvedExtraTag', { extra }) : '',
      }),
    get needTwoInTwoAxes() {
      return t('editor.match.room.needTwoInTwoAxes');
    },
    get solveFailed() {
      return t('editor.match.room.solveFailed');
    },
    get needXYBoth() {
      return t('editor.match.room.needXYBoth');
    },
  },

  files: {
    get openedDraft() {
      return t('editor.files.openedDraft');
    },
    get openedFile() {
      return t('editor.files.openedFile');
    },
    get statusNew() {
      return t('editor.files.statusNew');
    },
    get statusModified() {
      return t('editor.files.statusModified');
    },
    get noApi() {
      return t('editor.files.noApi');
    },
    get glbFailed() {
      return t('editor.files.glbFailed');
    },
    get nothingToSave() {
      return t('editor.files.nothingToSave');
    },
    saveFailed: (err: string) => t('editor.files.saveFailed', { err }),
    saved: (n: number) => t('editor.files.saved', { n }),
    get revertConfirm() {
      return t('editor.files.revertConfirm');
    },
    get reverted() {
      return t('editor.files.reverted');
    },
    downloaded: (name: string, dir: string) => t('editor.files.downloaded', { name, dir }),
    get copyFailed() {
      return t('editor.files.copyFailed');
    },
    get unsaved() {
      return t('editor.files.unsaved');
    },
    get saveButton() {
      return t('editor.files.saveButton');
    },
    get saving() {
      return t('editor.files.saving');
    },
    get keepDraft() {
      return t('editor.files.keepDraft');
    },
    get revert() {
      return t('editor.files.revert');
    },
    get heading() {
      return t('editor.files.heading');
    },
    get download() {
      return t('editor.files.download');
    },
    get inSync() {
      return t('editor.files.inSync');
    },
    get noFilesYet() {
      return t('editor.files.noFilesYet');
    },
    get includeGlb() {
      return t('editor.files.includeGlb');
    },
    get includeGlbNote() {
      return t('editor.files.includeGlbNote');
    },
    get savedList() {
      return t('editor.files.savedList');
    },
    get thenCommit() {
      return t('editor.files.thenCommit');
    },
    get copied() {
      return t('editor.files.copied');
    },
    get copyCommand() {
      return t('editor.files.copyCommand');
    },
    get devHintLead() {
      return t('editor.files.devHintLead');
    },
    get devHintIn() {
      return t('editor.files.devHintIn');
    },
    get devHintThen() {
      return t('editor.files.devHintThen');
    },
    get devHintTail() {
      return t('editor.files.devHintTail');
    },
  },
} as const;
