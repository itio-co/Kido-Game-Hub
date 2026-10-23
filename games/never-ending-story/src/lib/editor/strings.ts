/**
 * User-facing strings of the editor features added in v0.2.9 (guide lines, VP modes, edge alignment,
 * object/room groups, source-file save).
 *
 * i18n prep: English is the source. `MESSAGES` is a flat table of dotted English keys, each with an English and a
 * Thai value, so a later i18n PR can dump it straight into `src/locales/en.json` / `th.json` (see `localeTable`).
 * Parameters use `{name}` placeholders. The UI currently renders `LOCALE` (Thai). Components and state modules use
 * the typed `T` facade below and must not carry inline Thai for these features.
 */

export type Locale = 'en' | 'th';
/** Locale rendered today (the app is Thai-only until the i18n PR). */
export const LOCALE: Locale = 'th';

export const MESSAGES = {
  // --- common -------------------------------------------------------------------------------------------------
  'editor.common.on': { en: 'on', th: 'เปิด' },
  'editor.common.off': { en: 'off', th: 'ปิด' },
  'editor.common.lines': { en: '{n} lines', th: '{n} เส้น' },
  'editor.common.undo': { en: '↶ Undo', th: '↶ ย้อน' },
  'editor.common.redo': { en: '↷ Redo', th: '↷ ทำซ้ำ' },
  'editor.common.redoNext': { en: '↷ Redo', th: '↷ ทำต่อ' },
  'editor.common.undoAria': { en: 'Undo', th: 'ย้อน (Undo)' },
  'editor.common.redoAria': { en: 'Redo', th: 'ทำซ้ำ (Redo)' },
  // --- stage zoom / pan (mock-up + camera-match views) ---------------------------------------------------------
  'editor.stage.zoomIn': { en: 'Zoom in', th: 'ซูมเข้า' },
  'editor.stage.zoomOut': { en: 'Zoom out', th: 'ซูมออก' },
  'editor.stage.fit': { en: 'Fit to screen', th: 'พอดีจอ' },
  'editor.stage.zoomLabel': { en: 'Zoom {pct}%', th: 'ซูม {pct}%' },
  'editor.stage.mockHint': {
    en: 'Zoom: mouse wheel / pinch · Pan: middle-, right- or Space+drag / two-finger drag · Fit: ⤢ or double-click / double-tap empty space · Focus: ◎, F or double-tap a part · Object crop: ▣. The model stays locked to the mock-up camera.',
    th: 'ซูม: ลูกกลิ้งเมาส์ / ถ่างสองนิ้ว · เลื่อนภาพ: ลากด้วยปุ่มกลาง ปุ่มขวา หรือกด Space ค้างแล้วลาก / ลากสองนิ้ว · พอดีจอ: ⤢ หรือดับเบิลคลิก / แตะสองครั้งที่พื้นที่ว่าง · โฟกัส: ◎, ปุ่ม F หรือแตะสองครั้งที่ชิ้นส่วน · ครอปวัตถุ: ▣ โมเดลยังล็อกกับกล้องของภาพ Mock-up',
  },
  'editor.stage.focus': { en: 'Focus', th: 'โฟกัส' },
  'editor.stage.focusTitle': {
    en: 'Frame the selected part (whole model if none) · F · double-tap a part',
    th: 'ซูมให้ชิ้นส่วนที่เลือกเต็มจอ (ทั้งโมเดลถ้าไม่ได้เลือก) · ปุ่ม F · แตะสองครั้งที่ชิ้นส่วน',
  },
  'editor.stage.crop': { en: 'Object crop', th: 'ครอปวัตถุ' },
  'editor.stage.cropTitle': {
    en: "Jump to the asset's mock-up crop (the object) — Fit shows the whole image",
    th: 'ไปที่กรอบครอปของภาพ Mock-up (ตัววัตถุ) — พอดีจอจะแสดงทั้งภาพ',
  },
  'editor.stage.follow': { en: 'Follow selection', th: 'ตามชิ้นที่เลือก' },
  'editor.stage.followTitle': {
    en: 'Re-frame the view whenever the selected part changes',
    th: 'ซูมไปที่ชิ้นส่วนใหม่ทุกครั้งที่เปลี่ยนการเลือก',
  },
  'editor.common.mm': { en: '{v} mm', th: '{v} มม.' },

  // --- part origin (pivot) editing -------------------------------------------------------------------------------
  'editor.pivot.mode': { en: 'Edit pivot', th: 'แก้จุดหมุน' },
  'editor.pivot.modeTitle': {
    en: 'Edit pivot (D): the arrows move only the origin, the part stays put · snaps to vertices, edge midpoints, face centres, box corners/centre and the grid · hold Alt for free movement',
    th: 'แก้จุดหมุน (ปุ่ม D): ลูกศรย้ายเฉพาะจุดหมุน ชิ้นส่วนอยู่ที่เดิม · ดูดเข้าจุดยอด กึ่งกลางขอบ กลางหน้า มุม/กลางกล่อง และกริด · กด Alt ค้างเพื่อย้ายอิสระ',
  },
  'editor.pivot.heading': { en: 'Pivot (origin)', th: 'จุดหมุน (Origin)' },
  'editor.pivot.center': { en: 'Pivot to center', th: 'จุดหมุนไปกลางชิ้น' },
  'editor.pivot.bottom': { en: 'Pivot to bottom center', th: 'จุดหมุนไปกลางฐาน' },
  'editor.pivot.pick': { en: 'Pivot to picked point', th: 'จุดหมุนไปจุดที่แตะ' },
  'editor.pivot.pickCancel': { en: 'Cancel picking', th: 'ยกเลิกการแตะเลือก' },
  'editor.pivot.reset': { en: 'Reset pivot', th: 'คืนจุดหมุนเดิม' },
  'editor.pivot.pickHint': {
    en: 'Tap / click a point on the selected part to put its pivot there (Esc cancels)',
    th: 'แตะ / คลิกจุดบนชิ้นที่เลือกเพื่อย้ายจุดหมุนไปที่นั่น (Esc ยกเลิก)',
  },
  'editor.pivot.local': { en: 'Local', th: 'ในชิ้น' },
  'editor.pivot.world': { en: 'World', th: 'ในฉาก' },
  'editor.pivot.localSub': {
    en: 'Pivot, cm · local: part axes, from the original GLB origin',
    th: 'จุดหมุน (ซม.) · ในชิ้น: แกนของชิ้นส่วน วัดจากจุดหมุนเดิมใน GLB',
  },
  'editor.pivot.worldSub': {
    en: 'Pivot, cm · world: scene axes (X right, Y up, Z front)',
    th: 'จุดหมุน (ซม.) · ในฉาก: แกนของฉาก (X ขวา, Y ขึ้น, Z หน้า)',
  },
  'editor.pivot.spaceAria': { en: 'Pivot coordinates', th: 'พิกัดจุดหมุน' },
  'editor.pivot.modeOnly': {
    en: 'Edit pivot: drag the arrows to move the origin (rotate / scale are off in this mode)',
    th: 'แก้จุดหมุน: ลากลูกศรเพื่อย้ายจุดหมุน (หมุน / ย่อขยายใช้ไม่ได้ในโหมดนี้)',
  },
  'editor.pivot.toast': { en: 'Edit pivot {state}', th: 'แก้จุดหมุน {state}' },
  'editor.pivot.snapped': { en: 'Pivot snapped to {what}', th: 'จุดหมุนดูดเข้า{what}' },
  'editor.pivot.kind.vertex': { en: 'a vertex', th: 'จุดยอด' },
  'editor.pivot.kind.edge': { en: 'an edge midpoint', th: 'กึ่งกลางขอบ' },
  'editor.pivot.kind.face': { en: 'a face centre', th: 'กลางหน้า' },
  'editor.pivot.kind.bbox': { en: 'the box', th: 'มุม/กลางกล่อง' },
  'editor.pivot.kind.grid': { en: 'the grid', th: 'กริด' },

  // --- master guide line (one per axis per group) ----------------------------------------------------------------
  'cameraMatch.master.set': { en: '★ Set as master', th: '★ ตั้งเป็นเส้นหลัก' },
  'cameraMatch.master.setTitle': {
    en: 'Make the selected {axis} line the master of its axis',
    th: 'ให้เส้น {axis} ที่เลือกเป็นเส้นหลักของแกนนี้',
  },
  'cameraMatch.master.label': { en: '★ Master {axis}', th: '★ เส้นหลัก {axis}' },
  'cameraMatch.master.selectAria': { en: 'Master line of axis {axis}', th: 'เส้นหลักของแกน {axis}' },
  'cameraMatch.master.option': { en: 'Line {name}', th: 'เส้น {name}' },
  'cameraMatch.master.cycle': { en: '⟳ Next', th: '⟳ ถัดไป' },
  'cameraMatch.master.cycleAria': { en: 'Make the next {axis} line the master', th: 'เลื่อนเส้นหลักแกน {axis} ไปเส้นถัดไป' },
  'cameraMatch.master.isMaster': { en: '★ Master of axis {axis}', th: '★ เส้นหลักของแกน {axis}' },
  'cameraMatch.master.setToast': {
    en: '★ Line {name} is now the master of axis {axis}',
    th: '★ เส้น {name} เป็นเส้นหลักของแกน {axis} แล้ว',
  },
  'cameraMatch.master.promoted': {
    en: 'Deleted the master of axis {axis} — line {name} (lowest residual) is the new master',
    th: 'ลบเส้นหลักแกน {axis} แล้ว — เส้น {name} (คลาดเคลื่อนน้อยสุด) เป็นเส้นหลักแทน',
  },
  'cameraMatch.master.onlyMaster': {
    en: 'Only the master so far — add another {axis} line',
    th: 'มีแต่เส้นหลัก — เพิ่มเส้น {axis} อีกเส้น',
  },
  'cameraMatch.master.menuAria': { en: 'Line actions', th: 'คำสั่งของเส้น' },
  'cameraMatch.master.menuClose': { en: 'Close', th: 'ปิด' },
  'cameraMatch.master.legend': { en: '★ Master', th: '★ เส้นหลัก' },
  'cameraMatch.master.deleteSelected': { en: 'Delete selected line', th: 'ลบเส้นที่เลือก' },
  'cameraMatch.master.legendText': {
    en: ': the reference line of its axis — the vanishing point lies on it (parallel: its direction), Merge / Parallel align the other lines to it and never move it · set it here, or long-press / right-click a line',
    th: ': เส้นอ้างอิงของแกน — จุดลับตาอยู่บนแนวเส้นนี้ (ขนาน: ใช้ทิศของมัน) ปุ่มรวม/ขนานจัดเส้นอื่นตามมันและไม่ขยับมัน · ตั้งได้ที่นี่ หรือกดค้าง/คลิกขวาที่เส้น',
  },

  // --- overlay show modes ---------------------------------------------------------------------------------------
  'cameraMatch.showModes.drag': { en: 'While dragging', th: 'ขณะลาก' },
  'cameraMatch.showModes.always': { en: 'Always', th: 'เปิดตลอด' },
  'cameraMatch.showModes.off': { en: 'Off', th: 'ปิด' },

  // --- object / room groups -------------------------------------------------------------------------------------
  'cameraMatch.groups.object': { en: 'object', th: 'วัตถุ' },
  'cameraMatch.groups.room': { en: 'room', th: 'ห้อง' },
  'cameraMatch.groups.pickerAria': { en: 'Image', th: 'ภาพที่ใช้' },
  'cameraMatch.groups.cropButton': { en: 'Crop · object', th: 'ภาพครอป · วัตถุ' },
  'cameraMatch.groups.wideButton': { en: 'Full mock-up · room', th: 'Mock-up เต็ม · ห้อง' },
  'cameraMatch.groups.cropToast': { en: 'Object lines (crop)', th: 'เส้นวัตถุ (ภาพครอป)' },
  'cameraMatch.groups.wideToast': { en: 'Room lines (full mock-up)', th: 'เส้นห้อง (Mock-up เต็ม)' },
  'cameraMatch.groups.editing': { en: 'Editing', th: 'กำลังแก้' },
  'cameraMatch.groups.lineOf': { en: '{group} lines', th: 'เส้น{group}' },
  'cameraMatch.groups.count': { en: '({n} lines)', th: '({n} เส้น)' },
  'cameraMatch.groups.otherCount': { en: '{n} {group} lines', th: 'เส้น{group} {n} เส้น' },
  'cameraMatch.groups.roomHowTo': {
    en: 'Trace walls, floor, ceiling, door/window frames',
    th: 'วาดตามผนัง พื้น เพดาน ขอบประตู/หน้าต่าง',
  },
  'cameraMatch.groups.objectHowTo': { en: 'Trace the edges of the object', th: 'วาดตามขอบของวัตถุ' },
  'cameraMatch.groups.sharedCamera': { en: 'Both sets share one camera', th: 'ทั้งสองชุดใช้กล้องตัวเดียวกัน' },
  'cameraMatch.groups.ghost': { en: '👻 Faint {group} lines {state}', th: '👻 เส้น{group}จาง ๆ {state}' },
  'cameraMatch.groups.rays': { en: '↔ Full rays {state}', th: '↔ เส้นต่อถึงขอบ {state}' },
  'cameraMatch.groups.roomSeedNote': {
    en: 'Place room lines yourself along walls, floor, ceiling, door (the current camera does not know the room shape)',
    th: 'เส้นห้องวางเองตามขอบผนัง พื้น เพดาน ประตู (กล้องปัจจุบันไม่รู้รูปทรงห้อง)',
  },

  // --- line snapping --------------------------------------------------------------------------------------------
  'cameraMatch.snap.label': { en: 'Line snap', th: 'แม่เหล็กเส้น' },
  'cameraMatch.snap.title': { en: 'Line snap (hold Alt = off temporarily)', th: 'แม่เหล็กเส้น (Alt ค้าง = ปิดชั่วคราว)' },
  'cameraMatch.snap.button': { en: '🧲 Line snap {state}', th: '🧲 แม่เหล็กเส้น {state}' },
  'cameraMatch.snap.toast': { en: 'Line snap: {state}', th: 'แม่เหล็กเส้น: {state}' },
  'cameraMatch.snap.unlink': { en: 'Unlink corners', th: 'แยกมุมที่เชื่อม' },
  'cameraMatch.snap.unlinked': { en: 'Unlinked the corners of the selected line', th: 'แยกมุมของเส้นที่เลือกแล้ว' },
  'cameraMatch.snap.undoLinesAria': { en: 'Undo line edit', th: 'ย้อนการแก้เส้น' },
  'cameraMatch.snap.redoLinesAria': { en: 'Redo line edit', th: 'ทำซ้ำการแก้เส้น' },
  'cameraMatch.snap.kinds.endpoint': { en: 'corner', th: 'มุม' },
  'cameraMatch.snap.kinds.intersection': { en: 'intersection', th: 'จุดตัด' },
  'cameraMatch.snap.kinds.segment': { en: 'on line', th: 'บนเส้น' },
  'cameraMatch.snap.cornerSplit': {
    en: 'Corner split — this line end now moves freely',
    th: 'แยกมุมแล้ว — ปลายเส้นนี้ลากได้อิสระ',
  },
  'cameraMatch.snap.cornerLinked': {
    en: 'Corner linked — the ends move together (long-press the corner to split)',
    th: 'เชื่อมมุมแล้ว — ลากไปด้วยกัน (กดค้างที่มุมเพื่อแยก)',
  },
  'cameraMatch.snap.dragLineAria': { en: 'Drag whole line', th: 'ลากทั้งเส้น' },
  'cameraMatch.snap.endpointAria': { en: 'Line end', th: 'ปลายเส้น' },
  'cameraMatch.snap.tipDrag': {
    en: 'Drag a line end (or the whole line) near a line of another axis to snap to its end, intersection or segment · snapped ends become ',
    th: 'ลากปลายเส้น (หรือลากทั้งเส้น) ไปใกล้เส้นแกนอื่น จะดูดติดปลายเส้น จุดตัด หรือบนเส้น · ปลายที่ดูดติดกันจะ',
  },
  'cameraMatch.snap.tipLinked': { en: 'one shared corner', th: 'เชื่อมเป็นมุมเดียว' },
  'cameraMatch.snap.tipLinkedRest': { en: ' (yellow box) and move together · ', th: ' (กรอบเหลือง) ลากไปด้วยกัน · ' },
  'cameraMatch.snap.tipHold': { en: 'Long-press', th: 'กดค้าง' },
  'cameraMatch.snap.tipHoldRest': {
    en: ' a corner to split it · hold Alt while dragging to turn snapping off temporarily',
    th: 'ที่มุมเพื่อแยก · กด Alt ค้างขณะลากเพื่อปิดแม่เหล็กชั่วคราว',
  },
  'cameraMatch.snap.tipLinkedEnds': { en: ' · {n} linked ends', th: ' · เชื่อมอยู่ {n} ปลาย' },

  // --- vanishing points -----------------------------------------------------------------------------------------
  'cameraMatch.vp.heading': { en: 'Consolidated vanishing points', th: 'จุดลับตารวม' },
  'cameraMatch.vp.headingNote': { en: '(best point from all lines of each axis)', th: '(หาจุดที่ดีที่สุดจากทุกเส้นของแกน)' },
  'cameraMatch.vp.parallelTag': { en: ' · ∞ parallel', th: ' · ∞ ขนาน' },
  'cameraMatch.vp.outliers': { en: ' · ⚠ {n} outlier lines', th: ' · ⚠ {n} เส้นเพี้ยน' },
  'cameraMatch.vp.needTwo': { en: 'Needs at least 2 lines', th: 'ต้องมีอย่างน้อย 2 เส้น' },
  'cameraMatch.vp.consolidateAxis': { en: 'Merge {axis}', th: 'รวม {axis}' },
  'cameraMatch.vp.parallelAxis': { en: 'Parallel {axis}', th: 'ขนาน {axis}' },
  'cameraMatch.vp.consolidateTitle': {
    en: 'Merge all lines into one vanishing point (auto mode)',
    th: 'รวมทุกเส้นเข้าจุดลับตาเดียว (โหมดอัตโนมัติ)',
  },
  'cameraMatch.vp.parallelTitle': {
    en: 'Make all lines parallel along their mean direction (vanishing point at ∞)',
    th: 'ทำให้ทุกเส้นขนานกันตามทิศเฉลี่ย (จุดลับตาที่ ∞)',
  },
  'cameraMatch.vp.hintFar': { en: 'vanishing point is {diag} image diagonals away', th: 'จุดลับตาไกล {diag} ทแยงภาพ' },
  'cameraMatch.vp.hintCheap': { en: 'parallel costs almost no accuracy ({deg})', th: 'ขนานแทบไม่เสียความแม่น ({deg})' },
  'cameraMatch.vp.hint': {
    en: '💡 Axis {axis} looks parallel — {why} · tap to use "Parallel {axis}"',
    th: '💡 แกน {axis} น่าจะขนาน — {why} · แตะเพื่อใช้ "ขนาน {axis}"',
  },
  'cameraMatch.vp.consolidateAll': { en: '🎯 Merge vanishing points', th: '🎯 รวมจุดลับตา' },
  'cameraMatch.vp.lock': { en: '🔒 Lock to vanishing point {state}', th: '🔒 ล็อกเข้าจุดลับตา {state}' },
  'cameraMatch.vp.lockToastOn': {
    en: 'Lock to vanishing point: on (axes with 3+ lines)',
    th: 'ล็อกเข้าจุดลับตา: เปิด (แกนที่มี 3 เส้นขึ้นไป)',
  },
  'cameraMatch.vp.lockToastOff': { en: 'Lock to vanishing point: off', th: 'ล็อกเข้าจุดลับตา: ปิด' },
  'cameraMatch.vp.legendColor': {
    en: 'Line outline = angle off the vanishing point:',
    th: 'สีขอบเส้น = มุมเพี้ยนจากจุดลับตา:',
  },
  'cameraMatch.vp.legendOutlier': { en: '⚠ = gross outlier (excluded)', th: '⚠ = เส้นเพี้ยนมาก (ไม่นำมาคิด)' },
  'cameraMatch.vp.legendConsolidate': { en: 'Merge vanishing points', th: 'รวมจุดลับตา' },
  'cameraMatch.vp.legendConsolidateText': {
    en: ' rotates every line about its midpoint (or its linked corner) through one point',
    th: 'หมุนทุกเส้นรอบจุดกึ่งกลาง (หรือรอบมุมที่เชื่อม) ให้ผ่านจุดเดียวกัน',
  },
  'cameraMatch.vp.legendLock': { en: 'Lock', th: 'ล็อก' },
  'cameraMatch.vp.legendLockText': {
    en: ': a dragged line end keeps the line pointing at the vanishing point of the other lines',
    th: ': ลากปลายเส้นแล้วเส้นยังชี้ไปจุดลับตาของเส้นอื่น',
  },
  'cameraMatch.vp.legendParallel': { en: 'Parallel', th: 'ขนาน' },
  'cameraMatch.vp.legendParallelText': {
    en: ': vanishing point at ∞ (e.g. the Z axis of a level camera, no pitch) — the camera is constrained so that axis is parallel to the image · two parallel axes (one-point perspective) need a locked lens or point pairs',
    th: ': จุดลับตาอยู่ที่ ∞ (เช่น แกน Z ของกล้องที่ตั้งตรง ไม่ก้ม/เงย) — กล้องจะถูกบังคับให้แกนนั้นขนานกับภาพ · ขนาน 2 แกน (ทัศนมิติจุดเดียว) ต้องล็อกเลนส์หรือใช้คู่จุด',
  },
  'cameraMatch.vp.overlayParallel': { en: '∞ {axis} parallel', th: '∞ {axis} ขนาน' },
  'cameraMatch.vp.axisName': { en: ' on axis {axis}', th: ' แกน {axis}' },
  'cameraMatch.vp.sameAxis': { en: ' on the same axis', th: 'ในแกนเดียวกัน' },
  'cameraMatch.vp.needTwoBeforeParallel': {
    en: 'Needs at least 2 lines{name} before making them parallel',
    th: 'ต้องมีอย่างน้อย 2 เส้น{name} ก่อนทำให้ขนาน',
  },
  'cameraMatch.vp.needTwoBeforeConsolidate': {
    en: 'Needs at least 2 lines{name} before merging vanishing points',
    th: 'ต้องมีอย่างน้อย 2 เส้น{name} ก่อนรวมจุดลับตา',
  },
  'cameraMatch.vp.madeParallel': {
    en: 'Lines{name} made parallel · adjusted {n} lines to the mean direction (vanishing point at ∞)',
    th: 'ทำให้เส้น{name} ขนานกันแล้ว · ปรับ {n} เส้นตามทิศเฉลี่ย (จุดลับตาที่ ∞)',
  },
  'cameraMatch.vp.alreadyParallel': { en: 'Lines{name} are already parallel', th: 'เส้น{name} ขนานกันอยู่แล้ว' },
  'cameraMatch.vp.consolidated': {
    en: 'Merged vanishing point{name} · adjusted {n} lines to pass through one point',
    th: 'รวมจุดลับตา{name}แล้ว · ปรับ {n} เส้นให้ผ่านจุดลับตาเดียวกัน',
  },
  'cameraMatch.vp.alreadyConsolidated': {
    en: 'Lines{name} already pass through one vanishing point',
    th: 'เส้น{name}ผ่านจุดลับตาเดียวกันอยู่แล้ว',
  },
  'cameraMatch.vp.skippedLinked': {
    en: ' · skipped {n} lines (both ends linked — unlink first)',
    th: ' · ข้าม {n} เส้น (ปลายทั้งสองเชื่อมมุมอยู่ — แยกมุมก่อน)',
  },
  'cameraMatch.vp.skipBothLinked': { en: 'both ends linked', th: 'ปลายทั้งสองเชื่อมมุมอยู่' },
  'cameraMatch.vp.skipPivotAtVp': { en: 'pivot is at the vanishing point', th: 'จุดหมุนอยู่ที่จุดลับตา' },
  'cameraMatch.vp.onePointNoLens': {
    en: 'Two parallel axes (one-point perspective): the lens cannot be found from lines — lock the lens or use point pairs',
    th: 'แกนขนาน 2 แกน (ทัศนมิติจุดเดียว) หาเลนส์จากเส้นไม่ได้ — ล็อกเลนส์ หรือใช้คู่จุดแทน',
  },
  'cameraMatch.vp.oneRealVpNoLens': {
    en: 'Only one finite vanishing point: the lens cannot be found from lines — add lines on another axis, lock the lens or use point pairs',
    th: 'มีจุดลับตาจริงแค่แกนเดียว หาเลนส์จากเส้นไม่ได้ — เพิ่มเส้นอีกแกน ล็อกเลนส์ หรือใช้คู่จุด',
  },
  'cameraMatch.vp.principalNeedsThree': {
    en: 'The principal point needs three finite vanishing points (an axis is parallel)',
    th: 'หาจุดกึ่งกลางภาพต้องใช้จุดลับตาจริงครบ 3 แกน (มีแกนขนานอยู่)',
  },

  // --- edge alignment -------------------------------------------------------------------------------------------
  'cameraMatch.edges.heading': { en: 'Line vs image edges', th: 'เทียบเส้นกับขอบภาพ' },
  'cameraMatch.edges.headingNote': { en: '(guide line ↔ real edges in the mock-up)', th: '(เส้นนำสายตา ↔ ขอบจริงใน Mock-up)' },
  'cameraMatch.edges.loading': { en: 'Finding image edges…', th: 'กำลังหาขอบภาพ…' },
  'cameraMatch.edges.showAria': { en: 'Show image edges', th: 'แสดงขอบภาพ' },
  'cameraMatch.edges.line': { en: 'Line', th: 'เส้น' },
  'cameraMatch.edges.none': { en: 'No edge found', th: 'ไม่พบขอบ' },
  'cameraMatch.edges.noneNearLine': { en: 'No image edge near the line', th: 'ไม่พบขอบภาพใกล้เส้น' },
  'cameraMatch.edges.offBy': { en: '{px} off the image edge', th: 'ห่างขอบภาพ {px}' },
  'cameraMatch.edges.score': { en: 'score {score}% · edge found {coverage}%', th: 'คะแนน {score}% · เจอขอบ {coverage}%' },
  'cameraMatch.edges.snapped': { en: ' · snapped', th: ' · ดูดแล้ว' },
  'cameraMatch.edges.loupeSnapped': { en: 'image edge', th: 'ขอบภาพ' },
  'cameraMatch.edges.loupeOff': { en: '{px} off edge', th: 'ห่างขอบ {px}' },
  'cameraMatch.edges.refineSelected': { en: '🧷 Snap to image edge (selected line)', th: '🧷 ดูดเข้าขอบภาพ (เส้นที่เลือก)' },
  'cameraMatch.edges.refineAll': { en: 'All lines', th: 'ทุกเส้น' },
  'cameraMatch.edges.snapWhileDrag': { en: 'Snap while dragging {state}', th: 'ดูดขณะลาก {state}' },
  'cameraMatch.edges.snapWhileDragToastOn': {
    en: 'Snap to image edge while dragging: on (Alt = off temporarily)',
    th: 'ดูดเข้าขอบภาพขณะลาก: เปิด (Alt = ปิดชั่วคราว)',
  },
  'cameraMatch.edges.snapWhileDragToastOff': { en: 'Snap to image edge while dragging: off', th: 'ดูดเข้าขอบภาพขณะลาก: ปิด' },
  'cameraMatch.edges.legendLead': {
    en: 'The image dims and detected edges glow · short ticks from line to edge = actual offset:',
    th: 'ภาพจะมืดลงและขอบที่ตรวจพบเรืองแสง · ขีดสั้น ๆ จากเส้นไปขอบ = ระยะห่างจริง:',
  },
  'cameraMatch.edges.legendRefine': { en: 'Snap to image edge', th: 'ดูดเข้าขอบภาพ' },
  'cameraMatch.edges.legendRefineText': {
    en: ' fits the line to edges within ±8 px (linked corners stay put), undoable',
    th: 'ฟิตเส้นเข้ากับขอบในแถบ ±8 px (มุมที่เชื่อมอยู่ไม่ขยับ) ย้อนได้',
  },
  'cameraMatch.edges.bothLinked': { en: 'Both ends linked — not moved', th: 'ปลายทั้งสองเชื่อมมุมอยู่ — ไม่ขยับ' },
  'cameraMatch.edges.noClearEdge': {
    en: 'No clear image edge in the band around the line',
    th: 'ไม่พบขอบภาพที่ชัดพอในแถบรอบเส้น',
  },
  'cameraMatch.edges.refinedOne': { en: 'Snapped to image edge · offset {before} → {after}', th: 'ดูดเข้าขอบภาพแล้ว · ห่าง {before} → {after}' },
  'cameraMatch.edges.alreadyOnEdge': { en: 'Already on the image edge', th: 'อยู่บนขอบภาพแล้ว' },
  'cameraMatch.edges.preparing': { en: 'Preparing image edges… try again', th: 'กำลังเตรียมขอบภาพ… ลองอีกครั้ง' },
  'cameraMatch.edges.selectFirst': {
    en: 'Select a line first (tap it) or press “All lines”',
    th: 'เลือกเส้นก่อน (แตะเส้น) หรือกด “ทุกเส้น”',
  },
  'cameraMatch.edges.refinedMany': {
    en: 'Snapped {n} lines to image edges · mean offset {before} → {after} px',
    th: 'ดูดเข้าขอบภาพแล้ว {n} เส้น · ห่างขอบเฉลี่ย {before} → {after} px',
  },
  'cameraMatch.edges.nothingToRefine': {
    en: 'Lines are already on image edges, or no clear edge is near them',
    th: 'เส้นอยู่บนขอบภาพแล้ว หรือไม่พบขอบที่ชัดพอใกล้เส้น',
  },
  'cameraMatch.edges.skippedLinked': { en: ' · skipped {n} lines (both ends linked)', th: ' · ข้าม {n} เส้น (ปลายทั้งสองเชื่อมมุม)' },

  // --- model difference view ------------------------------------------------------------------------------------
  'cameraMatch.diff.aria': { en: 'Difference view', th: 'โหมดเทียบความต่าง' },
  'cameraMatch.diff.label': {
    en: 'Difference view against the model (model ⊖ image: match = dark, mismatch = bright) · default off',
    th: 'โหมดเทียบความต่างกับโมเดล (โมเดล ⊖ ภาพ: ตรงกัน = มืด, เพี้ยน = เรืองแสง) · ค่าเริ่มต้น ปิด',
  },
  'cameraMatch.diff.badge': { en: 'Difference', th: 'เทียบความต่าง' },
  'cameraMatch.diff.solveFailed': { en: 'Camera solve failed · using the last one', th: 'คำนวณกล้องไม่สำเร็จ · ใช้ค่าล่าสุด' },

  // --- object ↔ room ------------------------------------------------------------------------------------------
  'cameraMatch.room.aligned': {
    en: 'Object aligned with the room (same X/Y axes as the walls)',
    th: 'วัตถุวางตรงกับห้อง (แกน X/Y เดียวกับผนัง)',
  },
  'cameraMatch.room.yawLead': { en: 'Object rotated from the room by', th: 'วัตถุหมุนจากแนวห้อง' },
  'cameraMatch.room.yawRest': {
    en: '(about Z) · only vertical/horizon/lens are shared · rotate the model {deg}° about Z when placing it in the room (in the export)',
    th: '(รอบแกน Z) · ใช้ร่วมกันแค่แนวตั้ง/เส้นขอบฟ้า/เลนส์ · ตอนวางโมเดลในห้องให้หมุน Z {deg}° (อยู่ในไฟล์ส่งออก)',
  },
  'cameraMatch.room.agreement': { en: 'Object ↔ room agreement', th: 'ความสอดคล้อง วัตถุ↔ห้อง' },
  'cameraMatch.room.bandGood': { en: '✔ Match', th: '✔ ตรงกัน' },
  'cameraMatch.room.bandWarn': { en: '≈ Close', th: '≈ ใกล้เคียง' },
  'cameraMatch.room.bandBad': { en: '✖ Mismatch', th: '✖ ไม่ตรง' },
  'cameraMatch.room.max': { en: ' · max {deg}', th: ' · สูงสุด {deg}' },
  'cameraMatch.room.drawBoth': {
    en: 'Draw both object (crop) and room (full mock-up) lines to check that they agree',
    th: 'วาดเส้นทั้งวัตถุ (ภาพครอป) และห้อง (Mock-up เต็ม) เพื่อตรวจว่าตรงกันไหม',
  },
  'cameraMatch.room.highlighted': {
    en: 'Highlighted the {n} worst lines of axis {axis}',
    th: 'ไฮไลต์ {n} เส้นที่เพี้ยนที่สุดของแกน {axis}',
  },
  'cameraMatch.room.needTwoBoth': { en: 'Needs ≥ 2 lines in both sets', th: 'ต้องมี ≥ 2 เส้นทั้งสองชุด' },
  'cameraMatch.room.diffParallel': { en: '∞ direction difference', th: 'มุมต่างของทิศ ∞' },
  'cameraMatch.room.diffVp': { en: 'vanishing point difference', th: 'มุมต่างของจุดลับตา' },
  'cameraMatch.room.notParallel': { en: ' · ⚠ {groups} lines not parallel', th: ' · ⚠ เส้น{groups}ไม่ขนาน' },
  'cameraMatch.room.showLines': { en: 'Show lines', th: 'ดูเส้น' },
  'cameraMatch.room.lenses': { en: 'Lens: object {obj} · room {room}', th: 'เลนส์ วัตถุ {obj} · ห้อง {room}' },
  'cameraMatch.room.legendAngle': { en: 'Angle difference:', th: 'มุมต่าง:' },
  'cameraMatch.room.legendLens': { en: 'Lens difference', th: 'เลนส์ต่าง' },
  'cameraMatch.room.legendTap': {
    en: 'Tap an axis to highlight its worst lines (both sets)',
    th: 'แตะแกนเพื่อไฮไลต์เส้นที่เพี้ยนที่สุด (ทั้งสองชุด)',
  },
  'cameraMatch.room.solvedFromLines': { en: 'Solved from lines{groups} · lens {lens} mm{yaw}{extra}', th: 'คำนวณจากเส้นแล้ว{groups} · เลนส์ {lens} มม.{yaw}{extra}' },
  'cameraMatch.room.solvedGroupsTag': { en: ' (object + room)', th: ' (วัตถุ+ห้อง)' },
  'cameraMatch.room.solvedYawTag': { en: ' · object yaw {deg}°', th: ' · วัตถุหมุน {deg}°' },
  'cameraMatch.room.solvedExtraTag': { en: ' · {extra}', th: ' · {extra}' },
  'cameraMatch.room.needTwoInTwoAxes': { en: 'Needs at least 2 lines in 2 axes', th: 'ต้องมีเส้นอย่างน้อย 2 เส้น ใน 2 แกน' },
  'cameraMatch.room.solveFailed': { en: 'Solve failed', th: 'คำนวณไม่สำเร็จ' },
  'cameraMatch.room.needXYBoth': {
    en: 'Needs X/Y lines in both object and room to find the yaw (keeping the previous one)',
    th: 'ต้องมีเส้นแกน X/Y ทั้งในวัตถุและห้อง จึงจะหามุมหมุนได้ (ใช้มุมเดิม)',
  },

  // --- source files (dev save API) ------------------------------------------------------------------------------
  'editor.files.openedDraft': { en: 'Opened your unsaved work (stored on this device)', th: 'เปิดงานที่แก้ค้างไว้ (บันทึกในเครื่องนี้)' },
  'editor.files.openedFile': { en: 'Opened the work from the source files', th: 'เปิดงานจากไฟล์ต้นฉบับ' },
  'editor.files.statusNew': { en: 'new file', th: 'ไฟล์ใหม่' },
  'editor.files.statusModified': { en: 'differs from file', th: 'แก้ต่างจากไฟล์' },
  'editor.files.noApi': {
    en: 'Saving to files works under npm run dev — use the download buttons for now',
    th: 'บันทึกลงไฟล์ได้เมื่อรัน npm run dev — ตอนนี้ใช้ปุ่มดาวน์โหลดไฟล์แทน',
  },
  'editor.files.glbFailed': { en: 'GLB export failed', th: 'ส่งออก GLB ไม่สำเร็จ' },
  'editor.files.nothingToSave': {
    en: 'Source files already match the work — nothing to save',
    th: 'ไฟล์ต้นฉบับตรงกับงานแล้ว ไม่มีอะไรต้องบันทึก',
  },
  'editor.files.saveFailed': { en: 'Saving to files failed: {err}', th: 'บันทึกลงไฟล์ไม่สำเร็จ: {err}' },
  'editor.files.saved': { en: 'Saved {n} files — ready to commit', th: 'บันทึกลงไฟล์แล้ว {n} ไฟล์ — commit ได้เลย' },
  'editor.files.revertConfirm': {
    en: 'Revert to the source files? Work not saved to files will be lost',
    th: 'กลับไปใช้ไฟล์ต้นฉบับ? งานที่ยังไม่บันทึกลงไฟล์จะหายไป',
  },
  'editor.files.reverted': { en: 'Reverted to the source files', th: 'กลับไปใช้ไฟล์ต้นฉบับแล้ว' },
  'editor.files.downloaded': { en: 'Downloaded {name} — put it in {dir}', th: 'ดาวน์โหลด {name} แล้ว — วางไว้ใน {dir}' },
  'editor.files.copyFailed': { en: 'Could not copy — select the text and copy it yourself', th: 'คัดลอกไม่ได้ — เลือกข้อความแล้วคัดลอกเอง' },
  'editor.files.unsaved': { en: '● Unsaved work (not in the source files)', th: '● มีงานที่ยังไม่บันทึกลงไฟล์' },
  'editor.files.saveButton': { en: '💾 Save to source files', th: '💾 บันทึกลงไฟล์ต้นฉบับ' },
  'editor.files.saving': { en: 'Saving…', th: 'กำลังบันทึก…' },
  'editor.files.keepDraft': { en: 'Keep my work', th: 'ใช้งานที่ค้างไว้ต่อ' },
  'editor.files.revert': { en: 'Revert to files', th: 'กลับไปใช้ไฟล์' },
  'editor.files.heading': { en: 'Source files (committable)', th: 'ไฟล์ต้นฉบับ (commit ได้)' },
  'editor.files.download': { en: 'Download', th: 'ดาวน์โหลด' },
  'editor.files.inSync': { en: '✓ Work matches the source files', th: '✓ งานตรงกับไฟล์ต้นฉบับ' },
  'editor.files.noFilesYet': { en: ' (no files yet — nothing edited)', th: ' (ยังไม่มีไฟล์ — ยังไม่ได้แก้อะไร)' },
  'editor.files.includeGlb': { en: 'Include', th: 'รวม' },
  'editor.files.includeGlbNote': { en: '(edited model)', th: '(โมเดลที่แก้แล้ว)' },
  'editor.files.savedList': { en: 'Saved:', th: 'บันทึกแล้ว:' },
  'editor.files.thenCommit': { en: 'then commit with:', th: 'แล้ว commit ด้วย:' },
  'editor.files.copied': { en: 'Copied ✓', th: 'คัดลอกแล้ว ✓' },
  'editor.files.copyCommand': { en: 'Copy command', th: 'คัดลอกคำสั่ง' },
  'editor.files.devHintLead': { en: 'You can save straight to files when this page is opened from', th: 'บันทึกลงไฟล์โดยตรงได้เมื่อเปิดหน้านี้จาก' },
  'editor.files.devHintIn': { en: '(in the folder', th: '(ในโฟลเดอร์' },
  'editor.files.devHintThen': { en: ') — for now, download and put the files in', th: ') — ตอนนี้กดดาวน์โหลดแล้ววางไฟล์ไว้ใน' },
  'editor.files.devHintTail': { en: 'yourself', th: 'เองได้' },
} as const satisfies Record<string, Record<Locale, string>>;

export type MessageKey = keyof typeof MESSAGES;
type Params = Record<string, string | number>;

/** Format `key` in `locale`, replacing `{name}` placeholders (unknown placeholders are left as is). */
export function format(locale: Locale, key: MessageKey, params?: Params): string {
  const s: string = MESSAGES[key][locale];
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s;
}

/** Format in the current UI locale. */
export const t = (key: MessageKey, params?: Params): string => format(LOCALE, key, params);

/** Flat `{ key: text }` table for one locale — the shape of `src/locales/<locale>.json`. */
export function localeTable(locale: Locale): Record<MessageKey, string> {
  const out = {} as Record<MessageKey, string>;
  for (const k of Object.keys(MESSAGES) as MessageKey[]) out[k] = MESSAGES[k][locale];
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Typed facade used by components/state modules (kept so call sites stay short and parameter names checked).

const AXES = ['X', 'Y', 'Z'] as const;
const onOff = (on: boolean): string => t(on ? 'editor.common.on' : 'editor.common.off');
const st = (on: boolean) => ({ state: onOff(on) });

export const T = {
  common: {
    on: t('editor.common.on'),
    off: t('editor.common.off'),
    onOff,
    lines: (n: number) => t('editor.common.lines', { n }),
    undo: t('editor.common.undo'),
    redo: t('editor.common.redo'),
    redoNext: t('editor.common.redoNext'),
    undoAria: t('editor.common.undoAria'),
    redoAria: t('editor.common.redoAria'),
    mm: (v: string | number) => t('editor.common.mm', { v }),
  },

  /** 2D view-window zoom / pan of the mock-up and camera-match stage. */
  stage: {
    zoomIn: t('editor.stage.zoomIn'),
    zoomOut: t('editor.stage.zoomOut'),
    fit: t('editor.stage.fit'),
    zoomLabel: (pct: number) => t('editor.stage.zoomLabel', { pct }),
    mockHint: t('editor.stage.mockHint'),
    focus: t('editor.stage.focus'),
    focusTitle: t('editor.stage.focusTitle'),
    crop: t('editor.stage.crop'),
    cropTitle: t('editor.stage.cropTitle'),
    follow: t('editor.stage.follow'),
    followTitle: t('editor.stage.followTitle'),
  },

  /** Part origin (pivot) editing. */
  pivot: {
    mode: t('editor.pivot.mode'),
    modeTitle: t('editor.pivot.modeTitle'),
    heading: t('editor.pivot.heading'),
    center: t('editor.pivot.center'),
    bottom: t('editor.pivot.bottom'),
    pick: t('editor.pivot.pick'),
    pickCancel: t('editor.pivot.pickCancel'),
    reset: t('editor.pivot.reset'),
    pickHint: t('editor.pivot.pickHint'),
    local: t('editor.pivot.local'),
    world: t('editor.pivot.world'),
    localSub: t('editor.pivot.localSub'),
    worldSub: t('editor.pivot.worldSub'),
    spaceAria: t('editor.pivot.spaceAria'),
    modeOnly: t('editor.pivot.modeOnly'),
    toast: (on: boolean) => t('editor.pivot.toast', st(on)),
    snapped: (kind: 'vertex' | 'edge' | 'face' | 'bbox' | 'grid') => t('editor.pivot.snapped', { what: t(`editor.pivot.kind.${kind}`) }),
  },

  /** Showing an overlay: while dragging / always / never. */
  showModes: {
    drag: t('cameraMatch.showModes.drag'),
    always: t('cameraMatch.showModes.always'),
    off: t('cameraMatch.showModes.off'),
  },

  groups: {
    object: t('cameraMatch.groups.object'),
    room: t('cameraMatch.groups.room'),
    pickerAria: t('cameraMatch.groups.pickerAria'),
    cropButton: t('cameraMatch.groups.cropButton'),
    wideButton: t('cameraMatch.groups.wideButton'),
    cropToast: t('cameraMatch.groups.cropToast'),
    wideToast: t('cameraMatch.groups.wideToast'),
    editing: t('cameraMatch.groups.editing'),
    lineOf: (group: string) => t('cameraMatch.groups.lineOf', { group }),
    count: (n: number) => t('cameraMatch.groups.count', { n }),
    otherCount: (group: string, n: number) => t('cameraMatch.groups.otherCount', { group, n }),
    roomHowTo: t('cameraMatch.groups.roomHowTo'),
    objectHowTo: t('cameraMatch.groups.objectHowTo'),
    sharedCamera: t('cameraMatch.groups.sharedCamera'),
    ghost: (group: string, on: boolean) => t('cameraMatch.groups.ghost', { group, ...st(on) }),
    rays: (on: boolean) => t('cameraMatch.groups.rays', st(on)),
    roomSeedNote: t('cameraMatch.groups.roomSeedNote'),
  },

  snap: {
    label: t('cameraMatch.snap.label'),
    title: t('cameraMatch.snap.title'),
    button: (on: boolean) => t('cameraMatch.snap.button', st(on)),
    toast: (on: boolean) => t('cameraMatch.snap.toast', st(on)),
    unlink: t('cameraMatch.snap.unlink'),
    unlinked: t('cameraMatch.snap.unlinked'),
    undoLinesAria: t('cameraMatch.snap.undoLinesAria'),
    redoLinesAria: t('cameraMatch.snap.redoLinesAria'),
    kinds: {
      endpoint: t('cameraMatch.snap.kinds.endpoint'),
      intersection: t('cameraMatch.snap.kinds.intersection'),
      segment: t('cameraMatch.snap.kinds.segment'),
    },
    cornerSplit: t('cameraMatch.snap.cornerSplit'),
    cornerLinked: t('cameraMatch.snap.cornerLinked'),
    dragLineAria: t('cameraMatch.snap.dragLineAria'),
    endpointAria: t('cameraMatch.snap.endpointAria'),
    tipDrag: t('cameraMatch.snap.tipDrag'),
    tipLinked: t('cameraMatch.snap.tipLinked'),
    tipLinkedRest: t('cameraMatch.snap.tipLinkedRest'),
    tipHold: t('cameraMatch.snap.tipHold'),
    tipHoldRest: t('cameraMatch.snap.tipHoldRest'),
    tipLinkedEnds: (n: number) => t('cameraMatch.snap.tipLinkedEnds', { n }),
  },

  /** Master guide line per axis. `name` = a line label such as "X2". */
  master: {
    set: t('cameraMatch.master.set'),
    setTitle: (axis: string) => t('cameraMatch.master.setTitle', { axis }),
    label: (axis: string) => t('cameraMatch.master.label', { axis }),
    selectAria: (axis: string) => t('cameraMatch.master.selectAria', { axis }),
    option: (name: string) => t('cameraMatch.master.option', { name }),
    cycle: t('cameraMatch.master.cycle'),
    cycleAria: (axis: string) => t('cameraMatch.master.cycleAria', { axis }),
    isMaster: (axis: string) => t('cameraMatch.master.isMaster', { axis }),
    setToast: (name: string, axis: string) => t('cameraMatch.master.setToast', { name, axis }),
    promoted: (name: string, axis: string) => t('cameraMatch.master.promoted', { name, axis }),
    onlyMaster: (axis: string) => t('cameraMatch.master.onlyMaster', { axis }),
    menuAria: t('cameraMatch.master.menuAria'),
    menuClose: t('cameraMatch.master.menuClose'),
    legend: t('cameraMatch.master.legend'),
    legendText: t('cameraMatch.master.legendText'),
    deleteSelected: t('cameraMatch.master.deleteSelected'),
  },

  vp: {
    heading: t('cameraMatch.vp.heading'),
    headingNote: t('cameraMatch.vp.headingNote'),
    parallelTag: t('cameraMatch.vp.parallelTag'),
    outliers: (n: number) => t('cameraMatch.vp.outliers', { n }),
    needTwo: t('cameraMatch.vp.needTwo'),
    consolidateAxis: (axis: string) => t('cameraMatch.vp.consolidateAxis', { axis }),
    parallelAxis: (axis: string) => t('cameraMatch.vp.parallelAxis', { axis }),
    consolidateTitle: t('cameraMatch.vp.consolidateTitle'),
    parallelTitle: t('cameraMatch.vp.parallelTitle'),
    hintFar: (diag: string) => t('cameraMatch.vp.hintFar', { diag }),
    hintCheap: (deg: string) => t('cameraMatch.vp.hintCheap', { deg }),
    hint: (axis: string, why: string) => t('cameraMatch.vp.hint', { axis, why }),
    consolidateAll: t('cameraMatch.vp.consolidateAll'),
    lock: (on: boolean) => t('cameraMatch.vp.lock', st(on)),
    lockToast: (on: boolean) => t(on ? 'cameraMatch.vp.lockToastOn' : 'cameraMatch.vp.lockToastOff'),
    legendColor: t('cameraMatch.vp.legendColor'),
    legendOutlier: t('cameraMatch.vp.legendOutlier'),
    legendConsolidate: t('cameraMatch.vp.legendConsolidate'),
    legendConsolidateText: t('cameraMatch.vp.legendConsolidateText'),
    legendLock: t('cameraMatch.vp.legendLock'),
    legendLockText: t('cameraMatch.vp.legendLockText'),
    legendParallel: t('cameraMatch.vp.legendParallel'),
    legendParallelText: t('cameraMatch.vp.legendParallelText'),
    overlayParallel: (axis: string) => t('cameraMatch.vp.overlayParallel', { axis }),
    // consolidate() results
    axisName: (axis: number) => t('cameraMatch.vp.axisName', { axis: AXES[axis] ?? '?' }),
    needTwoBefore: (name: string, parallel: boolean) =>
      t(parallel ? 'cameraMatch.vp.needTwoBeforeParallel' : 'cameraMatch.vp.needTwoBeforeConsolidate', {
        name: name || t('cameraMatch.vp.sameAxis'),
      }),
    madeParallel: (name: string, n: number) => t('cameraMatch.vp.madeParallel', { name, n }),
    alreadyParallel: (name: string) => t('cameraMatch.vp.alreadyParallel', { name }),
    consolidated: (name: string, n: number) => t('cameraMatch.vp.consolidated', { name, n }),
    alreadyConsolidated: (name: string) => t('cameraMatch.vp.alreadyConsolidated', { name }),
    skippedLinked: (n: number) => t('cameraMatch.vp.skippedLinked', { n }),
    skipBothLinked: t('cameraMatch.vp.skipBothLinked'),
    skipPivotAtVp: t('cameraMatch.vp.skipPivotAtVp'),
    // solver messages
    onePointNoLens: t('cameraMatch.vp.onePointNoLens'),
    oneRealVpNoLens: t('cameraMatch.vp.oneRealVpNoLens'),
    principalNeedsThree: t('cameraMatch.vp.principalNeedsThree'),
  },

  edges: {
    heading: t('cameraMatch.edges.heading'),
    headingNote: t('cameraMatch.edges.headingNote'),
    loading: t('cameraMatch.edges.loading'),
    showAria: t('cameraMatch.edges.showAria'),
    line: t('cameraMatch.edges.line'),
    none: t('cameraMatch.edges.none'),
    noneNearLine: t('cameraMatch.edges.noneNearLine'),
    offBy: (px: string) => t('cameraMatch.edges.offBy', { px }),
    score: (score: number, coverage: number) => t('cameraMatch.edges.score', { score, coverage }),
    snapped: t('cameraMatch.edges.snapped'),
    loupeSnapped: t('cameraMatch.edges.loupeSnapped'),
    loupeOff: (px: string) => t('cameraMatch.edges.loupeOff', { px }),
    refineSelected: t('cameraMatch.edges.refineSelected'),
    refineAll: t('cameraMatch.edges.refineAll'),
    snapWhileDrag: (on: boolean) => t('cameraMatch.edges.snapWhileDrag', st(on)),
    snapWhileDragToast: (on: boolean) =>
      t(on ? 'cameraMatch.edges.snapWhileDragToastOn' : 'cameraMatch.edges.snapWhileDragToastOff'),
    legendLead: t('cameraMatch.edges.legendLead'),
    legendRefine: t('cameraMatch.edges.legendRefine'),
    legendRefineText: t('cameraMatch.edges.legendRefineText'),
    // edgeAlign / refine results
    bothLinked: t('cameraMatch.edges.bothLinked'),
    noClearEdge: t('cameraMatch.edges.noClearEdge'),
    refinedOne: (before: string, after: string) => t('cameraMatch.edges.refinedOne', { before, after }),
    alreadyOnEdge: t('cameraMatch.edges.alreadyOnEdge'),
    preparing: t('cameraMatch.edges.preparing'),
    selectFirst: t('cameraMatch.edges.selectFirst'),
    refinedMany: (n: number, before: string, after: string) => t('cameraMatch.edges.refinedMany', { n, before, after }),
    nothingToRefine: t('cameraMatch.edges.nothingToRefine'),
    skippedLinked: (n: number) => t('cameraMatch.edges.skippedLinked', { n }),
  },

  diff: {
    aria: t('cameraMatch.diff.aria'),
    label: t('cameraMatch.diff.label'),
    badge: t('cameraMatch.diff.badge'),
    solveFailed: t('cameraMatch.diff.solveFailed'),
  },

  room: {
    aligned: t('cameraMatch.room.aligned'),
    yawLead: t('cameraMatch.room.yawLead'),
    yawRest: (deg: string) => t('cameraMatch.room.yawRest', { deg }),
    agreement: t('cameraMatch.room.agreement'),
    bandGood: t('cameraMatch.room.bandGood'),
    bandWarn: t('cameraMatch.room.bandWarn'),
    bandBad: t('cameraMatch.room.bandBad'),
    max: (deg: string) => t('cameraMatch.room.max', { deg }),
    drawBoth: t('cameraMatch.room.drawBoth'),
    highlighted: (n: number, axis: string) => t('cameraMatch.room.highlighted', { n, axis }),
    needTwoBoth: t('cameraMatch.room.needTwoBoth'),
    diffParallel: t('cameraMatch.room.diffParallel'),
    diffVp: t('cameraMatch.room.diffVp'),
    notParallel: (groups: string) => t('cameraMatch.room.notParallel', { groups }),
    showLines: t('cameraMatch.room.showLines'),
    lenses: (obj: string, room: string) => t('cameraMatch.room.lenses', { obj, room }),
    legendAngle: t('cameraMatch.room.legendAngle'),
    legendLens: t('cameraMatch.room.legendLens'),
    legendTap: t('cameraMatch.room.legendTap'),
    solvedFromLines: (groups: boolean, lens: string, yaw: string | null, extra: string | null) =>
      t('cameraMatch.room.solvedFromLines', {
        groups: groups ? t('cameraMatch.room.solvedGroupsTag') : '',
        lens,
        yaw: yaw === null ? '' : t('cameraMatch.room.solvedYawTag', { deg: yaw }),
        extra: extra ? t('cameraMatch.room.solvedExtraTag', { extra }) : '',
      }),
    needTwoInTwoAxes: t('cameraMatch.room.needTwoInTwoAxes'),
    solveFailed: t('cameraMatch.room.solveFailed'),
    needXYBoth: t('cameraMatch.room.needXYBoth'),
  },

  files: {
    openedDraft: t('editor.files.openedDraft'),
    openedFile: t('editor.files.openedFile'),
    statusNew: t('editor.files.statusNew'),
    statusModified: t('editor.files.statusModified'),
    noApi: t('editor.files.noApi'),
    glbFailed: t('editor.files.glbFailed'),
    nothingToSave: t('editor.files.nothingToSave'),
    saveFailed: (err: string) => t('editor.files.saveFailed', { err }),
    saved: (n: number) => t('editor.files.saved', { n }),
    revertConfirm: t('editor.files.revertConfirm'),
    reverted: t('editor.files.reverted'),
    downloaded: (name: string, dir: string) => t('editor.files.downloaded', { name, dir }),
    copyFailed: t('editor.files.copyFailed'),
    unsaved: t('editor.files.unsaved'),
    saveButton: t('editor.files.saveButton'),
    saving: t('editor.files.saving'),
    keepDraft: t('editor.files.keepDraft'),
    revert: t('editor.files.revert'),
    heading: t('editor.files.heading'),
    download: t('editor.files.download'),
    inSync: t('editor.files.inSync'),
    noFilesYet: t('editor.files.noFilesYet'),
    includeGlb: t('editor.files.includeGlb'),
    includeGlbNote: t('editor.files.includeGlbNote'),
    savedList: t('editor.files.savedList'),
    thenCommit: t('editor.files.thenCommit'),
    copied: t('editor.files.copied'),
    copyCommand: t('editor.files.copyCommand'),
    devHintLead: t('editor.files.devHintLead'),
    devHintIn: t('editor.files.devHintIn'),
    devHintThen: t('editor.files.devHintThen'),
    devHintTail: t('editor.files.devHintTail'),
  },
} as const;
