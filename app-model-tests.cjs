'use strict';

// Runs the shipped application script with a small DOM/storage model. This tests
// application behavior, not real browser layout, accessibility, or file:// policy.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const KEY = 'michi-sentences-v1';
const decode = text => text.replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[name]);
const voidTags = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));

class Element {
  constructor(tag, document, attributes = {}) {
    this.tagName = tag.toUpperCase(); this.document = document; this.attributes = attributes;
    this.childNodes = []; this.parentNode = null; this.listeners = {}; this._html = '';
    this.value = attributes.value || ''; this.checked = 'checked' in attributes;
    this.hidden = 'hidden' in attributes; this.disabled = 'disabled' in attributes;
    this.files = []; this.open = false;
    this.dataset = Object.fromEntries(Object.entries(attributes).filter(([name]) => name.startsWith('data-')).map(([name, value]) => [name.slice(5), value]));
  }
  get id() { return this.attributes.id; }
  get children() { return this.childNodes.filter(node => node instanceof Element); }
  get textContent() { return this.childNodes.map(node => typeof node === 'string' ? node : node.textContent).join(''); }
  set textContent(value) { this.childNodes = [String(value)]; }
  get innerHTML() { return this._html; }
  set innerHTML(value) { this._html = String(value); this.childNodes = []; parseInto(this, this._html); }
  get elements() { return Object.fromEntries(walk(this).filter(node => node.attributes.name).map(node => [node.attributes.name, node])); }
  append(node) { node.parentNode = this; this.childNodes.push(node); }
  remove() { if (this.parentNode) this.parentNode.childNodes = this.parentNode.childNodes.filter(node => node !== this); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  async dispatch(type, extra = {}) { for (const listener of this.listeners[type] || []) await listener({ target: this, preventDefault() {}, ...extra }); }
  async click() {
    if (this.disabled) return;
    if (this.tagName === 'A' && this.download) { this.document.downloads.push({ name: this.download, blob: this.document.blobs.get(this.href) }); return; }
    await this.dispatch('click');
  }
  focus() { this.document.activeElement = this; }
  blur() { this.document.activeElement = this.document.body; }
  scrollIntoView() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
}

function walk(root) { return root.children.flatMap(child => [child, ...walk(child)]); }
function parseInto(root, html) {
  const stack = [root];
  const tokens = html.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g) || [];
  for (const token of tokens) {
    if (token.startsWith('<!--') || token.startsWith('<!')) continue;
    if (token.startsWith('</')) {
      const tag = token.slice(2).replace(/[\s>].*/, '').toUpperCase();
      while (stack.length > 1) { if (stack.pop().tagName === tag) break; }
    } else if (token.startsWith('<')) {
      const match = token.match(/^<([\w-]+)([\s\S]*?)\/?\s*>$/);
      if (!match) continue;
      const attributes = {};
      const pattern = /([^\s=\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      for (const entry of match[2].matchAll(pattern)) attributes[entry[1]] = decode(entry[2] ?? entry[3] ?? entry[4] ?? '');
      const element = new Element(match[1], root.document, attributes);
      stack[stack.length - 1].append(element);
      if (!voidTags.has(match[1].toLowerCase()) && !token.endsWith('/>')) stack.push(element);
    } else stack[stack.length - 1].childNodes.push(decode(token));
  }
  for (const element of walk(root)) {
    if (element.tagName === 'TEXTAREA') element.value = element.textContent;
    if (element.tagName === 'SELECT' && !element.value) element.value = element.children.find(child => child.tagName === 'OPTION')?.value || '';
  }
}

function matches(element, selector) {
  if (selector.startsWith('.')) return (element.attributes.class || '').split(/\s+/).includes(selector.slice(1));
  if (selector.startsWith('#')) return element.id === selector.slice(1);
  const attribute = selector.match(/^\[([^=\]]+)(?:=["']?([^\]"']+)["']?)?\]$/);
  if (attribute) return attribute[1] in element.attributes && (attribute[2] === undefined || element.attributes[attribute[1]] === attribute[2]);
  return element.tagName === selector.toUpperCase();
}

function harness(storage = new Map(), options = {}) {
  let clock = Date.UTC(2026, 9, 4, 12);
  const intervals = [], documentListeners = {}, windowListeners = {};
  const document = { downloads: [], blobs: new Map(), hidden: false, visibilityState: 'visible' };
  const root = new Element('document', document);
  root.innerHTML = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  document.body = walk(root).find(element => element.tagName === 'BODY');
  document.activeElement = document.body;
  document.getElementById = id => walk(root).find(element => element.id === id) || null;
  document.querySelectorAll = selector => walk(root).filter(element => matches(element, selector));
  document.querySelector = selector => document.querySelectorAll(selector)[0] || null;
  document.createElement = tag => new Element(tag, document);
  document.addEventListener = (type, listener) => { (documentListeners[type] ||= []).push(listener); };
  const location = { protocol: 'file:', hostname: '', _hash: '#study' };
  Object.defineProperty(location, 'hash', { get() { return this._hash; }, set(value) { this._hash = value; for (const listener of windowListeners.hashchange || []) listener(); } });
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } }
  class FormDataModel { constructor(form) { this.values = Object.fromEntries(Object.entries(form.elements).map(([name, element]) => [name, element.value])); } get(name) { return this.values[name] ?? null; } }
  const context = {
    console, Blob, Date: ClockDate, FormData: FormDataModel, document, location, navigator: {},
    setTimeout() { return 1; }, clearTimeout() {}, setInterval(callback) { intervals.push(callback); },
    Math: Object.assign(Object.create(Math), { random: () => 0 }),
    URL: { createObjectURL(blob) { const key = `blob:${document.blobs.size}`; document.blobs.set(key, blob); return key; }, revokeObjectURL() {} },
    localStorage: { getItem(key) { if (options.readFailure) throw new Error('Storage unavailable'); return storage.get(key) ?? null; }, setItem(key, value) { if (options.writeFailure) throw new Error('Storage unavailable'); storage.set(key, String(value)); } },
    addEventListener(type, listener) { (windowListeners[type] ||= []).push(listener); }
  };
  context.window = context;
  vm.createContext(context);
  for (const name of ['deck.js', 'srs.js', 'grading.js', 'app.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, name), 'utf8'), context, { filename: name });
  const el = id => { const result = document.getElementById(id); assert.ok(result, `Expected #${id} in the rendered app`); return result; };
  return {
    document, context, storage, el,
    state() { return JSON.parse(storage.get(KEY) || 'null'); },
    html() { return el('study-content').innerHTML; },
    id() { return Number(this.html().match(/aria-label="Sentence (\d+)"/)?.[1]); },
    click(id) { return el(id).click(); },
    async rate(rating) { const button = document.querySelectorAll('[data-rating]').find(button => button.dataset.rating === rating); assert.ok(button, `Expected ${rating} rating`); await button.click(); },
    async type(text) { el('typed-answer').value = text; await el('typed-answer').dispatch('input'); },
    go(view) { location.hash = `#${view}`; },
    async preferences(values) { this.go('settings'); for (const [name, value] of Object.entries(values)) el('settings-form').elements[name].value = String(value); await el('settings-form').dispatch('submit'); this.go('study'); },
    advance(ms) { clock += ms; for (const callback of intervals) callback(); },
    async import(data) { this.go('settings'); const input = el('import-progress'); input.files = [{ size: 100, async text() { return JSON.stringify(data); } }]; await input.dispatch('change'); },
    async key(key) { for (const callback of documentListeners.keydown || []) await callback({ key, target: document.body, preventDefault() {} }); }
  };
}

const normalizedState = state => {
  const output = JSON.parse(JSON.stringify(state)); delete output.exportedAt; output.undo = null;
  for (const record of Object.values(output.progress)) { delete record.card.interval; delete record.card.label; }
  return output;
};

(async () => {
  const storage = new Map();
  let app = harness(storage);
  assert.equal(app.context.SENTENCE_DECK.length, 1000);
  assert.equal(app.id(), 1);
  await app.click('kana-hint'); await app.click('romaji-hint');
  assert.equal(app.el('kana-reading').hidden, false);
  assert.equal(app.el('romaji-reading').hidden, false);
  assert.equal(app.state(), null);
  await app.click('reveal-answer'); await app.rate('good');
  assert.equal(app.state().progress[1].card.state, 'learning');
  assert.equal(app.state().progress[1].card.step, 1);
  assert.equal(app.state().daily.newCount, 1);
  assert.equal(app.state().history[0].kanaHint, true);
  assert.equal(app.id(), 2);
  await app.click('card-undo');
  assert.deepEqual(app.state().progress, {});
  assert.equal(app.state().daily.newCount, 0);
  assert.equal(app.state().history.length, 0);
  assert.equal(app.id(), 1);
  await app.click('reveal-answer'); await app.rate('good');
  const pausedState = normalizedState(app.state());
  await app.click('pause-button');
  assert.match(app.html(), /Saved your place/);
  assert.deepEqual(normalizedState(app.state()), pausedState);
  await app.click('resume-study'); assert.equal(app.id(), 2);

  await app.preferences({ newPerDay: 0, answerMode: 'typed' });
  assert.equal(Number.isNaN(app.id()), true);
  const practiceState = normalizedState(app.state());
  await app.click('random-practice');
  assert.equal(app.id(), 1);
  let card = app.context.SENTENCE_DECK[0];
  await app.type(`  ${card.en.toUpperCase()}!!!  `); await app.click('reveal-answer');
  assert.match(app.html(), /Matches a reference phrase/);
  assert.equal(app.document.querySelectorAll('[data-rating]').length, 0);
  await app.key('3');
  assert.deepEqual(normalizedState(app.state()), practiceState);
  await app.click('practice-next');
  card = app.context.SENTENCE_DECK[1];
  const negated = /\b(am|is|are|can|will)\b/i.test(card.en) ? card.en.replace(/\b(am|is|are|can|will)\b/i, '$1 not') : `Not ${card.en}`;
  await app.type(negated); await app.click('reveal-answer');
  assert.match(app.html(), /Different wording/);
  assert.deepEqual(normalizedState(app.state()), practiceState);
  await app.click('practice-back');
  assert.equal(Number.isNaN(app.id()), true);

  // A stopped learning step becomes due with no new-card quota remaining.
  app.advance(600001);
  assert.equal(app.id(), 1);
  await app.click('reveal-answer'); await app.rate('good');
  assert.equal(app.state().progress[1].card.state, 'review');
  assert.equal(app.state().daily.newCount, 1);
  assert.equal(app.state().history.length, 2);
  const persisted = normalizedState(app.state());
  app = harness(storage);
  assert.equal(Number.isNaN(app.id()), true);
  app.go('settings');
  assert.equal(app.el('settings-form').elements.newPerDay.value, 0);
  assert.equal(app.el('undo-button').disabled, true);
  assert.deepEqual(normalizedState(app.state()), persisted);
  await app.click('export-progress');
  const backup = JSON.parse(await app.document.downloads[0].blob.text());
  assert.deepEqual(normalizedState(backup), persisted);

  const invalid = JSON.parse(JSON.stringify(backup)); invalid.progress[1].card.stability = 0.0001;
  const beforeInvalid = app.state();
  await app.import(invalid);
  assert.match(app.el('backup-status').textContent, /^Import skipped:/);
  assert.equal(app.el('import-dialog').open, false);
  assert.deepEqual(app.state(), beforeInvalid);
  await app.preferences({ newPerDay: 5 });
  assert.equal(app.id(), 2);
  await app.type(app.context.SENTENCE_DECK[1].en); await app.click('reveal-answer'); await app.rate('good');
  assert.equal(app.state().daily.newCount, 2);
  await app.import(backup);
  assert.equal(app.el('import-dialog').open, true);
  assert.equal(app.state().daily.newCount, 2);
  await app.click('confirm-import');
  assert.deepEqual(normalizedState(app.state()), persisted);

  // Failed storage reads preserve the original bytes and support an in-memory visit.
  const corrupt = new Map([[KEY, '{ broken JSON']]);
  const recovering = harness(corrupt);
  assert.equal(recovering.el('storage-warning').hidden, false);
  await recovering.click('reveal-answer'); await recovering.rate('good');
  assert.equal(corrupt.get(KEY), '{ broken JSON');
  recovering.go('settings'); await recovering.click('export-progress');
  assert.equal(JSON.parse(await recovering.document.downloads[0].blob.text()).daily.newCount, 1);
  await recovering.import(backup); await recovering.click('confirm-import');
  assert.deepEqual(normalizedState(recovering.state()), persisted);
  assert.equal(recovering.el('storage-warning').hidden, true);
  const unavailable = harness(new Map(), { writeFailure: true });
  await unavailable.click('reveal-answer'); await unavailable.rate('good');
  assert.equal(unavailable.el('storage-warning').hidden, false);
  unavailable.go('settings'); await unavailable.click('export-progress');
  assert.equal(JSON.parse(await unavailable.document.downloads[0].blob.text()).daily.newCount, 1);

  console.log('App model tests passed: actual app script queue, hints, ratings, undo, typing, pause, practice, due learning, preferences, persistence, backups, and storage recovery.');
})().catch(error => { console.error(error); process.exitCode = 1; });
