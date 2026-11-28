/**
 * Parser for GNU Typist lesson files (`.typ`).
 *
 * Handled: `#` comments, `*:` labels, `B:` banners, `T:` tutorial text, `I:` instructions,
 * `D:`/`d:` drills, `S:`/`s:` speed tests, `M:` menus (` :LABEL "title   summary"`), and ` :` continuation lines.
 * Read and skipped: `G:` `Y:` `N:` `Q:` `K:` `E:` `F:` `X:` `U:` `R:` `L:` (flow control and key setup).
 * Anything else is skipped with a warning. Line breaks inside a text become spaces so no Enter key is needed.
 */
import type { Drill, DrillKind, Lesson } from './types.ts';

export type TypCommand = { cmd: string; arg: string; lines: string[]; line: number };

const FLOW_COMMANDS = new Set(['G', 'Y', 'N', 'Q', 'K', 'E', 'F', 'X', 'U', 'R', 'L']);

/** Map typographic characters to what a keyboard can type, collapse runs of white space. */
export function normalizeForTyping(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split a file into commands. A line starting with ` :` continues the previous command. */
export function tokenize(src: string): TypCommand[] {
  const out: TypCommand[] = [];
  const lines = src.replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, '');
    if (line === '' || line.startsWith('#')) return;
    if (line.startsWith(' :')) {
      out[out.length - 1]?.lines.push(line.slice(2));
      return;
    }
    const m = /^(\S):(.*)$/.exec(line);
    if (!m) return;
    out.push({ cmd: m[1], arg: m[2].trim(), lines: [m[2]], line: i + 1 });
  });
  return out;
}

const joinText = (c: TypCommand): string => normalizeForTyping(c.lines.join(' '));

type MenuItem = { title: string; summary: string };

/** `M:` continuation entries look like ` :LABEL "Title      Summary"`. Title and summary are split at a run of 2+ spaces. */
function parseMenu(c: TypCommand, into: Map<string, MenuItem>): void {
  for (const raw of c.lines.slice(1)) {
    const m = /^\s*(\S+)\s+"(.*)"\s*$/.exec(raw);
    if (!m) continue;
    const parts = m[2].trim().split(/\s{2,}/);
    into.set(m[1], { title: parts[0] || m[1], summary: parts.slice(1).join(' ') });
  }
}

const safeId = (s: string): string => s.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60) || 'x';

export type ParsedTypist = { title: string; lessons: Lesson[]; warnings: string[]; commands: number };

export function parseTypist(src: string): ParsedTypist {
  const cmds = tokenize(src);
  const warnings: string[] = [];
  const menu = new Map<string, MenuItem>();
  for (const c of cmds) if (c.cmd === 'M') parseMenu(c, menu);

  const lessons: Lesson[] = [];
  const usedIds = new Set<string>();
  const fresh = (base: string): string => {
    let id = safeId(base);
    for (let n = 2; usedIds.has(id); n++) id = `${safeId(base)}-${n}`;
    usedIds.add(id);
    return id;
  };

  let courseTitle = '';
  const st: { lesson: Lesson | null; hasBanner: boolean } = { lesson: null, hasBanner: false };
  let label = '';
  let instruction = '';
  const startLesson = (id: string, title: string, summary: string): Lesson => {
    const made: Lesson = { id: safeId(id), title, summary, intro: '', drills: [] };
    st.lesson = made;
    st.hasBanner = false;
    lessons.push(made);
    return made;
  };

  for (const c of cmds) {
    switch (c.cmd) {
      case '*':
        label = c.arg;
        if (menu.has(label)) {
          const item = menu.get(label)!;
          startLesson(label, item.title, item.summary);
        }
        break;
      case 'B': {
        const banner = joinText(c);
        if (menu.size === 0) {
          // No menu: every banner opens a lesson named after it.
          startLesson(label || `lesson-${lessons.length + 1}`, banner, '');
          st.hasBanner = true;
        } else if (!st.lesson) {
          courseTitle = courseTitle || banner;
        } else if (!st.hasBanner) {
          st.hasBanner = true;
          const l = st.lesson;
          if (!l.summary && l.title !== banner) l.summary = banner;
        }
        break;
      }
      case 'I':
        instruction = joinText(c);
        break;
      case 'T': {
        const text = joinText(c);
        const l = st.lesson;
        if (text && l) {
          l.intro = l.intro ? `${l.intro} ${text}` : text;
        }
        break;
      }
      case 'D':
      case 'd':
      case 'S':
      case 's': {
        const text = joinText(c);
        if (!text) {
          warnings.push(`line ${c.line}: empty ${c.cmd}: text skipped`);
          break;
        }
        const l = st.lesson ?? startLesson('lesson-1', courseTitle || 'Lessons', '');
        const kind: DrillKind = c.cmd === 'S' || c.cmd === 's' ? 'speed' : 'drill';
        const drill: Drill = { id: fresh(label || `${l.id}-${l.drills.length + 1}`), label, kind, instruction, text };
        l.drills.push(drill);
        instruction = '';
        break;
      }
      case 'M':
        break;
      default:
        if (!FLOW_COMMANDS.has(c.cmd)) warnings.push(`line ${c.line}: unknown command "${c.cmd}:" skipped`);
    }
  }
  return { title: courseTitle, lessons: lessons.filter((l) => l.drills.length > 0), warnings, commands: cmds.length };
}
