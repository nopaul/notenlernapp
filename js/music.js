// Musikalische Grunddaten: Noten, Positionen im System, Saiten und Bünde.
// Alle Noten sind notiert (Violinschlüssel). Die Gitarre klingt eine Oktave tiefer.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'H'];
const SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, H: 11 };

export const STRINGS = {
  1: { name: 'hohe E-Saite', short: 'e' },
  2: { name: 'H-Saite', short: 'H' },
  3: { name: 'G-Saite', short: 'G' },
  4: { name: 'D-Saite', short: 'D' },
  5: { name: 'A-Saite', short: 'A' },
  6: { name: 'tiefe E-Saite', short: 'E' },
};

function makeNote(letter, octave, string, fret) {
  const id = `${letter}${octave}`;
  const diatonic = octave * 7 + LETTERS.indexOf(letter);
  return {
    id,
    letter,
    octave,
    string,
    fret,
    // Position im System in halben Linienabständen; 0 = unterste Linie (E4)
    pos: diatonic - (4 * 7 + 2),
    // klingende MIDI-Tonhöhe (notiert minus eine Oktave)
    midi: 12 * (octave + 1) + SEMITONES[letter] - 12,
  };
}

export const NOTES = Object.fromEntries(
  [
    makeNote('E', 3, 6, 0),
    makeNote('A', 3, 5, 0),
    makeNote('D', 4, 4, 0),
    makeNote('G', 4, 3, 0),
    makeNote('H', 4, 2, 0),
    makeNote('E', 5, 1, 0),
    makeNote('F', 5, 1, 1),
    makeNote('G', 5, 1, 3),
    makeNote('C', 5, 2, 1),
    makeNote('D', 5, 2, 3),
  ].map((n) => [n.id, n]),
);

// Lernpfad der ersten Etappe. "facts" sind die Noten, die in der Stufe neu gelernt werden.
export const STAGES = [
  {
    id: 0,
    code: 'T0',
    title: 'Grundlagen',
    subtitle: 'Notensystem, Linien, Violinschlüssel, Notennamen',
    notes: [],
    facts: [],
  },
  {
    id: 1,
    code: 'T1',
    title: 'Die sechs Leersaiten',
    subtitle: 'Deine ersten Leitnoten: E A D G H E',
    notes: ['E3', 'A3', 'D4', 'G4', 'H4', 'E5'],
    facts: ['E5', 'H4', 'G4', 'D4', 'A3', 'E3'],
  },
  {
    id: 2,
    code: 'T2',
    title: 'Saiten 1 und 2',
    subtitle: '1. Lage: E F G auf der hohen E-Saite, H C D auf der H-Saite',
    notes: ['E5', 'F5', 'G5', 'H4', 'C5', 'D5'],
    facts: ['F5', 'C5', 'G5', 'D5'],
  },
];

export function stageOfNote(noteId) {
  return STAGES.find((s) => s.facts.includes(noteId));
}

export function displayLetter(letter, naming = 'de') {
  return naming === 'en' && letter === 'H' ? 'B' : letter;
}

export function displayName(noteId, naming) {
  return displayLetter(NOTES[noteId].letter, naming);
}

export function isLine(pos) {
  return pos % 2 === 0;
}

export function letterAt(pos) {
  const d = pos + 30;
  return LETTERS[((d % 7) + 7) % 7];
}

// Nächstgelegene Position eines Buchstabens zu einer Referenzposition
export function nearestPosOfLetter(letter, refPos) {
  let best = null;
  for (let p = refPos - 6; p <= refPos + 6; p++) {
    if (letterAt(p) === letter && (best === null || Math.abs(p - refPos) < Math.abs(best - refPos))) best = p;
  }
  return best;
}

const ORD = ['1.', '2.', '3.', '4.', '5.'];

export function describePos(pos) {
  if (pos === 4) return 'auf der Mittellinie (3. Linie)';
  if (pos >= 0 && pos <= 8) {
    if (isLine(pos)) {
      const n = pos / 2;
      if (n === 4) return 'auf der obersten Linie';
      if (n === 0) return 'auf der untersten Linie';
      return `auf der ${ORD[n]} Linie`;
    }
    const n = (pos - 1) / 2;
    if (n === 3) return 'im obersten Zwischenraum';
    if (n === 0) return 'im untersten Zwischenraum';
    return `im ${ORD[n]} Zwischenraum`;
  }
  if (pos === -1) return 'direkt unter der untersten Linie';
  if (pos === 9) return 'direkt über der obersten Linie';
  if (pos < -1) {
    const ledger = Math.floor(-pos / 2);
    return isLine(pos) ? `auf der ${ORD[ledger - 1]} Hilfslinie unten` : `unter der ${ORD[ledger - 1]} Hilfslinie unten`;
  }
  const ledger = Math.floor((pos - 8) / 2);
  return isLine(pos) ? `auf der ${ORD[ledger - 1]} Hilfslinie oben` : `über der ${ORD[ledger - 1]} Hilfslinie oben`;
}

export function describeFret(note) {
  const s = STRINGS[note.string];
  if (note.fret === 0) return `Saite ${note.string}, leer (${s.name})`;
  return `Saite ${note.string} (${s.name}), ${note.fret}. Bund`;
}

// Erklärt den Abstand zwischen gewählter und richtiger Position
export function explainDiff(correctPos, chosenPos) {
  const d = chosenPos - correctPos;
  if (d === 0) return '';
  const dir = d > 0 ? 'zu hoch' : 'zu tief';
  const a = Math.abs(d);
  let steps;
  if (a === 1) steps = 'einen Schritt';
  else if (a === 2) steps = isLine(correctPos) ? 'eine Linie' : 'einen Zwischenraum';
  else if (a === 7) steps = 'eine Oktave';
  else steps = `${a} Schritte`;
  return `${steps} ${dir}`;
}
