/* Michi — local-first sentence study. No network requests or dependencies. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const DECK_ID = 'michi-n5-1000-v1';
  const KEY = 'michi-sentences-v1';
  const DEFAULTS = { answerMode: 'quick', display: 'japanese', newPerDay: 5, desiredRetention: 0.9, includeNew: true };
  const SCHEDULER = { learningSteps: [60000, 600000], relearningSteps: [600000], maxIntervalDays: 36500 };
  if (!Array.isArray(window.SENTENCE_DECK) || !window.SentenceSRS || !window.SentenceGrading) {
    $('study-content').innerHTML = '<div class="notice warning">Some app files are missing. Keep index.html, app.js, styles.css, deck.js, srs.js, and grading.js in the same folder, then reopen index.html.</div>';
    return;
  }
  const deck = window.SENTENCE_DECK;
  const byId = new Map(deck.map(card => [card.id, card]));
  const units = window.SENTENCE_UNITS || {};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = object => JSON.parse(JSON.stringify(object));
  const dateKey = (now = Date.now()) => { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const freshState = () => ({ version: 1, deckId: DECK_ID, settings: { ...DEFAULTS }, progress: {}, daily: { date: dateKey(), newCount: 0 }, history: [], undo: null });
  let preserveCorruptData = false;
  let storageNotice = '';
  let state = freshState();

  function validateState(input) {
    if (!input || input.version !== 1 || input.deckId !== DECK_ID) throw new Error('This is not a compatible Michi progress backup.');
    const s = input.settings;
    if (!s || !['quick', 'typed'].includes(s.answerMode) || !['japanese', 'kana'].includes(s.display) || !Number.isInteger(s.newPerDay) || s.newPerDay < 0 || s.newPerDay > 50 || ![0.85, 0.9, 0.95].includes(s.desiredRetention) || typeof s.includeNew !== 'boolean') throw new Error('The preferences in this backup are invalid.');
    if (!input.progress || typeof input.progress !== 'object' || Array.isArray(input.progress) || Object.keys(input.progress).length > 1000) throw new Error('The progress in this backup is invalid.');
    const progress = {};
    for (const [id, record] of Object.entries(input.progress)) {
      const c = record?.card;
      if (!byId.has(Number(id)) || !/^[1-9][0-9]*$/.test(id) || !c || !['new', 'learning', 'review', 'relearning'].includes(c.state) || typeof record.suspended !== 'boolean') throw new Error('A sentence record in the backup is invalid.');
      const finite = x => typeof x === 'number' && Number.isFinite(x);
      if (!finite(c.due) || c.due < 0 || c.due > 8640000000000000 || !finite(c.stability) || c.stability < 0 || c.stability > 1e9 || !finite(c.difficulty) || c.difficulty < 0 || c.difficulty > 10 || !Number.isInteger(c.reps) || c.reps < 0 || !Number.isInteger(c.lapses) || c.lapses < 0 || c.lapses > c.reps || !Number.isInteger(c.step) || c.step < 0 || c.step > 2 || (c.lastReview !== null && (!finite(c.lastReview) || c.lastReview < 0 || c.lastReview > 8640000000000000))) throw new Error('The scheduling data in the backup is invalid.');
      if (c.state !== 'new' && (c.stability < 0.001 || c.difficulty < 1 || c.lastReview === null || c.reps < 1)) throw new Error('The memory data in the backup is invalid.');
      progress[id] = { card: { state: c.state, due: c.due, stability: c.stability, difficulty: c.difficulty, lastReview: c.lastReview, reps: c.reps, lapses: c.lapses, step: c.step }, suspended: record.suspended };
    }
    if (!input.daily || !/^\d{4}-\d{2}-\d{2}$/.test(input.daily.date) || !Number.isInteger(input.daily.newCount) || input.daily.newCount < 0 || input.daily.newCount > 1000) throw new Error('The daily counter in the backup is invalid.');
    if (!Array.isArray(input.history) || input.history.length > 5000) throw new Error('The review log in the backup is invalid.');
    const history = input.history.map(h => {
      if (!h || !byId.has(h.id) || !Number.isFinite(h.at) || h.at < 0 || !['again', 'hard', 'good', 'easy'].includes(h.rating)) throw new Error('A review log entry is invalid.');
      return { id: h.id, at: h.at, rating: h.rating, mode: h.mode === 'typed' ? 'typed' : 'quick', kanaHint: !!h.kanaHint, romajiHint: !!h.romajiHint };
    });
    // Undo is deliberately discarded on import: an imported snapshot is the baseline.
    return { version: 1, deckId: DECK_ID, settings: { ...s }, progress, daily: { ...input.daily }, history, undo: null };
  }

  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      state = validateState(parsed);
      // Do not restore unvalidated undo snapshots; undo remains available within the session.
    }
  } catch (error) {
    preserveCorruptData = true;
    storageNotice = 'Saved progress could not be read. This session will stay in memory so existing data is preserved. Export a backup of new progress before leaving, or import a valid backup.';
  }
  function ensureDay() { if (state.daily.date !== dateKey()) state.daily = { date: dateKey(), newCount: 0 }; }
  function save() {
    if (preserveCorruptData) return false;
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch { storageNotice = 'This browser cannot save progress here. Export a backup before closing. A normal browser tab often works better than a private tab or file preview.'; showStorageNotice(); return false; }
  }
  function showStorageNotice() { $('storage-warning').textContent = storageNotice; $('storage-warning').hidden = !storageNotice; }
  showStorageNotice();
  let current = null;
  let revealed = false;
  let kanaHint = false;
  let romajiHint = false;
  let answerText = '';
  let practice = false;
  let paused = false;
  let sessionRatings = 0;
  let skipped = new Set();
  let page = 0;
  let pendingImport = null;
  let toastTimer;
  const schedulerSettings = () => ({ ...SCHEDULER, desiredRetention: state.settings.desiredRetention });
  const recordFor = id => state.progress[id] || { card: SentenceSRS.createCard(Date.now()), suspended: false };
  const unitName = item => units[item.unit] || item.grammar;
  const dueItems = (now = Date.now()) => deck.filter(item => { const r = state.progress[item.id]; return r && !r.suspended && r.card.state !== 'new' && r.card.due <= now; }).sort((a, b) => {
    const ca = state.progress[a.id].card, cb = state.progress[b.id].card;
    const la = ca.state === 'learning' || ca.state === 'relearning', lb = cb.state === 'learning' || cb.state === 'relearning';
    return Number(lb) - Number(la) || ca.due - cb.due || a.id - b.id;
  });
  function nextItem() {
    ensureDay();
    const due = dueItems().find(item => !skipped.has(item.id));
    if (due) return due;
    if (!state.settings.includeNew || state.daily.newCount >= state.settings.newPerDay) return null;
    return deck.find(item => { const r = state.progress[item.id]; return !skipped.has(item.id) && (!r || (r.card.state === 'new' && !r.suspended)); }) || null;
  }
  function resetCard(item = null) { current = item; revealed = false; kanaHint = false; romajiHint = false; answerText = ''; }
  function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4500); }
  function updateCounts() {
    $('due-count').textContent = dueItems().length;
    $('include-new').checked = state.settings.includeNew;
    $('session-status').textContent = sessionRatings ? `${sessionRatings} ${sessionRatings === 1 ? 'review' : 'reviews'} this visit. Stop whenever you like.` : 'No daily goal. Leave whenever you like.';
  }
  function nextDueMessage() {
    const pending = Object.values(state.progress).filter(r => !r.suspended && r.card.state !== 'new' && r.card.due > Date.now()).sort((a, b) => a.card.due - b.card.due)[0];
    if (!pending) return 'Your sentences will be here whenever you return.';
    const at = new Date(pending.card.due);
    return `Next scheduled review: ${at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}. Come back when it suits you.`;
  }
  function emptyStudy() {
    const message = paused ? 'Saved your place.' : 'A good place to pause.';
    const detail = paused ? 'There is no session to finish. Return for one sentence or a few.' : nextDueMessage();
    $('study-content').innerHTML = `<div class="empty-card"><p class="eyebrow">AT YOUR OWN PACE</p><h2>${message}</h2><p>${esc(detail)}</p><div class="button-row">${paused ? '<button id="resume-study" class="primary">Resume study</button>' : skipped.size ? '<button id="reset-skips" class="secondary">Revisit skipped sentences</button>' : ''}<button id="random-practice" class="${paused ? 'secondary' : 'primary'}">Practice any sentence</button></div><p class="muted" style="margin:18px 0 0">Free practice does not change your review schedule.</p></div>`;
    $('resume-study')?.addEventListener('click', () => { paused = false; resetCard(); renderStudy(); });
    $('reset-skips')?.addEventListener('click', () => { skipped.clear(); resetCard(); renderStudy(); });
    $('random-practice').addEventListener('click', () => startPractice(deck[Math.floor(Math.random() * deck.length)]));
  }
  function renderStudy() {
    ensureDay(); updateCounts();
    $('pause-button').hidden = paused;
    if (paused && !practice) { emptyStudy(); return; }
    if (!current) current = nextItem();
    if (!current) { emptyStudy(); return; }
    const item = current;
    const record = recordFor(item.id);
    const stateLabel = practice ? 'Free practice · no schedule' : record.card.state === 'new' ? 'New sentence' : record.card.state === 'review' ? 'Review' : 'Learning';
    const sentence = state.settings.display === 'kana' ? item.kana : item.jp;
    const typed = state.settings.answerMode === 'typed';
    let answer = '';
    if (revealed) {
      const match = SentenceGrading.compare(answerText, item);
      const feedback = answerText.trim() ? (match.match ? 'Matches a reference phrase. Rate how well you recalled it.' : 'Different wording — compare the meaning yourself. A valid paraphrase is fine.') : 'Compare this with the meaning you recalled, then choose a rating.';
      answer = `<div class="translation-block" tabindex="-1" role="region" aria-label="English meaning"><p class="eyebrow">ENGLISH MEANING</p>${answerText.trim() ? `<p class="your-answer"><strong>You wrote:</strong> ${esc(answerText)}</p>` : ''}<p class="translation" lang="en">${esc(item.en)}</p><p class="answer-feedback">${feedback}</p>${item.alternatives?.length ? `<p class="meaning-note"><strong>Also:</strong> ${esc(item.alternatives.join(' / '))}</p>` : ''}<p class="meaning-note"><strong>${esc(item.grammar)}</strong>${item.note ? ` · ${esc(item.note)}` : ''}</p></div>`;
      if (practice) answer += '<div class="rating-area"><p class="rating-caption">Practice only. Your schedule stays as it was.</p><div class="button-row"><button id="practice-next" class="primary">Next sentence</button><button id="practice-back" class="secondary">Back to reviews</button></div></div>';
      else {
        const preview = SentenceSRS.preview(record.card, Date.now(), schedulerSettings());
        answer += `<div class="rating-area"><p class="rating-caption">How well did you recall the meaning?</p><div class="rating-buttons">${['again', 'hard', 'good', 'easy'].map(rating => `<button class="rating-button" data-rating="${rating}" title="${({ again: 'Missed the meaning', hard: 'Correct, with effort', good: 'Correct, comfortably', easy: 'Correct, immediately' })[rating]}"><span>${rating[0].toUpperCase() + rating.slice(1)}</span><small>${esc(preview[rating].label)}</small></button>`).join('')}</div></div>`;
      }
    }
    $('study-content').innerHTML = `<article class="study-card" aria-label="Sentence ${item.id}"><div class="card-top"><span class="card-unit">${esc(stateLabel)} · ${esc(unitName(item))}</span><span class="card-index">${String(item.id).padStart(4, '0')} / 1000</span></div><div class="card-body"><p class="japanese" lang="ja">${esc(sentence)}</p><div class="hint-controls"><button id="kana-hint" class="hint-button" aria-pressed="${kanaHint}" aria-controls="kana-reading">${kanaHint ? 'Hide' : 'Show'} kana</button><button id="romaji-hint" class="hint-button" aria-pressed="${romajiHint}" aria-controls="romaji-reading">${romajiHint ? 'Hide' : 'Show'} romaji</button><button id="audio-button" class="hint-button" aria-label="Listen to the Japanese sentence">Listen</button></div><div id="kana-reading" class="hint-line" ${kanaHint ? '' : 'hidden'}><small>Kana reading</small><span lang="ja">${esc(item.kana)}</span></div><div id="romaji-reading" class="hint-line" ${romajiHint ? '' : 'hidden'}><small>Romaji</small>${esc(item.romaji)}</div>${revealed ? '' : `<div class="answer-area"><div class="answer-style" role="group" aria-label="Answer style"><button data-mode="quick" class="${typed ? '' : 'active'}" aria-pressed="${!typed}">Quick review</button><button data-mode="typed" class="${typed ? 'active' : ''}" aria-pressed="${typed}">Write meaning</button></div>${typed ? `<label class="field"><span>Your English meaning</span><textarea id="typed-answer" placeholder="Use your own words…" autocapitalize="sentences" spellcheck="true" lang="en">${esc(answerText)}</textarea></label>` : '<p class="recall-prompt">Read it and recall the meaning in your own words.</p>'}<button id="reveal-answer" class="primary reveal-button">${typed && answerText.trim() ? 'Check meaning' : 'Reveal meaning'}</button></div>`}</div>${answer}</article><div class="card-actions"><button id="skip-sentence" class="quiet-button">${practice ? 'Another practice sentence' : 'Skip for this visit'}</button><button id="card-undo" class="quiet-button" ${state.undo ? '' : 'disabled'}>Undo last rating</button></div>`;
    $('kana-hint').addEventListener('click', () => { kanaHint = !kanaHint; toggleHint('kana'); });
    $('romaji-hint').addEventListener('click', () => { romajiHint = !romajiHint; toggleHint('romaji'); });
    $('audio-button').addEventListener('click', () => speak(item));
    $('typed-answer')?.addEventListener('input', event => { answerText = event.target.value; $('reveal-answer').textContent = answerText.trim() ? 'Check meaning' : 'Reveal meaning'; });
    document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => { state.settings.answerMode = button.dataset.mode; save(); renderStudy(); }));
    $('reveal-answer')?.addEventListener('click', () => { revealed = true; renderStudy(); document.querySelector('.translation-block')?.focus({ preventScroll: true }); });
    document.querySelectorAll('[data-rating]').forEach(button => button.addEventListener('click', () => rateCurrent(button.dataset.rating)));
    $('skip-sentence').addEventListener('click', () => { if (practice) startPractice(deck[Math.floor(Math.random() * deck.length)]); else { skipped.add(item.id); resetCard(); renderStudy(); } });
    $('card-undo').addEventListener('click', undo);
    $('practice-next')?.addEventListener('click', () => startPractice(deck[item.id % deck.length]));
    $('practice-back')?.addEventListener('click', () => { practice = false; paused = false; resetCard(); renderStudy(); });
  }
  function toggleHint(which) {
    const on = which === 'kana' ? kanaHint : romajiHint;
    $(`${which}-reading`).hidden = !on;
    $(`${which}-hint`).setAttribute('aria-pressed', String(on));
    $(`${which}-hint`).textContent = `${on ? 'Hide' : 'Show'} ${which}`;
  }
  function rateCurrent(rating) {
    if (!current || !revealed || practice) return;
    ensureDay();
    const id = current.id;
    const before = state.progress[id] ? clone(state.progress[id]) : null;
    const original = recordFor(id);
    state.undo = { id, before, dailyBefore: clone(state.daily), historyBefore: clone(state.history), sessionRatingsBefore: sessionRatings };
    state.progress[id] = { card: SentenceSRS.rate(original.card, rating, Date.now(), schedulerSettings()), suspended: false };
    if (original.card.state === 'new') state.daily.newCount++;
    state.history.push({ id, at: Date.now(), rating, mode: state.settings.answerMode, kanaHint, romajiHint });
    if (state.history.length > 5000) state.history.splice(0, state.history.length - 5000);
    sessionRatings++;
    save(); resetCard(); renderStudy(); focusSentence();
  }
  function undo() {
    if (!state.undo) { toast('No rating to undo in this visit.'); return; }
    const u = state.undo;
    if (u.before) state.progress[u.id] = u.before; else delete state.progress[u.id];
    state.daily = u.dailyBefore; state.history = u.historyBefore; sessionRatings = u.sessionRatingsBefore;
    state.undo = null; practice = false; paused = false; skipped.delete(u.id); resetCard(byId.get(u.id));
    save(); renderStudy(); toast('Last rating undone.');
    if (location.hash === '#settings') renderSettings();
  }
  function focusSentence() {
    const sentence = document.querySelector('.japanese');
    if (sentence) { sentence.setAttribute('tabindex', '-1'); sentence.focus({ preventScroll: true }); }
    $('study-content').scrollIntoView({ block: 'start' });
  }
  function startPractice(item) { practice = true; paused = false; resetCard(item); if (location.hash !== '#study') location.hash = '#study'; else { renderStudy(); focusSentence(); } }
  function speak(item) {
    if (!('speechSynthesis' in window)) { toast('Speech is unavailable in this browser.'); return; }
    const voice = speechSynthesis.getVoices().find(v => /^ja(-|_)/i.test(v.lang));
    if (!voice) { toast('No Japanese voice is installed. Reading and reviews still work offline.'); return; }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(item.jp);
    utterance.lang = 'ja-JP'; utterance.voice = voice; utterance.rate = 0.85;
    utterance.onerror = () => toast('The Japanese voice could not play. Some voices need a connection.');
    speechSynthesis.speak(utterance);
  }
  function renderDeck() {
    const query = $('deck-search').value.trim().toLocaleLowerCase();
    const unit = Number($('unit-filter').value) || null;
    const filtered = deck.filter(item => (!unit || item.unit === unit) && (!query || [item.jp, item.kana, item.romaji, item.en].some(text => text.toLocaleLowerCase().includes(query))));
    const totalPages = Math.max(1, Math.ceil(filtered.length / 20));
    page = Math.min(page, totalPages - 1);
    $('deck-count').textContent = `${filtered.length} ${filtered.length === 1 ? 'sentence' : 'sentences'}`;
    $('deck-list').innerHTML = filtered.slice(page * 20, (page + 1) * 20).map(item => `<article class="deck-item"><span class="deck-number">${String(item.id).padStart(4, '0')}</span><div class="deck-item-main"><p class="deck-jp" lang="ja">${esc(item.jp)}</p><p class="deck-en">${esc(item.en)}</p><details><summary>Readings & grammar</summary><span lang="ja">${esc(item.kana)}</span><br>${esc(item.romaji)}<br>${esc(item.grammar)}${item.note ? ` · ${esc(item.note)}` : ''}</details></div><button data-practice="${item.id}">Practice</button></article>`).join('') || '<div class="empty-card"><h2>No matching sentences.</h2><p>Try a shorter word or choose another unit.</p></div>';
    $('page-label').textContent = `Page ${page + 1} of ${totalPages}`;
    $('previous-page').disabled = page === 0; $('next-page').disabled = page >= totalPages - 1;
    document.querySelectorAll('[data-practice]').forEach(button => button.addEventListener('click', () => startPractice(byId.get(Number(button.dataset.practice)))));
  }
  function renderSettings() {
    ensureDay();
    for (const name of ['answerMode', 'display', 'newPerDay', 'desiredRetention']) $('settings-form').elements[name].value = state.settings[name];
    const learned = Object.values(state.progress).filter(r => r.card.state !== 'new').length;
    $('progress-summary').textContent = `${learned} of 1,000 sentences introduced · ${state.history.length} ratings in your saved log.`;
    $('undo-button').disabled = !state.undo;
  }
  function navigate() {
    const view = ['study', 'deck', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'study';
    for (const name of ['study', 'deck', 'settings']) $(`${name}-view`).hidden = name !== view;
    document.querySelectorAll('[data-view]').forEach(a => { if (a.dataset.view === view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (view === 'study') renderStudy(); else if (view === 'deck') renderDeck(); else renderSettings();
  }
  function download(name, contents, type = 'application/json') {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  $('include-new').addEventListener('change', event => { state.settings.includeNew = event.target.checked; save(); practice = false; paused = false; resetCard(); renderStudy(); });
  $('pause-button').addEventListener('click', () => { paused = true; practice = false; resetCard(); save(); renderStudy(); });
  $('deck-search').addEventListener('input', () => { page = 0; renderDeck(); });
  $('unit-filter').addEventListener('change', () => { page = 0; renderDeck(); });
  $('previous-page').addEventListener('click', () => { page--; renderDeck(); $('deck-search').scrollIntoView({ block: 'start' }); });
  $('next-page').addEventListener('click', () => { page++; renderDeck(); $('deck-search').scrollIntoView({ block: 'start' }); });
  for (const [number, title] of Object.entries(units)) { const option = document.createElement('option'); option.value = number; option.textContent = `${number}. ${title}`; $('unit-filter').append(option); }
  $('settings-form').addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.target);
    state.settings = { ...state.settings, answerMode: data.get('answerMode'), display: data.get('display'), newPerDay: Math.min(50, Math.max(0, Math.round(Number(data.get('newPerDay'))))), desiredRetention: Number(data.get('desiredRetention')) };
    save(); resetCard(); $('settings-status').textContent = storageNotice ? 'Applied for this visit. Export to keep progress.' : 'Preferences saved.';
  });
  $('export-progress').addEventListener('click', () => { ensureDay(); const backup = { ...state, undo: null, exportedAt: new Date().toISOString() }; download(`michi-progress-${dateKey()}.json`, JSON.stringify(backup, null, 2)); $('backup-status').textContent = 'Backup exported. Keep it somewhere safe.'; });
  $('import-progress').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('This file is too large to be a Michi backup.');
      pendingImport = validateState(JSON.parse(await file.text()));
      $('import-dialog').showModal();
    } catch (error) { pendingImport = null; $('backup-status').textContent = `Import skipped: ${error.message}`; }
    event.target.value = '';
  });
  $('cancel-import').addEventListener('click', () => { pendingImport = null; $('import-dialog').close(); });
  $('import-dialog').addEventListener('cancel', () => { pendingImport = null; });
  $('confirm-import').addEventListener('click', () => {
    if (!pendingImport) return;
    state = pendingImport; pendingImport = null; preserveCorruptData = false; storageNotice = ''; showStorageNotice();
    ensureDay(); save(); practice = false; paused = false; skipped.clear(); resetCard(); sessionRatings = 0;
    $('import-dialog').close(); renderSettings(); updateCounts(); $('backup-status').textContent = 'Backup imported.';
  });
  $('undo-button').addEventListener('click', undo);
  $('export-deck').addEventListener('click', () => download('michi-n5-1000.json', JSON.stringify({ deckId: DECK_ID, units, sentences: deck }, null, 2)));
  $('export-anki').addEventListener('click', () => {
    const cell = x => String(x ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
    const header = '#separator:Tab\n#html:false\n#columns:Japanese\tKana\tRomaji\tEnglish\tAlternatives\tGrammar\tNote\tTags\n#tags column:8\n';
    const rows = deck.map(item => [item.jp, item.kana, item.romaji, item.en, item.alternatives.join(' / '), item.grammar, item.note, `michi unit_${String(item.unit).padStart(2, '0')} sentence_${item.id}`].map(cell).join('\t')).join('\n');
    download('michi-n5-1000-anki.tsv', header + rows + '\n', 'text/tab-separated-values;charset=utf-8');
  });
  window.addEventListener('hashchange', navigate);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { ensureDay(); updateCounts(); if (!current && location.hash !== '#deck' && location.hash !== '#settings') renderStudy(); }
    else if ('speechSynthesis' in window) speechSynthesis.cancel();
  });
  // Enforce one active writer: reload shared progress before switching back to this tab.
  window.addEventListener('storage', event => {
    if (event.key !== KEY || !event.newValue) return;
    try { state = validateState(JSON.parse(event.newValue)); resetCard(); navigate(); toast('Progress updated from another tab.'); } catch { toast('Another tab saved incompatible data. Export a backup before continuing.'); }
  });
  document.addEventListener('keydown', event => {
    if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName) || location.hash === '#settings' || location.hash === '#deck' || event.ctrlKey || event.metaKey || event.altKey) return;
    if ((event.key === ' ' || event.key === 'Enter') && !revealed && current && !paused) { event.preventDefault(); revealed = true; renderStudy(); document.querySelector('.translation-block')?.focus({ preventScroll: true }); }
    else if (revealed && !practice && ['1', '2', '3', '4'].includes(event.key)) rateCurrent(['again', 'hard', 'good', 'easy'][Number(event.key) - 1]);
  });
  if ('speechSynthesis' in window) speechSynthesis.getVoices();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(() => {
      $('offline-status').textContent = 'Offline files are ready on this device. Add Michi to your home screen from your browser menu for easy access.';
    }).catch(() => { $('offline-status').textContent = 'Offline installation was unavailable. Keep the local files, or stay connected when reopening the hosted app.'; });
  }
  // A stopped learning step can become due while the app is open. Refresh only an empty surface.
  setInterval(() => { if (!document.hidden && !current && !paused && !practice && ['#study', ''].includes(location.hash)) renderStudy(); }, 15000);
  navigate();
})();
