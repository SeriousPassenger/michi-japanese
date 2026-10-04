'use strict';

// Optional development check. The shipped app has no package dependencies.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const moduleRoot = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
const { chromium } = require(moduleRoot ? path.join(moduleRoot, 'playwright') : 'playwright');
const KEY = 'michi-sentences-v1';

function comparable(state) {
  const result = JSON.parse(JSON.stringify(state));
  delete result.exportedAt;
  result.undo = null;
  for (const record of Object.values(result.progress)) {
    delete record.card.interval;
    delete record.card.label;
  }
  return result;
}

(async () => {
  // Managed workspaces may have no /tmp; keep browser scratch data local.
  const testTemp = fs.mkdtempSync(path.join(__dirname, '.integration-'));
  process.env.TMPDIR = testTemp;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: process.env.MICHI_CHROMIUM_EXECUTABLE || undefined });
  } catch (error) {
    fs.rmSync(testTemp, { recursive: true, force: true });
    throw error;
  }
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const readState = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  const sentenceId = () => page.locator('.study-card').getAttribute('aria-label').then(label => Number(label.replace('Sentence ', '')));
  const reveal = () => page.locator('#reveal-answer').click();
  const rateGood = () => page.locator('[data-rating="good"]').click();
  const preferences = async (values) => {
    await page.locator('a[data-view="settings"]').click();
    for (const [name, value] of Object.entries(values)) {
      const field = page.locator(`[name="${name}"]`);
      if (name === 'newPerDay') await field.fill(String(value));
      else await field.selectOption(String(value));
    }
    await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  };
  const importFile = data => page.locator('#import-progress').setInputFiles({
    name: 'test-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data))
  });

  try {
    await page.goto(pathToFileURL(path.join(__dirname, 'index.html')).href);
    await page.evaluate(key => localStorage.removeItem(key), KEY);
    await page.reload();
    await page.locator('#reveal-answer').waitFor();
    assert.equal(await page.evaluate(() => window.SENTENCE_DECK.length), 1000);
    assert.equal(await sentenceId(), 1);

    // Reading hints reveal only readings and leave the scheduler untouched.
    assert.equal(await page.locator('#kana-reading').isVisible(), false);
    assert.equal(await page.locator('#romaji-reading').isVisible(), false);
    await page.locator('#kana-hint').click();
    await page.locator('#romaji-hint').click();
    assert.equal(await page.locator('#kana-reading').isVisible(), true);
    assert.equal(await page.locator('#romaji-reading').isVisible(), true);
    assert.equal(await readState(), null);

    await reveal();
    await rateGood();
    let state = await readState();
    assert.equal(state.progress[1].card.state, 'learning');
    assert.equal(state.progress[1].card.step, 1);
    assert.equal(state.daily.newCount, 1);
    assert.equal(state.history.length, 1);
    assert.equal(state.history[0].kanaHint, true);
    assert.equal(await sentenceId(), 2);
    assert.ok(state.progress[1].card.due > Date.now());

    // Undo restores the introduction counter as well as the card and log.
    await page.locator('#card-undo').click();
    state = await readState();
    assert.deepEqual(state.progress, {});
    assert.equal(state.daily.newCount, 0);
    assert.equal(state.history.length, 0);
    assert.equal(await sentenceId(), 1);
    await reveal();
    await rateGood();

    const beforePause = comparable(await readState());
    await page.locator('#pause-button').click();
    await page.locator('#resume-study').waitFor();
    assert.deepEqual(comparable(await readState()), beforePause);
    await page.locator('#resume-study').click();
    assert.equal(await sentenceId(), 2);

    // A zero introduction limit stops new cards without removing future reviews.
    await preferences({ newPerDay: 0, answerMode: 'typed' });
    await page.locator('a[data-view="study"]').click();
    assert.equal(await page.locator('.study-card').count(), 0);
    assert.equal(Object.keys((await readState()).progress).length, 1);

    const beforePractice = comparable(await readState());
    await page.locator('#random-practice').click();
    let id = await sentenceId();
    let reference = await page.evaluate(id => window.SENTENCE_DECK.find(card => card.id === id).en, id);
    await page.locator('#typed-answer').fill(`  ${reference.toUpperCase()}!!!  `);
    await reveal();
    assert.match(await page.locator('.answer-feedback').textContent(), /Matches a reference/);
    await page.locator('#practice-next').click();
    id = await sentenceId();
    reference = await page.evaluate(id => window.SENTENCE_DECK.find(card => card.id === id).en, id);
    await page.locator('#typed-answer').fill(`${reference} not`);
    await reveal();
    assert.match(await page.locator('.answer-feedback').textContent(), /Different wording/);
    assert.equal(await page.locator('[data-rating]').count(), 0);
    assert.deepEqual(comparable(await readState()), beforePractice);
    await page.locator('#practice-back').click();
    assert.equal(await page.locator('.study-card').count(), 0);

    // file:// progress survives a reload within the same browser profile.
    const beforeReload = comparable(await readState());
    await page.reload();
    await page.locator('#random-practice').waitFor();
    assert.deepEqual(comparable(await readState()), beforeReload);
    await page.locator('a[data-view="settings"]').click();
    assert.equal(await page.locator('#undo-button').isDisabled(), true);
    assert.equal(await page.locator('[name="newPerDay"]').inputValue(), '0');

    // Exercise the actual exporter, then import its contents after more progress.
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-progress').click();
    const download = await downloadPromise;
    const backup = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.deepEqual(comparable(backup), beforeReload);
    const beforeInvalid = await readState();
    const invalid = JSON.parse(JSON.stringify(backup));
    invalid.progress[1].card.stability = 0.0001;
    await importFile(invalid);
    await page.waitForFunction(() => document.getElementById('backup-status').textContent.startsWith('Import skipped:'));
    assert.equal(await page.locator('#import-dialog').evaluate(dialog => dialog.open), false);
    assert.deepEqual(await readState(), beforeInvalid);

    await preferences({ newPerDay: 5 });
    await page.locator('a[data-view="study"]').click();
    assert.equal(await sentenceId(), 2);
    reference = await page.evaluate(() => window.SENTENCE_DECK[1].en);
    await page.locator('#typed-answer').fill(reference);
    await reveal();
    await rateGood();
    assert.equal((await readState()).daily.newCount, 2);
    await page.locator('a[data-view="settings"]').click();
    await importFile(backup);
    await page.locator('#import-dialog[open]').waitFor();
    // Selecting a valid backup alone must not replace saved data.
    assert.equal((await readState()).daily.newCount, 2);
    await page.locator('#confirm-import').click();
    assert.deepEqual(comparable(await readState()), comparable(backup));
    assert.equal(await page.locator('#undo-button').isDisabled(), true);

    await page.setViewportSize({ width: 375, height: 812 });
    await page.locator('a[data-view="study"]').click();
    await page.locator('#random-practice').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.ok(await page.locator('#kana-hint').evaluate(el => el.getBoundingClientRect().height >= 44));
    assert.deepEqual(errors, []);
    console.log('Integration tests passed: file:// review/undo, hints, typing, pause, practice, preferences, persistence, backups, and mobile layout.');
  } finally {
    await context.close();
    await browser.close();
    fs.rmSync(testTemp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
