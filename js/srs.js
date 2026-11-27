// Wiederholungsplan mit FSRS (ts-fsrs) und automatische Bewertung aus Richtigkeit + Reaktionszeit.
import { fsrs, generatorParameters, createEmptyCard, Rating, State } from '../vendor/ts-fsrs.mjs';
import { NOTES, STAGES, inStaff } from './music.js';

export { Rating, State };

const scheduler = fsrs(
  generatorParameters({
    request_retention: 0.9,
    maximum_interval: 60,
    enable_fuzz: true,
    enable_short_term: true,
  }),
);

// Ziel-Reaktionszeiten (Startwerte, werden später an echten Daten nachjustiert)
export const TARGET_RT = { A: 3000, B: 4500 };
export const AUTOMATED_FACTOR = 1.0;

export const CARD_TYPES = {
  A: { name: 'Note → Name', short: 'Lesen' },
  B: { name: 'Name → Note setzen', short: 'Setzen' },
};

export const RATING_LABEL = {
  [Rating.Again]: 'Nochmal',
  [Rating.Hard]: 'Schwer',
  [Rating.Good]: 'Gut',
  [Rating.Easy]: 'Leicht',
};

export function cardId(noteId, type) {
  return `${noteId}:${type}`;
}

export function newCardRecord(noteId, type, now = new Date()) {
  return {
    id: cardId(noteId, type),
    noteId,
    type,
    introduced: now.toISOString(),
    fsrs: serialize(createEmptyCard(now)),
    rtAvg: null,
    recent: [], // letzte Antworten: {ok, fast}
    answers: 0,
    correct: 0,
    automated: false,
  };
}

function serialize(c) {
  return {
    ...c,
    due: new Date(c.due).toISOString(),
    last_review: c.last_review ? new Date(c.last_review).toISOString() : null,
  };
}

function revive(c) {
  return { ...c, due: new Date(c.due), last_review: c.last_review ? new Date(c.last_review) : undefined };
}

export function dueDate(card) {
  return new Date(card.fsrs.due);
}

export function stabilityDays(card) {
  return card.fsrs.stability || 0;
}

export function rateAnswer(card, correct, rt) {
  const target = TARGET_RT[card.type];
  if (!correct || rt >= 3 * target) return Rating.Again;
  if (rt > 1.5 * target) return Rating.Hard;
  const recentFast = card.recent.slice(-2);
  if (rt < target && recentFast.length === 2 && recentFast.every((r) => r.ok && r.fast)) return Rating.Easy;
  return Rating.Good;
}

// Wendet eine gezählte Antwort an. Gibt die Bewertung zurück.
export function applyAnswer(card, correct, rt, now = new Date()) {
  const target = TARGET_RT[card.type];
  const rating = rateAnswer(card, correct, rt);
  const res = scheduler.next(revive(card.fsrs), now, rating);
  card.fsrs = serialize(res.card);
  card.answers += 1;
  if (correct) {
    card.correct += 1;
    const capped = Math.min(rt, 3 * target);
    card.rtAvg = card.rtAvg === null ? capped : card.rtAvg * 0.7 + capped * 0.3;
  }
  card.recent.push({ ok: correct, fast: correct && rt < target });
  if (card.recent.length > 6) card.recent.shift();
  card.automated = correct && card.rtAvg !== null && card.rtAvg < target * AUTOMATED_FACTOR && card.answers >= 3;
  return rating;
}

export function retrievability(card, now = new Date()) {
  try {
    return scheduler.get_retrievability(revive(card.fsrs), now, false);
  } catch {
    return 0;
  }
}

// Beherrschung einer Note 0..1 aus Stabilität, Trefferquote und Tempo
export function mastery(cards) {
  if (!cards.length) return 0;
  const vals = cards.map((c) => {
    if (!c.answers) return 0;
    const acc = c.correct / c.answers;
    const stab = Math.min(1, stabilityDays(c) / 7);
    const speed = c.rtAvg ? Math.max(0, Math.min(1, (3 * TARGET_RT[c.type] - c.rtAvg) / (2 * TARGET_RT[c.type]))) : 0;
    return 0.45 * stab + 0.3 * acc + 0.25 * speed;
  });
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// Freischaltung der nächsten Stufe: 85 % der Karten mindestens 3 Tage stabil, 70 % automatisiert
export function stageReadiness(state, stage) {
  const ids = stage.notes.filter(inStaff).flatMap((n) => ['A', 'B'].map((t) => cardId(n, t)));
  const cards = ids.map((id) => state.cards[id]).filter(Boolean);
  const total = ids.length;
  const stable = cards.filter((c) => stabilityDays(c) >= 3).length;
  const auto = cards.filter((c) => c.automated).length;
  return {
    total,
    introduced: cards.length,
    stable,
    automated: auto,
    stableShare: stable / total,
    autoShare: auto / total,
    ready: stable / total >= 0.85 && auto / total >= 0.7,
  };
}

export function isUnlocked(state, stageId) {
  if (stageId === 0) return true;
  if (stageId === 1) return true;
  return !!state.unlocked[stageId];
}

export function noteCards(state, noteId) {
  return ['A', 'B'].map((t) => state.cards[cardId(noteId, t)]).filter(Boolean);
}

export function allStageNotes() {
  const seen = new Set();
  const out = [];
  STAGES.forEach((s) => s.notes.forEach((n) => !seen.has(n) && (seen.add(n), out.push(n))));
  return out.filter((n) => NOTES[n]);
}
