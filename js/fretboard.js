// Kleines Griffbrett aus Spielersicht: Saite 1 (hohe E) unten, Sattel links, Bünde 0–4.
import { STRINGS } from './music.js';

const FRETS = 4;

/**
 * marks: [{string, fret, label, cls}]
 */
export function fretboardSVG(marks = [], opts = {}) {
  const { frets = FRETS, cls = '' } = opts;
  const left = 30; // Platz für leere Saiten
  const nutX = left + 12;
  const fw = 44; // Bundbreite
  const top = 12;
  const gap = 13; // Saitenabstand
  const width = nutX + frets * fw + 10;
  const height = top + gap * 5 + 22;
  const yS = (string) => top + (string - 1) * gap; // Saite 6 oben … Saite 1 unten
  const yOfString = (string) => yS(7 - string);

  let s = `<svg class="fretboard ${cls}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Griffbrett">`;
  s += `<rect class="fb-wood" x="${nutX}" y="${top - 6}" width="${frets * fw + 4}" height="${gap * 5 + 12}" rx="4"/>`;
  // Bundmarkierungen
  [3, 5].filter((f) => f <= frets).forEach((f) => {
    s += `<circle class="fb-inlay" cx="${nutX + (f - 0.5) * fw}" cy="${top + gap * 2.5}" r="3.4"/>`;
  });
  // Bundstäbchen
  for (let f = 1; f <= frets; f++) {
    const x = nutX + f * fw;
    s += `<line class="fb-fret" x1="${x}" x2="${x}" y1="${top - 6}" y2="${top + gap * 5 + 6}"/>`;
  }
  // Sattel
  s += `<rect class="fb-nut" x="${nutX - 3}" y="${top - 6}" width="5" height="${gap * 5 + 12}" rx="1.5"/>`;
  // Saiten
  for (let st = 1; st <= 6; st++) {
    const y = yOfString(st);
    s += `<line class="fb-string" x1="${left - 2}" x2="${width - 4}" y1="${y}" y2="${y}" stroke-width="${0.7 + (st - 1) * 0.22}"/>`;
    s += `<text class="fb-sname" x="10" y="${y + 3.2}" text-anchor="middle">${STRINGS[st].short}</text>`;
  }
  // Bundzahlen
  for (let f = 1; f <= frets; f++) {
    s += `<text class="fb-fnum" x="${nutX + (f - 0.5) * fw}" y="${height - 3}" text-anchor="middle">${f}</text>`;
  }
  // Markierungen
  marks.forEach((m) => {
    const y = yOfString(m.string);
    const x = m.fret === 0 ? left - 6 + 8 : nutX + (m.fret - 0.5) * fw;
    s += `<g class="fb-mark ${m.cls || ''} ${m.fret === 0 ? 'open' : ''}">`;
    s += `<circle cx="${x}" cy="${y}" r="7.2"/>`;
    if (m.label) s += `<text x="${x}" y="${y + 3.4}" text-anchor="middle">${m.label}</text>`;
    s += '</g>';
  });
  return s + '</svg>';
}
