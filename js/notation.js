// Zeichnet Notensystem-Ausschnitte als SVG: Linien, Violinschlüssel, Noten, Hilfslinien, Geist-Noten.
import { GLYPHS } from './glyphs.js';

export const S = 10; // Linienabstand in SVG-Einheiten
const K = S / 250; // Skalierung der Bravura-Glyphen
const BASE = 62; // y der untersten Linie
const TOP = 0;
const HEIGHT = 120;
const STEM = 3.5 * S;

export const yOf = (pos) => BASE - (pos * S) / 2;

const HEAD = {
  whole: GLYPHS.noteheadWhole,
  half: GLYPHS.noteheadHalf,
  quarter: GLYPHS.noteheadBlack,
  eighth: GLYPHS.noteheadBlack,
};

function glyph(g, x, y, extra = '') {
  return `<path d="${g.d}" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${K})" ${extra}/>`;
}

function ledgerLines(pos, x, w) {
  const out = [];
  const ext = 4.5;
  if (pos <= -2) {
    for (let p = -2; p >= pos; p -= 2) out.push(p);
  } else if (pos >= 10) {
    for (let p = 10; p <= pos; p += 2) out.push(p);
  }
  return out
    .map((p) => `<line class="ledger" x1="${(x - ext).toFixed(2)}" x2="${(x + w + ext).toFixed(2)}" y1="${yOf(p)}" y2="${yOf(p)}"/>`)
    .join('');
}

// Zeichnet eine einzelne Note. Position x = linker Rand des Notenkopfs.
export function noteSVG({ pos, value = 'quarter', x, cls = '', stem = 'auto' }) {
  const head = HEAD[value];
  const w = head.w * K;
  const y = yOf(pos);
  let s = `<g class="note ${cls}">`;
  s += ledgerLines(pos, x, w);
  s += glyph(head, x, y, 'class="head"');
  if (value !== 'whole') {
    const up = stem === 'auto' ? pos < 4 : stem === 'up';
    if (up) {
      const sx = x + w - 0.6;
      s += `<line class="stem" x1="${sx.toFixed(2)}" x2="${sx.toFixed(2)}" y1="${(y - 1).toFixed(2)}" y2="${(y - STEM).toFixed(2)}"/>`;
      if (value === 'eighth') s += glyph(GLYPHS.flag8thUp, sx - 0.6, y - STEM, 'class="flag"');
    } else {
      const sx = x + 0.6;
      s += `<line class="stem" x1="${sx.toFixed(2)}" x2="${sx.toFixed(2)}" y1="${(y + 1).toFixed(2)}" y2="${(y + STEM).toFixed(2)}"/>`;
      if (value === 'eighth') s += glyph(GLYPHS.flag8thDown, sx - 0.6, y + STEM, 'class="flag"');
    }
  }
  return s + '</g>';
}

export function headWidth(value) {
  return HEAD[value].w * K;
}

/**
 * Notensystem-Ausschnitt.
 * notes: [{pos, value, cls, label}] werden nebeneinander gesetzt.
 * opts: clef (bool), gap (Abstand zwischen Noten), pad, lineNumbers, highlightLine
 */
export function staffSVG(notes = [], opts = {}) {
  const { clef = true, gap = 30, pad = 14, lineNumbers = false, highlightPos = null, cls = '', title = '' } = opts;
  const clefW = clef ? 34 : 0;
  const startX = 6 + clefW + pad;
  let noteSlots = notes.map((n, i) => startX + i * gap);
  const last = notes.length ? noteSlots[notes.length - 1] + headWidth(notes[notes.length - 1].value || 'quarter') : startX;
  const natural = last + pad + (lineNumbers ? 14 : 0) + 4;
  const width = Math.max(opts.minWidth || 0, natural);
  if (opts.center && width > natural) {
    const shift = (width - natural) / 2;
    noteSlots = noteSlots.map((x) => x + shift);
  }

  const [vbTop, vbH] = opts.vb || [TOP, HEIGHT];
  let s = `<svg class="staff ${cls}" viewBox="0 ${vbTop} ${width.toFixed(1)} ${vbH}" role="img" aria-label="${title}" xmlns="http://www.w3.org/2000/svg">`;
  if (highlightPos !== null) {
    s += `<rect class="hl" x="2" y="${yOf(highlightPos) - 3}" width="${width - 4}" height="6" rx="3"/>`;
  }
  for (let i = 0; i < 5; i++) {
    const y = yOf(i * 2);
    s += `<line class="line" x1="2" x2="${(width - 2).toFixed(1)}" y1="${y}" y2="${y}"/>`;
    if (lineNumbers) s += `<text class="lnum" x="${width - 6}" y="${y + 3}" text-anchor="middle">${i + 1}</text>`;
  }
  if (clef) s += glyph(GLYPHS.gClef, 8, yOf(2), 'class="clef"');
  notes.forEach((n, i) => {
    s += noteSVG({ ...n, x: noteSlots[i] });
    if (n.label) {
      const cx = noteSlots[i] + headWidth(n.value || 'quarter') / 2;
      s += `<text class="nlabel ${n.labelCls || ''}" x="${cx.toFixed(1)}" y="${HEIGHT - 3}" text-anchor="middle">${n.label}</text>`;
    }
  });
  return s + '</svg>';
}

// Interaktives System für "Note setzen": liefert SVG + Hilfsfunktionen
export const PICK_MIN = -8;
export const PICK_MAX = 11;

export function pickStaffSVG() {
  const width = 120;
  const x = 66;
  let s = `<svg class="staff pick" viewBox="0 ${TOP} ${width} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">`;
  for (let i = 0; i < 5; i++) {
    const y = yOf(i * 2);
    s += `<line class="line" x1="2" x2="${width - 2}" y1="${y}" y2="${y}"/>`;
  }
  s += glyph(GLYPHS.gClef, 8, yOf(2), 'class="clef"');
  s += `<g class="preview" data-x="${x}"></g><g class="placed"></g>`;
  s += `<rect class="hit" x="0" y="0" width="${width}" height="${HEIGHT}" fill="transparent"/>`;
  return s + '</svg>';
}

// Rechnet einen Zeigerpunkt in eine Position um
export function posFromPointer(svg, clientY) {
  const r = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  const y = ((clientY - r.top) / r.height) * vb.height + vb.y;
  const pos = Math.round(((BASE - y) * 2) / S);
  return Math.max(PICK_MIN, Math.min(PICK_MAX, pos));
}
