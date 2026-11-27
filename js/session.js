// Stellt eine Tagessitzung zusammen: Aufwärmen, fällige Wiederholungen, neue Noten.
import { STAGES, NOTES, inStaff } from './music.js';
import { cardId, dueDate, stabilityDays, isUnlocked, State } from './srs.js';

export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function introducedToday(state, type) {
  const t = todayKey();
  return Object.values(state.cards).filter((c) => c.type === type && todayKey(new Date(c.introduced)) === t).length;
}

// Karten zu Noten mit Hilfslinien ruhen vorerst
export function activeCards(state) {
  return Object.values(state.cards).filter((c) => inStaff(c.noteId));
}

export function dueCards(state, now = new Date()) {
  return activeCards(state)
    .filter((c) => dueDate(c) <= now)
    .sort((a, b) => dueDate(a) - dueDate(b));
}

export function newCandidates(state) {
  const facts = [];
  const bCards = [];
  STAGES.forEach((stage) => {
    if (!stage.facts.length || !isUnlocked(state, stage.id)) return;
    stage.facts.forEach((n) => {
      if (inStaff(n) && !state.cards[cardId(n, 'A')]) facts.push({ noteId: n, stageId: stage.id });
    });
  });
  // Karte B ("Note setzen") kommt, sobald Karte A die Lernphase verlassen hat
  activeCards(state)
    .filter((c) => c.type === 'A' && c.fsrs.state === State.Review && !state.cards[cardId(c.noteId, 'B')])
    .forEach((c) => bCards.push({ noteId: c.noteId }));
  return { facts, bCards };
}

export function newAllowance(state, now = new Date()) {
  const overdue = dueCards(state, now).length;
  const day = state.days[todayKey(now)] || { answers: 0, correct: 0 };
  const acc = day.answers >= 10 ? day.correct / day.answers : 1;
  const blockedReason = overdue > 50 ? 'Erst die vielen fälligen Karten wiederholen.' : acc < 0.8 ? 'Heute lieber festigen statt Neues.' : null;
  const facts = blockedReason ? 0 : Math.max(0, state.settings.newPerDay - introducedToday(state, 'A'));
  const b = blockedReason ? 0 : Math.max(0, 3 - introducedToday(state, 'B'));
  return { facts, b, blockedReason };
}

export function planSummary(state, now = new Date()) {
  const due = dueCards(state, now).length;
  const allow = newAllowance(state, now);
  const cand = newCandidates(state);
  const newFacts = Math.min(allow.facts, cand.facts.length);
  const newB = Math.min(allow.b, cand.bCards.length);
  return { due, newFacts, newB, blockedReason: allow.blockedReason, factsLeft: cand.facts.length };
}

export function buildSession(state, { minutes = 12, short = false, extra = false } = {}) {
  const now = new Date();
  const queue = [];
  const maxReviews = Math.max(15, Math.round((minutes * 60) / 7));
  let due = dueCards(state, now);

  if (extra && !due.length) {
    // Zusatzrunde: die Karten, die als Nächstes fällig würden
    due = activeCards(state)
      .sort((a, b) => dueDate(a) - dueDate(b))
      .slice(0, 12);
  }
  due = due.slice(0, maxReviews);

  // Aufwärmen: die stabilsten fälligen Karten zuerst
  let warm = [];
  if (due.length > 8) {
    warm = [...due].sort((a, b) => stabilityDays(b) - stabilityDays(a)).slice(0, 5);
    due = due.filter((c) => !warm.includes(c));
  }
  const reviews = [...warm, ...due].map((c) => ({ kind: 'card', cardId: c.id }));

  // Neue Karten in Blöcken, etwa eine auf vier Wiederholungen
  const blocks = [];
  if (!short && !extra) {
    const allow = newAllowance(state, now);
    const cand = newCandidates(state);
    const galleryDone = new Set(Object.keys(state.galleriesSeen || {}).map(Number));
    cand.facts.slice(0, allow.facts).forEach((f) => {
      const block = [];
      if (!galleryDone.has(f.stageId)) {
        block.push({ kind: 'gallery', stageId: f.stageId });
        galleryDone.add(f.stageId);
      }
      block.push({ kind: 'intro', noteId: f.noteId });
      block.push({ kind: 'card', cardId: cardId(f.noteId, 'A'), create: { noteId: f.noteId, type: 'A' } });
      blocks.push(block);
    });
    cand.bCards.slice(0, allow.b).forEach((b) => {
      blocks.push([{ kind: 'card', cardId: cardId(b.noteId, 'B'), create: { noteId: b.noteId, type: 'B' } }]);
    });
  }

  const warmCount = warm.length;
  queue.push(...reviews.slice(0, warmCount));
  const rest = reviews.slice(warmCount);
  while (rest.length || blocks.length) {
    queue.push(...rest.splice(0, 4));
    if (blocks.length) queue.push(...blocks.shift());
  }
  separateSameNote(queue);
  return { queue, startedAt: Date.now(), minutes, short, extra, results: [], newNotes: [], automatedBefore: automatedSet(state) };
}

export function automatedSet(state) {
  return new Set(Object.values(state.cards).filter((c) => c.automated).map((c) => c.id));
}

function noteOf(item) {
  if (item.kind === 'card') return item.cardId.split(':')[0];
  return item.noteId || null;
}

// Karten zur selben Note sollen nicht direkt hintereinander kommen
function separateSameNote(queue) {
  for (let i = 1; i < queue.length; i++) {
    const a = queue[i - 1];
    const b = queue[i];
    if (a.kind === 'card' && b.kind === 'card' && !b.create && noteOf(a) === noteOf(b)) {
      const j = queue.findIndex((q, k) => k > i && q.kind === 'card' && !q.create && noteOf(q) !== noteOf(a));
      if (j > 0) [queue[i], queue[j]] = [queue[j], queue[i]];
    }
  }
}

// Fügt eine Karte einige Plätze später wieder ein (nicht neben dieselbe Note)
export function requeue(session, item, offset) {
  const q = session.queue;
  let pos = Math.min(offset, q.length);
  while (pos < q.length && pos > 0 && noteOf(q[pos - 1]) === noteOf(item)) pos++;
  q.splice(pos, 0, item);
}

export function noteForItem(item) {
  const id = noteOf(item);
  return id ? NOTES[id] : null;
}
