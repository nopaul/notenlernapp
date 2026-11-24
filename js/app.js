// NotenLernApp – Oberfläche und Ablauf
import { NOTES, STAGES, LETTERS, STRINGS, displayLetter, displayName, describePos, describeFret, explainDiff, nearestPosOfLetter, isLine, letterAt } from './music.js';
import { staffSVG, noteSVG, pickStaffSVG, posFromPointer, PICK_MIN, PICK_MAX } from './notation.js';
import { fretboardSVG } from './fretboard.js';
import { playMidi, playError, sound } from './audio.js';
import * as store from './store.js';
import { newCardRecord, applyAnswer, dueDate, mastery, stageReadiness, isUnlocked, noteCards, cardId, TARGET_RT, RATING_LABEL, CARD_TYPES } from './srs.js';
import { buildSession, planSummary, requeue, todayKey, automatedSet } from './session.js';
import { ICONS } from './icons.js';

const app = document.getElementById('app');
let state = null;
let session = null;
let keyHandler = null;
let timerId = null;
let advanceId = null;

// ---------- Zustand ----------
function defaultState() {
  return {
    version: 1,
    created: new Date().toISOString(),
    settings: { minutes: 12, newPerDay: 3, naming: 'de', sound: true },
    cards: {},
    unlocked: {},
    t0Done: false,
    galleriesSeen: {},
    help: {},
    days: {},
    lastExport: null,
  };
}

function migrate(s) {
  const d = defaultState();
  return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) } };
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.saveState(state), 50);
}

const naming = () => state.settings.naming;
const nm = (noteId) => displayName(noteId, naming());
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- Hilfen ----------
function fmtSec(ms) {
  return (ms / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' s';
}
function fmtWhen(date) {
  const now = new Date();
  const diff = date - now;
  if (diff <= 0) return 'jetzt';
  const min = Math.round(diff / 60000);
  if (min < 60) return `in ${min} min`;
  const h = Math.round(min / 60);
  const sameDay = todayKey(date) === todayKey(now);
  const tomorrow = todayKey(date) === todayKey(new Date(now.getTime() + 86400000));
  const time = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return h <= 1 ? 'in etwa 1 Std.' : `heute um ${time}`;
  if (tomorrow) return `morgen um ${time}`;
  const days = Math.round(diff / 86400000);
  return `in ${days} Tagen`;
}
function median(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
function play(noteId) {
  playMidi(NOTES[noteId].midi);
}

function noteStaff(noteId, { value = 'whole', clef = true, cls = '', label = null, minWidth = 0, labelCls = '' } = {}) {
  const n = NOTES[noteId];
  return staffSVG([{ pos: n.pos, value, cls, label, labelCls }], { clef, minWidth, center: true, title: `Note ${nm(noteId)}` });
}
function noteFret(noteId, cls = '') {
  const n = NOTES[noteId];
  return fretboardSVG([{ string: n.string, fret: n.fret, label: nm(noteId), cls }]);
}

// ---------- Rahmen ----------
function shell(content, active) {
  const nav = [
    ['#/heute', 'home', 'Heute'],
    ['#/noten', 'notes', 'Noten'],
    ['#/einstellungen', 'settings', 'Einstellungen'],
  ];
  return `
  <div class="shell">
    <header class="topbar">
      <a class="brand" href="#/heute"><span class="brand-mark">${ICONS.clef}</span><span>Noten<b>Lern</b>App</span></a>
    </header>
    ${content}
  </div>
  <nav class="nav" aria-label="Hauptnavigation">
    ${nav.map(([h, ic, label]) => `<a href="${h}" class="${active === h ? 'active' : ''}">${ICONS[ic]}<span>${label}</span></a>`).join('')}
  </nav>`;
}

function stopTimers() {
  clearInterval(timerId);
  clearTimeout(advanceId);
  timerId = null;
  advanceId = null;
}

// ---------- Router ----------
function route() {
  stopTimers();
  keyHandler = null;
  const h = location.hash || '#/heute';
  if (h !== '#/ueben' && session) session = null;
  window.scrollTo(0, 0);
  if (h === '#/ueben') {
    if (!session) return (location.hash = '#/heute');
    return nextItem();
  }
  if (h === '#/noten') return renderNotes();
  if (h === '#/grundlagen') return renderBasics();
  if (h === '#/einstellungen') return renderSettings();
  const m = h.match(/^#\/stufe\/(\d+)$/);
  if (m) return renderStage(Number(m[1]));
  return renderHome();
}

// ---------- Heute ----------
function weekInfo() {
  const now = new Date();
  const dow = (now.getDay() + 6) % 7; // Montag = 0
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
  const names = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  let count = 0;
  const days = names.map((n, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const k = todayKey(d);
    const done = (state.days[k]?.answers || 0) > 0;
    if (done) count++;
    return { n, done, today: i === dow };
  });
  return { days, count };
}

function checkUnlocks() {
  STAGES.forEach((st, i) => {
    if (i < 2) return;
    const prev = STAGES[i - 1];
    if (!state.unlocked[st.id] && stageReadiness(state, prev).ready) {
      state.unlocked[st.id] = true;
      save();
      toast(`Stufe ${st.code} freigeschaltet: ${st.title}`);
    }
  });
}

function stageStatus(st) {
  if (st.id === 0) return state.t0Done ? 'done' : 'active';
  if (!isUnlocked(state, st.id)) return 'locked';
  const next = STAGES[st.id + 1];
  if (next && isUnlocked(state, next.id) && stageReadiness(state, st).ready) return 'done';
  return 'active';
}

function stageProgress(st) {
  if (st.id === 0) return state.t0Done ? 1 : 0;
  const m = st.notes.map((n) => mastery(noteCards(state, n)));
  return m.reduce((a, b) => a + b, 0) / m.length;
}

function stageRow(st) {
  const status = stageStatus(st);
  const p = stageProgress(st);
  const side =
    status === 'locked' ? `${ICONS.lock}` : status === 'done' ? 'Geschafft' : st.id === 0 ? 'Start' : `${Math.round(p * 100)} %`;
  const href = st.id === 0 ? '#/grundlagen' : `#/stufe/${st.id}`;
  return `<a class="stage ${status}" href="${href}">
    <div class="stage-badge">${status === 'done' ? ICONS.check : st.code}</div>
    <div><h3>${st.title}</h3><p>${st.subtitle}</p><div class="bar ${status === 'done' ? 'ok' : ''}"><i style="width:${Math.round(p * 100)}%"></i></div></div>
    <div class="stage-side">${side}</div>
  </a>`;
}

function heroArt(noteId) {
  const n = NOTES[noteId];
  const name = nm(noteId);
  return `<div class="hero-art">
    <div class="paper">${staffSVG(
      [
        { pos: n.pos, value: 'whole', label: name },
        { pos: n.pos, value: 'quarter', label: name },
      ],
      { clef: true, gap: 40, title: `Note ${name}` },
    )}</div>
    <div class="fb-wrap">${noteFret(noteId)}</div>
  </div>`;
}

function renderHome() {
  checkUnlocks();
  const plan = planSummary(state);
  const anyCards = Object.keys(state.cards).length > 0;
  const total = plan.due + plan.newFacts + plan.newB;
  const week = weekInfo();
  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 11 ? 'Guten Morgen' : hour < 18 ? 'Hallo' : 'Guten Abend';
  const dateStr = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

  const nextFact = STAGES.flatMap((s) => (isUnlocked(state, s.id) ? s.facts : [])).find((n) => !state.cards[cardId(n, 'A')]);
  const artNote = nextFact || 'G4';

  let hero;
  if (!state.t0Done && !anyCards) {
    hero = `<div><span class="badge">${ICONS.sparkle} Willkommen</span>
      <h2 style="margin-top:14px">Lerne Noten lesen, Bild für Bild.</h2>
      <p>Jeden Tag 10–15 Minuten. Starte mit einer kurzen Einführung ins Notensystem, danach lernst du die sechs Leersaiten deiner Gitarre.</p>
      <div class="hero-actions">
        <a class="btn btn-primary btn-lg" href="#/grundlagen">${ICONS.book} Grundlagen starten</a>
        <button class="btn btn-soft btn-lg" data-act="start">Direkt üben</button>
      </div></div>${heroArt('G4')}`;
  } else if (total > 0) {
    const mins = state.settings.minutes;
    hero = `<div><span class="eyebrow">${dateStr}</span>
      <h2 style="margin-top:6px">${greet}! Bereit für deine Runde?</h2>
      <div class="stats">
        <div class="stat"><b>${plan.due}</b><span>fällig</span></div>
        <div class="stat"><b>${plan.newFacts}</b><span>neue Noten</span></div>
        ${plan.newB ? `<div class="stat"><b>${plan.newB}</b><span>neue Setz-Karten</span></div>` : ''}
      </div>
      ${plan.blockedReason ? `<p class="small">${plan.blockedReason}</p>` : ''}
      <div class="hero-actions">
        <button class="btn btn-primary btn-lg" data-act="start">${ICONS.play} Sitzung starten · ca. ${mins} min</button>
        ${plan.due ? `<button class="btn btn-soft btn-lg" data-act="short">${ICONS.bolt} 3 Minuten</button>` : ''}
      </div></div>${heroArt(artNote)}`;
  } else {
    const dues = Object.values(state.cards).map(dueDate).sort((a, b) => a - b);
    const next = dues[0];
    hero = `<div><span class="badge" style="background:var(--ok-soft);color:var(--ok)">${ICONS.check} Erledigt</span>
      <h2 style="margin-top:14px">Für heute bist du durch.</h2>
      <p>${next ? `Die nächste Karte ist ${fmtWhen(next)} fällig. ` : ''}Pausen gehören zum Lernen: Was sich setzen darf, bleibt länger.</p>
      <div class="hero-actions">
        ${anyCards ? `<button class="btn btn-soft btn-lg" data-act="extra">${ICONS.retry} Zusatzrunde</button>` : ''}
        <a class="btn btn-ghost btn-lg" href="#/noten">Noten ansehen</a>
      </div></div>${heroArt(artNote)}`;
  }

  const backupDue =
    anyCards && (state.lastExport ? Date.now() - new Date(state.lastExport) > 7 * 86400000 : Date.now() - new Date(state.created) > 3 * 86400000);

  const learned = Object.keys(NOTES).filter((n) => state.cards[cardId(n, 'A')]);
  const content = `
    <section class="page-head"><div class="eyebrow">Heute</div><h1>Notenlesen für Gitarre</h1></section>
    <section class="hero">${hero}</section>
    ${backupDue ? `<div class="notice">${ICONS.shield}<p>Sichere deinen Lernstand ab und zu als Datei. Browser können Daten nach längerer Pause löschen.</p><button class="btn btn-soft" data-act="export">Backup speichern</button></div>` : ''}
    <div class="section-title"><h2>Diese Woche</h2></div>
    <div class="card week">
      <div class="week-days">${week.days.map((d) => `<div class="day ${d.done ? 'done' : ''} ${d.today ? 'today' : ''}"><i>${ICONS.check}</i>${d.n}</div>`).join('')}</div>
      <div class="week-text"><b>${week.count} von 7 Tagen</b><div class="muted small">Ein Pausentag ist eingeplant.</div></div>
    </div>
    <div class="section-title"><h2>Lernpfad</h2></div>
    <div class="path">${STAGES.map(stageRow).join('')}</div>
    ${
      learned.length
        ? `<div class="section-title"><h2>Deine Noten</h2><a class="link" href="#/noten">Alle ansehen</a></div>
    <div class="note-strip">${learned.map((n) => noteTile(n)).join('')}</div>`
        : ''
    }
  `;
  app.innerHTML = shell(content, '#/heute');
  bindCommon();
}

function noteTile(n) {
  const m = mastery(noteCards(state, n));
  return `<button class="note-tile" data-note="${n}">
    <div class="paper">${noteStaff(n, { value: 'quarter' })}</div>
    <b>${nm(n)}</b>
    <div class="bar"><i style="width:${Math.round(m * 100)}%"></i></div>
  </button>`;
}

function bindCommon() {
  app.querySelectorAll('[data-act]').forEach((b) =>
    b.addEventListener('click', () => {
      const a = b.dataset.act;
      if (a === 'start') startSession({});
      if (a === 'short') startSession({ short: true });
      if (a === 'extra') startSession({ extra: true });
      if (a === 'export') exportData();
    }),
  );
  app.querySelectorAll('[data-note]').forEach((b) => b.addEventListener('click', () => openNoteModal(b.dataset.note)));
}

// ---------- Lernkarte als Dialog ----------
function learnCardHTML(noteId, { reveal = false } = {}) {
  const n = NOTES[noteId];
  const name = nm(noteId);
  return `<div class="intro ${reveal ? 'reveal' : ''}">
    <span class="badge">${reveal ? 'Neue Note' : 'Lernkarte'}</span>
    <div><h2>${name}</h2><p class="lead">${describeFret(n)}</p></div>
    <div class="paper">${staffSVG(
      [
        { pos: n.pos, value: 'whole', label: name },
        { pos: n.pos, value: 'quarter', label: name },
        { pos: n.pos, value: 'half', label: name },
      ],
      { clef: true, gap: 34, title: `Note ${name}` },
    )}</div>
    <div class="fb-wrap">${noteFret(noteId)}</div>
    <p class="desc">Das <b>${name}</b> liegt ${describePos(n.pos)}. Ob ganze Note, Halbe oder Viertel: Die Höhe bestimmt den Ton, die Form nur die Länge.</p>
    <div class="row-actions"><button class="btn btn-soft" data-play="${noteId}">${ICONS.sound} Anhören</button>${reveal ? `<button class="btn btn-primary" data-next>Verstanden, jetzt abfragen ${ICONS.arrow}</button>` : ''}</div>
  </div>`;
}

function openNoteModal(noteId) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  const cards = noteCards(state, noteId);
  const stats = cards.length
    ? `<div class="tiles" style="margin-top:16px">${cards
        .map(
          (c) =>
            `<div class="tile"><b>${c.answers ? Math.round((100 * c.correct) / c.answers) : 0} %</b><span>${CARD_TYPES[c.type].short}: richtig</span></div><div class="tile"><b>${c.rtAvg ? fmtSec(c.rtAvg) : '–'}</b><span>${CARD_TYPES[c.type].short}: Tempo</span></div>`,
        )
        .join('')}</div><p class="muted small" style="text-align:center">Nächste Wiederholung: ${fmtWhen(new Date(Math.min(...cards.map((c) => dueDate(c)))))}</p>`
    : `<p class="muted small" style="text-align:center;margin-top:12px">Diese Note ist noch nicht in deinen Karten.</p>`;
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><button class="icon-btn close" aria-label="Schließen">${ICONS.x}</button>${learnCardHTML(noteId)}${stats}</div>`;
  document.body.appendChild(back);
  const close = () => {
    back.remove();
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', (e) => e.target === back && close());
  back.querySelector('.close').addEventListener('click', close);
  back.querySelector('[data-play]').addEventListener('click', () => play(noteId));
  play(noteId);
}

// ---------- Noten-Übersicht ----------
function galleryCard(n, withStats = true) {
  const cards = noteCards(state, n);
  const m = mastery(cards);
  const known = cards.length > 0;
  const acc = cards.reduce((a, c) => a + c.answers, 0) ? Math.round((100 * cards.reduce((a, c) => a + c.correct, 0)) / cards.reduce((a, c) => a + c.answers, 0)) : null;
  return `<button class="g-card" data-note="${n}">
    <div class="paper">${noteStaff(n, { value: 'quarter', minWidth: 96 })}</div>
    <div class="g-name"><b>${nm(n)}</b><span>${describeFret(NOTES[n]).replace(/ \(.*\)/, '')}</span></div>
    <div class="fb-wrap">${noteFret(n)}</div>
    ${
      withStats
        ? `<div class="bar"><i style="width:${Math.round(m * 100)}%"></i></div>
    <div class="g-meta"><span>${known ? `${acc ?? 0} % richtig` : 'noch neu'}</span><span>${cards.some((c) => c.automated) ? 'flüssig' : ''}</span></div>`
        : ''
    }
  </button>`;
}

function renderNotes() {
  const content = `
    <section class="page-head"><div class="eyebrow">Bildergalerie</div><h1>Deine Noten</h1>
    <p class="muted">Tippe auf eine Karte, um die Lernkarte zu öffnen und den Ton zu hören.</p></section>
    ${STAGES.filter((s) => s.notes.length)
      .map(
        (s) => `<div class="section-title"><h2>${s.code} · ${s.title}</h2>${!isUnlocked(state, s.id) ? `<span class="muted small">${ICONS.lock ? 'gesperrt' : ''}</span>` : ''}</div>
      <div class="gallery">${s.notes.map((n) => galleryCard(n)).join('')}</div>`,
      )
      .join('')}`;
  app.innerHTML = shell(content, '#/noten');
  bindCommon();
}

function renderStage(id) {
  const st = STAGES[id];
  if (!st || id === 0) return (location.hash = '#/grundlagen');
  const unlocked = isUnlocked(state, id);
  const prev = STAGES[id - 1];
  const r = stageReadiness(state, st);
  let info = '';
  if (!unlocked) {
    const pr = stageReadiness(state, prev);
    info = `<div class="notice">${ICONS.lock}<p>Diese Stufe öffnet sich, wenn ${prev.code} sitzt: 85 % der Karten mindestens 3 Tage stabil (jetzt ${Math.round(pr.stableShare * 100)} %) und 70 % flüssig (jetzt ${Math.round(pr.autoShare * 100)} %).</p><button class="btn btn-soft" data-unlock>Früher freischalten</button></div>`;
  } else {
    info = `<div class="stats"><div class="stat"><b>${r.introduced}/${r.total}</b><span>Karten begonnen</span></div><div class="stat"><b>${Math.round(r.stableShare * 100)} %</b><span>3+ Tage stabil</span></div><div class="stat"><b>${Math.round(r.autoShare * 100)} %</b><span>flüssig</span></div></div>`;
  }
  const content = `
    <section class="page-head"><a class="btn btn-ghost" href="#/heute" style="padding-left:0">${ICONS.back} Heute</a>
      <div class="eyebrow" style="margin-top:10px">Stufe ${st.code}</div><h1>${st.title}</h1><p class="muted">${st.subtitle}</p>${info}</section>
    <div class="gallery">${st.notes.map((n) => galleryCard(n)).join('')}</div>
    ${unlocked ? `<div style="margin-top:24px"><button class="btn btn-primary btn-lg" data-act="start">${ICONS.play} Jetzt üben</button></div>` : ''}`;
  app.innerHTML = shell(content, '');
  bindCommon();
  const u = app.querySelector('[data-unlock]');
  if (u) {
    let armed = false;
    u.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        u.textContent = 'Wirklich? Nochmal tippen';
        u.closest('.notice').querySelector('p').textContent = `Empfohlen ist, erst ${prev.code} zu festigen. Neue Noten auf wackeligem Grund bringen mehr Verwechslungen. Du kannst trotzdem weitermachen.`;
        return;
      }
      state.unlocked[id] = true;
      save();
      toast(`Stufe ${st.code} freigeschaltet`);
      renderStage(id);
    });
  }
}

// ---------- Sitzung ----------
function startSession(opts) {
  store.requestPersist();
  session = buildSession(state, { minutes: opts.short ? 3 : state.settings.minutes, ...opts });
  if (!session.queue.length) {
    toast('Gerade gibt es nichts zu üben.');
    session = null;
    return;
  }
  session.total = session.queue.length;
  session.done = 0;
  if (location.hash === '#/ueben') route();
  else location.hash = '#/ueben';
}

function sessionFrame(inner) {
  const elapsed = Date.now() - session.startedAt;
  const left = Math.max(0, session.minutes * 60000 - elapsed);
  const progress = session.done / Math.max(1, session.done + session.queue.length + 1);
  return `<div class="session">
    <header class="s-top">
      <button class="icon-btn" data-quit aria-label="Sitzung beenden">${ICONS.x}</button>
      <div class="s-progress"><i style="width:${Math.round(progress * 100)}%"></i></div>
      <span class="s-timer">${fmtClock(left)}</span>
    </header>
    <main class="s-stage">${inner}</main>
  </div>`;
}

function fmtClock(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function mountSession(inner) {
  app.innerHTML = sessionFrame(inner);
  app.querySelector('[data-quit]').addEventListener('click', () => finishSession(true));
  clearInterval(timerId);
  timerId = setInterval(() => {
    const t = app.querySelector('.s-timer');
    if (!t || !session) return clearInterval(timerId);
    t.textContent = fmtClock(Math.max(0, session.minutes * 60000 - (Date.now() - session.startedAt)));
  }, 1000);
}

function nextItem() {
  clearTimeout(advanceId);
  if (!session) return;
  const elapsed = (Date.now() - session.startedAt) / 60000;
  // Neue Karten und Einführungen überspringen, wenn die Zeit um ist
  if (elapsed >= session.minutes) {
    session.queue = session.queue.filter((q) => q.retry);
  }
  if (!session.queue.length) return finishSession();
  const item = session.queue.shift();
  session.current = item;
  if (item.kind === 'gallery') return showGallery(item);
  if (item.kind === 'intro') return showIntro(item);
  return showCard(item);
}

function advance() {
  if (!session) return;
  session.done += 1;
  nextItem();
}

function showGallery(item) {
  const st = STAGES[item.stageId];
  mountSession(`
    <div style="text-align:center;display:grid;gap:8px"><span class="badge">Neue Stufe · ${st.code}</span><h2 style="font-size:2rem;font-weight:800">${st.title}</h2><p class="muted" style="margin:0">Schau dir alle Noten dieser Stufe einmal an. Tippe auf eine Karte, um sie zu hören.</p></div>
    <div class="gallery">${st.notes.map((n) => galleryCard(n, false)).join('')}</div>
    <div class="row-actions"><button class="btn btn-primary btn-lg" data-next>Los geht's ${ICONS.arrow}</button></div>`);
  app.querySelectorAll('[data-note]').forEach((b) =>
    b.addEventListener('click', () => {
      play(b.dataset.note);
      app.querySelectorAll('.g-card').forEach((g) => g.classList.remove('playing'));
      b.classList.add('playing');
    }),
  );
  const go = () => {
    state.galleriesSeen[item.stageId] = true;
    save();
    advance();
  };
  app.querySelector('[data-next]').addEventListener('click', go);
  keyHandler = (e) => e.key === 'Enter' && go();
}

function showIntro(item) {
  mountSession(learnCardHTML(item.noteId, { reveal: true }));
  // Erst Klang, dann Bild (das Bild blendet verzögert ein)
  setTimeout(() => play(item.noteId), 150);
  app.querySelector('[data-play]').addEventListener('click', () => play(item.noteId));
  app.querySelector('[data-next]').addEventListener('click', advance);
  keyHandler = (e) => e.key === 'Enter' && advance();
}

function pickValue(card) {
  if (card.answers < 3) return Math.random() < 0.5 ? 'whole' : 'quarter';
  const r = Math.random();
  return r < 0.25 ? 'whole' : r < 0.5 ? 'half' : r < 0.8 ? 'quarter' : 'eighth';
}

function showCard(item) {
  if (item.create && !state.cards[item.cardId]) {
    state.cards[item.cardId] = newCardRecord(item.create.noteId, item.create.type);
    if (item.create.type === 'A') session.newNotes.push(item.create.noteId);
    save();
  }
  const card = state.cards[item.cardId];
  if (!card) return advance();
  if (card.type === 'A') return showCardA(item, card);
  return showCardB(item, card);
}

function cardHeader(item, card) {
  const isNew = card.answers === 0 && !item.retry;
  return `<div class="q-type">${item.retry ? '<span class="q-new">Nochmal</span>' : isNew ? '<span class="q-new">Neue Karte</span>' : CARD_TYPES[card.type].name}</div>`;
}

function showCardA(item, card) {
  const note = NOTES[card.noteId];
  const value = item.value || pickValue(card);
  const clef = item.clef ?? !(card.answers >= 4 && Math.random() < 0.3);
  item.value = value;
  item.clef = clef;
  const letters = LETTERS.map((l) => ({ l, d: displayLetter(l, naming()) }));
  mountSession(`
    ${cardHeader(item, card)}
    <div class="q-label">Welche Note ist das?</div>
    <div class="paper q-card" id="qcard">${noteStaff(card.noteId, { value, clef, minWidth: 120 })}</div>
    <div class="keypad" role="group" aria-label="Notennamen">${letters.map(({ l, d }) => `<button class="key" data-letter="${l}">${d}</button>`).join('')}</div>
    <div class="kbd-hint">Tastatur: ${letters.map((x) => x.d).join(' ')}</div>
    <div id="fb"></div>`);
  let answered = false;
  const t0 = performance.now();
  const submit = (letter, input) => {
    if (answered) return;
    answered = true;
    const rt = performance.now() - t0;
    const correct = letter === note.letter;
    app.querySelectorAll('.key').forEach((k) => (k.disabled = true));
    const key = app.querySelector(`.key[data-letter="${letter}"]`);
    key.classList.add(correct ? 'ok' : 'err');
    if (!correct) app.querySelector(`.key[data-letter="${note.letter}"]`).classList.add('ok');
    const chosenPos = nearestPosOfLetter(letter, note.pos);
    onAnswered(item, card, { correct, rt, given: letter, chosenPos, input });
  };
  app.querySelectorAll('.key').forEach((k) => k.addEventListener('click', () => submit(k.dataset.letter, 'keypad')));
  keyHandler = (e) => {
    const k = e.key.toUpperCase();
    const map = naming() === 'en' ? { B: 'H' } : { B: null };
    const letter = k in map ? map[k] : k;
    if (letter && LETTERS.includes(letter)) submit(letter, 'keyboard');
  };
}

function showCardB(item, card) {
  const note = NOTES[card.noteId];
  const firstTime = !state.help.B;
  mountSession(`
    ${cardHeader(item, card)}
    <div class="q-label">Setze die Note <b>${nm(card.noteId)}</b></div>
    <div class="q-fret fb-wrap">${fretboardSVG([{ string: note.string, fret: note.fret, label: nm(card.noteId) }])}</div>
    <div class="paper q-card" id="qcard">${pickStaffSVG()}</div>
    <p class="pick-hint">${firstTime ? 'Neu: Tippe auf die Linie oder den Zwischenraum. Gedrückt halten und ziehen zum Korrigieren. ' : ''}Tastatur: ↑ ↓ und Enter.</p>
    <div id="fb"></div>`);
  if (firstTime) {
    state.help.B = true;
    save();
  }
  const svg = app.querySelector('svg.pick');
  const prev = svg.querySelector('.preview');
  const X = 66;
  let cur = null;
  let dragging = false;
  let answered = false;
  const t0 = performance.now();
  const show = (pos) => {
    cur = pos;
    prev.innerHTML = noteSVG({ pos, value: 'whole', x: X, cls: 'preview' });
  };
  const submit = (input) => {
    if (answered || cur === null) return;
    answered = true;
    const rt = performance.now() - t0;
    const correct = cur === note.pos;
    prev.innerHTML = '';
    svg.querySelector('.placed').innerHTML = noteSVG({ pos: cur, value: 'whole', x: X, cls: correct ? 'ok' : 'placed' });
    onAnswered(item, card, { correct, rt, given: `pos:${cur}`, chosenPos: cur, input });
  };
  svg.addEventListener('pointerdown', (e) => {
    if (answered) return;
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    show(posFromPointer(svg, e.clientY));
  });
  svg.addEventListener('pointermove', (e) => {
    if (answered) return;
    if (dragging || e.pointerType === 'mouse') show(posFromPointer(svg, e.clientY));
  });
  svg.addEventListener('pointerup', () => {
    if (!dragging || answered) return;
    dragging = false;
    submit('staff');
  });
  svg.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !dragging && !answered) {
      prev.innerHTML = '';
      cur = null;
    }
  });
  keyHandler = (e) => {
    if (answered) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const base = cur ?? 4;
      show(Math.max(PICK_MIN, Math.min(PICK_MAX, base + (cur === null ? 0 : e.key === 'ArrowUp' ? 1 : -1))));
    } else if (e.key === 'Enter' && cur !== null) submit('keyboard');
  };
}

function onAnswered(item, card, { correct, rt, given, chosenPos, input }) {
  const note = NOTES[card.noteId];
  let rating = null;
  if (!item.retry) {
    const now = new Date();
    rating = applyAnswer(card, correct, rt, now);
    const k = todayKey(now);
    const d = (state.days[k] ||= { answers: 0, correct: 0 });
    d.answers += 1;
    if (correct) d.correct += 1;
    session.results.push({ cardId: card.id, correct, rt, rating });
    store.addLog({
      t: now.toISOString(),
      cardId: card.id,
      noteId: card.noteId,
      type: card.type,
      correct,
      expected: card.type === 'A' ? note.letter : `pos:${note.pos}`,
      given,
      rt: Math.round(rt),
      rating,
      mode: session.short ? 'kurz' : session.extra ? 'zusatz' : 'sitzung',
      input,
    });
    save();
    const remaining = session.minutes - (Date.now() - session.startedAt) / 60000;
    if (remaining > 0.5) {
      if (!correct) requeue(session, { kind: 'card', cardId: card.id }, 3 + Math.floor(Math.random() * 2));
      else if (dueDate(card) - Date.now() < 15 * 60000) requeue(session, { kind: 'card', cardId: card.id }, 4 + Math.floor(Math.random() * 3));
    }
  }
  if (correct) showCorrect(item, card, rt, rating);
  else showWrong(item, card, chosenPos);
}

function showCorrect(item, card, rt, rating) {
  const note = NOTES[card.noteId];
  play(card.noteId);
  const q = app.querySelector('#qcard');
  q.classList.add('okflash');
  if (card.type === 'A') {
    q.innerHTML = noteStaff(card.noteId, { value: item.value, clef: item.clef, minWidth: 120, cls: 'ok', label: nm(card.noteId), labelCls: 'ok' });
  }
  const slow = rating !== null && rt > 1.5 * TARGET_RT[card.type];
  app.querySelector('#fb').innerHTML = `<div class="feedback ok">
    <div class="fb-head"><div class="fb-icon">${ICONS.check}</div><div><div class="fb-title">Richtig, ${nm(card.noteId)}</div>
    <div class="fb-sub">${fmtSec(rt)}${item.retry ? ' · Korrektur' : slow ? ' · richtig, aber noch langsam' : rating !== null ? ` · ${RATING_LABEL[rating]}` : ''} · ${describeFret(note)}</div></div></div>
  </div>`;
  const go = () => advance();
  advanceId = setTimeout(go, slow ? 1600 : 1100);
  keyHandler = (e) => (e.key === 'Enter' || e.key === ' ') && (clearTimeout(advanceId), go());
  app.querySelector('#fb').addEventListener('click', () => (clearTimeout(advanceId), go()));
}

function showWrong(item, card, chosenPos) {
  const note = NOTES[card.noteId];
  playError();
  setTimeout(() => play(card.noteId), 280);
  const q = app.querySelector('#qcard');
  q.classList.add('shake');
  const chosenLetter = letterAt(chosenPos);
  const chosenName = displayLetter(chosenLetter, naming());
  const name = nm(card.noteId);
  const value = card.type === 'A' ? item.value : 'whole';
  q.innerHTML = staffSVG(
    [
      { pos: note.pos, value, cls: 'ok', label: name, labelCls: 'ok' },
      { pos: chosenPos, value, cls: 'ghost', label: chosenName, labelCls: 'err' },
    ],
    { clef: true, gap: 40, minWidth: 120, center: true },
  );
  const diff = explainDiff(note.pos, chosenPos);
  const title = card.type === 'A' ? `Das ist ein ${name}` : `Hier liegt das ${name}`;
  const sameLetter = chosenLetter === note.letter;
  const why = sameLetter
    ? `Richtiger Name, aber deine Note lag ${diff}. Achte auf die Hilfslinien.`
    : card.type === 'A'
      ? `Du hast ${chosenName} gewählt, das läge ${diff}.`
      : `Deine Note war ${diff}, das wäre ein ${chosenName}.`;
  app.querySelector('#fb').innerHTML = `<div class="feedback err">
    <div class="fb-head"><div class="fb-icon">${ICONS.x}</div><div><div class="fb-title">${title}</div><div class="fb-sub">${why}</div></div></div>
    <div class="fb-body"><div class="fb-wrap">${noteFret(card.noteId, 'ok')}</div><div class="small">${name} liegt ${describePos(note.pos)}.<br>${describeFret(note)}.</div></div>
    <div class="fb-actions"><button class="btn btn-soft" data-play>${ICONS.sound} Anhören</button><button class="btn btn-dark" data-retry>Nochmal versuchen ${ICONS.arrow}</button></div>
  </div>`;
  app.querySelectorAll('.key').forEach((k) => (k.disabled = true));
  app.querySelector('#fb').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  app.querySelector('[data-play]').addEventListener('click', () => play(card.noteId));
  const retry = () => {
    // Korrektur-Abruf: dieselbe Aufgabe sofort noch einmal, zählt nicht für den Plan
    session.queue.unshift({ kind: 'card', cardId: card.id, retry: true });
    nextItem();
  };
  app.querySelector('[data-retry]').addEventListener('click', retry);
  setTimeout(() => (keyHandler = (e) => e.key === 'Enter' && retry()), 300);
  keyHandler = null;
}

function finishSession(early = false) {
  stopTimers();
  keyHandler = null;
  if (!session) return (location.hash = '#/heute');
  const res = session.results;
  if (!res.length) {
    session = null;
    location.hash = '#/heute';
    return;
  }
  const correct = res.filter((r) => r.correct).length;
  const rts = res.filter((r) => r.correct).map((r) => r.rt);
  const after = automatedSet(state);
  const better = [...after].filter((id) => !session.automatedBefore.has(id)).map((id) => id.split(':')[0]);
  const betterNames = [...new Set(better)].map((n) => nm(n));
  const dues = Object.values(state.cards).map(dueDate).sort((a, b) => a - b);
  const next = dues.find((d) => d > new Date()) || dues[0];
  const newNotes = session.newNotes.map((n) => nm(n));
  const minutes = Math.max(1, Math.round((Date.now() - session.startedAt) / 60000));
  session = null;
  app.innerHTML = `<div class="session"><main class="s-stage"><div class="summary">
    <div class="big-check">${ICONS.check}</div>
    <div><h2>${early ? 'Gut, für jetzt reicht es.' : 'Sitzung geschafft!'}</h2><p class="muted">${minutes} min geübt</p></div>
    <div class="tiles">
      <div class="tile"><b>${res.length}</b><span>Antworten</span></div>
      <div class="tile"><b>${Math.round((100 * correct) / res.length)} %</b><span>richtig</span></div>
      <div class="tile"><b>${rts.length ? fmtSec(median(rts)) : '–'}</b><span>Median-Zeit</span></div>
      <div class="tile"><b>${newNotes.length}</b><span>neue Noten</span></div>
    </div>
    ${newNotes.length ? `<div><p class="muted small">Neu gelernt</p><div class="chips">${newNotes.map((n) => `<span class="chip" style="background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)">${n}</span>`).join('')}</div></div>` : ''}
    ${betterNames.length ? `<div><p class="muted small">Jetzt flüssig</p><div class="chips">${betterNames.map((n) => `<span class="chip">${n}</span>`).join('')}</div></div>` : ''}
    ${next ? `<p class="muted">Nächste Wiederholung ${fmtWhen(next)}.</p>` : ''}
    <div class="row-actions"><a class="btn btn-primary btn-lg" href="#/heute">Fertig</a></div>
  </div></main></div>`;
  history.replaceState(null, '', '#/fertig');
}

// ---------- Grundlagen (T0) ----------
function basicsSlides() {
  const n = (letter, octave) => NOTES[`${letter}${octave}`]?.pos ?? null;
  const posOf = (letter, oct) => oct * 7 + LETTERS.indexOf(letter) - 30;
  const lab = (l) => displayLetter(l, naming());
  return [
    {
      title: 'Das Notensystem',
      text: 'Noten stehen auf fünf Linien. Gezählt wird von unten nach oben: Die unterste ist die 1. Linie, die oberste die 5.',
      img: staffSVG([], { clef: false, lineNumbers: true, minWidth: 160, vb: [14, 56] }),
    },
    {
      title: 'Linien und Zwischenräume',
      text: 'Eine Note sitzt entweder auf einer Linie (die Linie geht mitten durch den Notenkopf) oder in einem Zwischenraum. Jeder Schritt nach oben ist der nächste Ton.',
      img: staffSVG(
        [0, 1, 2, 3, 4, 5, 6, 7, 8].map((p) => ({ pos: p, value: 'whole', label: p % 2 ? 'Z' : 'L' })),
        { clef: false, gap: 25 },
      ),
      foot: 'L = auf der Linie, Z = im Zwischenraum',
    },
    {
      title: 'Der Violinschlüssel',
      text: 'Gitarrennoten stehen im Violinschlüssel. Er heißt auch G-Schlüssel, weil seine Spirale um die 2. Linie kreist: Dort liegt das G.',
      img: staffSVG([{ pos: 2, value: 'whole', label: lab('G') }], { clef: true, highlightPos: 2, minWidth: 140, center: true }),
    },
    {
      title: 'Die Notennamen',
      text:
        naming() === 'en'
          ? 'Die Stammtöne heißen C D E F G A B. Danach beginnt es wieder mit C, nur höher.'
          : 'Die Stammtöne heißen C D E F G A H. Im Deutschen heißt die Note nach A „H“; „B“ ist ein erniedrigtes H. Danach beginnt es wieder mit C, nur höher.',
      img: staffSVG(
        LETTERS.map((l) => ({ pos: posOf(l, 4), value: 'quarter', label: lab(l) })).concat([{ pos: posOf('C', 5), value: 'quarter', label: 'C' }]),
        { clef: true, gap: 20 },
      ),
    },
    {
      title: 'Form und Höhe',
      text: 'Dasselbe C als ganze Note, Halbe, Viertel und Achtel: Die Form sagt, wie lange der Ton klingt. Welcher Ton es ist, verrät nur die Höhe.',
      img: staffSVG(
        ['whole', 'half', 'quarter', 'eighth'].map((v) => ({ pos: posOf('C', 5), value: v, label: 'C' })),
        { clef: true, gap: 28 },
      ),
    },
    {
      title: 'Hilfslinien',
      text: 'Tiefere oder höhere Töne bekommen kurze Hilfslinien. Die tiefen Saiten deiner Gitarre liegen unter dem System: A auf der 2. Hilfslinie, das tiefe E unter der 3.',
      img: staffSVG(
        [
          { pos: n('D', 4), value: 'whole', label: lab('D') },
          { pos: posOf('C', 4), value: 'whole', label: 'C' },
          { pos: n('A', 3), value: 'whole', label: lab('A') },
          { pos: posOf('F', 3), value: 'whole', label: 'F' },
          { pos: n('E', 3), value: 'whole', label: lab('E') },
        ],
        { clef: true, gap: 26 },
      ),
    },
    {
      title: 'Gitarre klingt tiefer',
      text: 'Gitarrennoten werden eine Oktave höher geschrieben, als sie klingen. So bleiben sie besser lesbar. Du liest einfach das Notenbild, die App spielt dir den echten Gitarrenton vor.',
      img: staffSVG(
        ['E3', 'A3', 'D4', 'G4', 'H4', 'E5'].map((id) => ({ pos: NOTES[id].pos, value: 'whole', label: nm(id) })),
        { clef: true, gap: 24 },
      ),
      notes: ['E3', 'A3', 'D4', 'G4', 'H4', 'E5'],
      foot: 'Die sechs Leersaiten, von tief nach hoch. Tippe auf „Anhören“.',
    },
  ];
}

function renderBasics() {
  const slides = basicsSlides();
  let i = 0;
  let quiz = null;
  const total = slides.length + 1;
  const draw = () => {
    stopTimers();
    if (i < slides.length) {
      const s = slides[i];
      app.innerHTML = shell(
        `<section class="lesson" style="padding-top:16px">
        <div class="dots">${Array.from({ length: total }, (_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
        <div class="eyebrow">Grundlagen · ${i + 1} von ${total}</div>
        <h2>${s.title}</h2>
        <div class="paper">${s.img}</div>
        ${s.foot ? `<p class="muted small">${s.foot}</p>` : ''}
        <p>${s.text}</p>
        <div class="row-actions" style="justify-content:space-between">
          <button class="btn btn-ghost" data-prev ${i === 0 ? 'disabled style="visibility:hidden"' : ''}>${ICONS.back} Zurück</button>
          ${s.notes ? `<button class="btn btn-soft" data-listen>${ICONS.sound} Anhören</button>` : ''}
          <button class="btn btn-primary" data-fwd>Weiter ${ICONS.arrow}</button>
        </div></section>`,
        '',
      );
      app.querySelector('[data-fwd]').addEventListener('click', () => (i++, draw()));
      app.querySelector('[data-prev]')?.addEventListener('click', () => (i--, draw()));
      app.querySelector('[data-listen]')?.addEventListener('click', () => s.notes.forEach((id, k) => setTimeout(() => play(id), k * 420)));
      keyHandler = (e) => {
        if (e.key === 'ArrowRight' || e.key === 'Enter') (i++, draw());
        if (e.key === 'ArrowLeft' && i > 0) (i--, draw());
      };
      return;
    }
    // Kurzes Quiz: Linie oder Zwischenraum?
    if (!quiz) {
      const pool = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      quiz = { qs: pool.sort(() => Math.random() - 0.5).slice(0, 6), k: 0, right: 0 };
    }
    if (quiz.k >= quiz.qs.length) {
      state.t0Done = true;
      save();
      app.innerHTML = shell(
        `<section class="lesson" style="padding-top:16px;text-align:center">
          <div class="big-check">${ICONS.check}</div>
          <h2>Grundlagen geschafft</h2>
          <p class="muted">${quiz.right} von ${quiz.qs.length} richtig. Jetzt geht es an die echten Noten: die sechs Leersaiten deiner Gitarre.</p>
          <div class="row-actions"><button class="btn btn-primary btn-lg" data-act="start">${ICONS.play} Erste Sitzung starten</button><a class="btn btn-soft btn-lg" href="#/heute">Zur Übersicht</a></div>
        </section>`,
        '',
      );
      bindCommon();
      return;
    }
    const pos = quiz.qs[quiz.k];
    app.innerHTML = shell(
      `<section class="lesson" style="padding-top:16px">
        <div class="dots">${Array.from({ length: total }, (_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
        <div class="eyebrow">Kurzer Check · Frage ${quiz.k + 1} von ${quiz.qs.length}</div>
        <h2>Linie oder Zwischenraum?</h2>
        <div class="paper q-card" id="qcard">${staffSVG([{ pos, value: 'whole' }], { clef: true, minWidth: 120, center: true })}</div>
        <div class="choice"><button class="btn btn-soft btn-lg" data-c="line">Linie</button><button class="btn btn-soft btn-lg" data-c="space">Zwischenraum</button></div>
        <div id="fb"></div>
      </section>`,
      '',
    );
    const answer = (c) => {
      const right = (c === 'line') === isLine(pos);
      if (right) quiz.right++;
      app.querySelectorAll('[data-c]').forEach((b) => (b.disabled = true));
      app.querySelector(`[data-c="${c}"]`).className = `btn btn-lg ${right ? 'btn-primary' : 'btn-danger'}`;
      app.querySelector('#fb').innerHTML = `<div class="feedback ${right ? 'ok' : 'err'}"><div class="fb-head"><div class="fb-icon">${right ? ICONS.check : ICONS.x}</div><div><div class="fb-title">${right ? 'Richtig' : 'Nicht ganz'}</div><div class="fb-sub">Die Note liegt ${describePos(pos)}.</div></div></div></div>`;
      advanceId = setTimeout(() => (quiz.k++, draw()), right ? 900 : 2200);
      keyHandler = null;
    };
    app.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => answer(b.dataset.c)));
    keyHandler = (e) => {
      if (e.key.toLowerCase() === 'l') answer('line');
      if (e.key.toLowerCase() === 'z') answer('space');
    };
  };
  draw();
}

// ---------- Einstellungen ----------
function seg(name, options, current) {
  return `<div class="seg" data-seg="${name}">${options.map(([v, l]) => `<button data-v="${v}" class="${String(v) === String(current) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}

function renderSettings() {
  const s = state.settings;
  const nCards = Object.keys(state.cards).length;
  const content = `
    <section class="page-head"><div class="eyebrow">Einstellungen</div><h1>So übst du</h1></section>
    <div class="settings">
      <div class="card">
        <div class="set-row"><div><h3>Sitzungsdauer</h3><p>Wie lange eine normale Sitzung dauern soll.</p></div>${seg('minutes', [[5, '5'], [10, '10'], [12, '12'], [15, '15 min']], s.minutes)}</div>
        <div class="set-row"><div><h3>Neue Noten pro Tag</h3><p>2–4 neue Noten pro Tag sind ein gutes Maß.</p></div>${seg('newPerDay', [[2, '2'], [3, '3'], [4, '4']], s.newPerDay)}</div>
        <div class="set-row"><div><h3>Notennamen</h3><p>Deutsch mit H, oder englisch mit B.</p></div>${seg('naming', [['de', 'H (deutsch)'], ['en', 'B (englisch)']], s.naming)}</div>
        <div class="set-row"><div><h3>Ton</h3><p>Gitarrenklang bei Lernkarten und Feedback.</p></div>${seg('sound', [['true', 'An'], ['false', 'Aus']], s.sound)}</div>
      </div>
      <div class="card">
        <div class="set-row"><div><h3>Backup</h3><p>${nCards} Karten gespeichert${state.lastExport ? `, letztes Backup ${new Date(state.lastExport).toLocaleDateString('de-DE')}` : ', noch kein Backup'}. Alles bleibt nur in diesem Browser.</p></div>
          <div class="row-actions"><button class="btn btn-soft" data-export>${ICONS.download} Exportieren</button><button class="btn btn-soft" data-import>${ICONS.upload} Importieren</button></div></div>
        <div class="set-row"><div><h3>Neu anfangen</h3><p>Löscht alle Karten und das Antwortprotokoll.</p></div><button class="btn btn-danger" data-reset>Zurücksetzen</button></div>
      </div>
      <p class="muted small">Die Bewertung jeder Antwort entsteht automatisch aus Richtigkeit und Antwortzeit. Den Wiederholungsplan berechnet FSRS. Notenglyphen: Bravura (SIL Open Font License).</p>
      <input type="file" accept="application/json,.json" id="importFile" hidden>
    </div>`;
  app.innerHTML = shell(content, '#/einstellungen');
  app.querySelectorAll('[data-seg]').forEach((g) =>
    g.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        const key = g.dataset.seg;
        let v = b.dataset.v;
        if (key === 'minutes' || key === 'newPerDay') v = Number(v);
        if (key === 'sound') v = v === 'true';
        state.settings[key] = v;
        sound.enabled = state.settings.sound;
        save();
        renderSettings();
      }),
    ),
  );
  app.querySelector('[data-export]').addEventListener('click', exportData);
  const file = app.querySelector('#importFile');
  app.querySelector('[data-import]').addEventListener('click', () => file.click());
  file.addEventListener('change', () => file.files[0] && importData(file.files[0]));
  app.querySelector('[data-reset]').addEventListener('click', () =>
    confirmModal('Wirklich neu anfangen?', 'Alle Karten, dein Fortschritt und das Antwortprotokoll werden gelöscht. Exportiere vorher ein Backup, wenn du es behalten willst.', 'Alles löschen', async () => {
      await store.clearAll();
      state = defaultState();
      await store.saveState(state);
      toast('Alles zurückgesetzt');
      location.hash = '#/heute';
    }),
  );
}

function confirmModal(title, text, okLabel, onOk) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h2 style="font-size:1.4rem">${esc(title)}</h2><p class="muted">${esc(text)}</p>
    <div class="row-actions" style="justify-content:flex-end"><button class="btn btn-ghost" data-no>Abbrechen</button><button class="btn btn-danger" data-yes>${esc(okLabel)}</button></div></div>`;
  document.body.appendChild(back);
  back.querySelector('[data-no]').addEventListener('click', () => back.remove());
  back.addEventListener('click', (e) => e.target === back && back.remove());
  back.querySelector('[data-yes]').addEventListener('click', () => {
    back.remove();
    onOk();
  });
}

async function exportData() {
  const logs = await store.allLogs();
  state.lastExport = new Date().toISOString();
  await store.saveState(state);
  const data = { app: 'notenlernapp', version: 1, exportedAt: state.lastExport, state, log: logs };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `notenlernapp-backup-${todayKey()}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
  toast('Backup gespeichert');
  route();
}

async function importData(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'notenlernapp' || !data.state) throw new Error('kein Backup');
    const n = Object.keys(data.state.cards || {}).length;
    confirmModal(
      'Backup laden?',
      `Backup vom ${new Date(data.exportedAt).toLocaleDateString('de-DE')} mit ${n} Karten und ${data.log?.length || 0} Antworten. Dein aktueller Stand wird ersetzt.`,
      'Laden',
      async () => {
        state = migrate(data.state);
        await store.replaceAll(state, data.log || []);
        sound.enabled = state.settings.sound;
        toast('Backup geladen');
        location.hash = '#/heute';
        route();
      },
    );
  } catch {
    toast('Die Datei ist kein gültiges Backup.');
  }
}

// ---------- Start ----------
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (document.querySelector('.modal-back')) return;
  if (keyHandler) keyHandler(e);
});
window.addEventListener('hashchange', route);

(async function start() {
  await store.init();
  const saved = await store.loadState();
  state = saved ? migrate(saved) : defaultState();
  if (!saved) await store.saveState(state);
  sound.enabled = state.settings.sound;
  route();
})();
