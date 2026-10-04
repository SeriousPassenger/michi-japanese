/* Run with: node scheduler-tests.js (Node built-ins only; no install step). */
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const SRS = require("./srs.js");
const DAY = SRS.DAY;
const NOW = Date.UTC(2026, 0, 1, 12);
let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  process.stdout.write("PASS " + name + "\n");
}
function close(actual, expected, epsilon = 1e-10) {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} should equal ${expected}`);
}
function reviewCard(overrides = {}) {
  return Object.assign({
    state: "review", due: NOW, stability: 10, difficulty: 5,
    lastReview: NOW - 10 * DAY, reps: 8, lapses: 0, step: 0
  }, overrides);
}

test("classic-script browser export works without modules or network", function () {
  const context = vm.createContext({ Date, Math, Object, Number, Array, TypeError, RangeError });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "srs.js"), "utf8"), context);
  assert.equal(context.SentenceSRS.version, SRS.version);
  assert.equal(context.SentenceSRS.createCard(NOW).state, "new");
});

test("new-card previews include the configured minute steps and Easy graduation", function () {
  const p = SRS.preview(SRS.createCard(NOW), NOW);
  assert.equal(p.again.state, "learning");
  assert.equal(p.again.interval, 60000);
  assert.equal(p.hard.interval, 330000);
  assert.equal(p.hard.label, "5.5m");
  assert.equal(p.good.interval, 600000);
  assert.equal(p.good.step, 1);
  assert.equal(p.easy.state, "review");
  assert.equal(p.easy.interval, 8 * DAY);
  close(p.good.stability, 2.3065);
  assert.equal(p.easy.difficulty, 1);
  assert.equal(p.again.lapses, 0);
});

test("learning Good graduates, Again restarts, Hard repeats, Easy skips", function () {
  const learning = SRS.rate(SRS.createCard(NOW), "good", NOW);
  const p = SRS.preview(learning, learning.due);
  assert.equal(p.good.state, "review");
  assert.ok(p.good.interval >= DAY);
  assert.equal(p.again.state, "learning");
  assert.equal(p.again.step, 0);
  assert.equal(p.again.interval, 60000);
  assert.equal(p.hard.step, 1);
  assert.equal(p.hard.interval, 600000);
  assert.equal(p.easy.state, "review");
  assert.equal(p.good.reps, 2);
});

test("a review lapse enters relearning once and successful relearning graduates", function () {
  const forgotten = SRS.rate(reviewCard(), "again", NOW);
  assert.equal(forgotten.state, "relearning");
  assert.equal(forgotten.lapses, 1);
  assert.equal(forgotten.interval, 600000);
  assert.ok(forgotten.stability < 10);
  const repeated = SRS.rate(forgotten, "again", forgotten.due);
  assert.equal(repeated.lapses, 1);
  assert.equal(repeated.step, 0);
  const p = SRS.preview(repeated, repeated.due);
  assert.equal(p.hard.interval, 900000);
  assert.equal(p.good.state, "review");
  assert.equal(p.good.step, 0);
  assert.equal(p.good.lapses, 1);
  assert.ok(p.good.interval >= DAY);
});

test("FSRS-6 numerical fixtures from the official equations at D=5 S=10 t=10", function () {
  // Independent Python evaluation of the official FSRS-6 equations and
  // py-fsrs's raw Easy mean-reversion target; no values copied from this module.
  // Source: github.com/open-spaced-repetition/py-fsrs/blob/main/fsrs/scheduler.py
  const fixtures = {
    again: [1.3919869729546932, 8.341762369296838, 1],
    hard: [23.246875110466817, 6.665995369296838, 23],
    good: [32.02672948198673, 4.9902283692968386, 32],
    easy: [51.25386164681294, 3.3144613692968385, 51]
  };
  const p = SRS.preview(reviewCard(), NOW, { relearningSteps: [] });
  for (const rating of Object.keys(fixtures)) {
    const expected = fixtures[rating];
    close(p[rating].stability, expected[0]);
    close(p[rating].difficulty, expected[1]);
    assert.equal(p[rating].interval, expected[2] * DAY);
  }
});

test("the forgetting curve is 90% at stability and decreases with time", function () {
  close(SRS.forgettingCurve(10, 10), 0.9);
  close(SRS.forgettingCurve(0, 10), 1);
  assert.ok(SRS.forgettingCurve(20, 10) < SRS.forgettingCurve(10, 10));
  assert.ok(SRS.forgettingCurve(10, 20) > SRS.forgettingCurve(10, 10));
  assert.equal(SRS.retrievability(SRS.createCard(NOW), NOW), 0);
  close(SRS.retrievability(reviewCard(), NOW), 0.9);
});

test("overdue reviews use actual elapsed time without resets or penalties", function () {
  const card = reviewCard();
  const timely = SRS.rate(card, "good", NOW);
  const overdue = SRS.rate(card, "good", NOW + 50 * DAY);
  assert.ok(overdue.stability > timely.stability);
  assert.equal(overdue.reps, card.reps + 1);
  assert.equal(overdue.lapses, card.lapses);
  assert.equal(overdue.state, "review");
  assert.equal(overdue.lastReview, NOW + 50 * DAY);
  assert.ok(SRS.retrievability(card, NOW + DAY / 2) < SRS.retrievability(card, NOW));
});

test("Hard Good Easy successes increase long-term stability in grade order", function () {
  const p = SRS.preview(reviewCard(), NOW);
  assert.ok(p.hard.stability >= 10);
  assert.ok(p.hard.stability < p.good.stability);
  assert.ok(p.good.stability < p.easy.stability);
  assert.ok(p.again.difficulty > p.hard.difficulty);
  assert.ok(p.hard.difficulty > p.good.difficulty);
  assert.ok(p.good.difficulty > p.easy.difficulty);
});

test("same-day successful reviews never reduce stability", function () {
  const card = reviewCard({ lastReview: NOW - 600000 });
  const p = SRS.preview(card, NOW);
  for (const rating of ["hard", "good", "easy"]) assert.ok(p[rating].stability >= card.stability);
  assert.ok(p.again.stability < card.stability);
  assert.equal(SRS.retrievability(card, card.lastReview - 600000), 1);
});

test("higher retention shortens intervals and the maximum interval is enforced", function () {
  const card = reviewCard();
  const low = SRS.rate(card, "good", NOW, { desiredRetention: 0.7 });
  const high = SRS.rate(card, "good", NOW, { desiredRetention: 0.97 });
  assert.ok(high.interval < low.interval);
  const bounded = SRS.rate(card, "easy", NOW, { maxIntervalDays: 3 });
  assert.equal(bounded.interval, 3 * DAY);
  const oneDay = SRS.rate(SRS.createCard(NOW), "again", NOW, { learningSteps: [], desiredRetention: 0.97 });
  assert.equal(oneDay.interval, DAY);
});

test("empty or shortened steps graduate safely and one-step Hard is 1.5x", function () {
  const noSteps = SRS.rate(SRS.createCard(NOW), "good", NOW, { learningSteps: [] });
  assert.equal(noSteps.state, "review");
  const oneStep = SRS.rate(SRS.createCard(NOW), "hard", NOW, { learningSteps: [60000] });
  assert.equal(oneStep.interval, 90000);
  const card = SRS.rate(SRS.createCard(NOW), "good", NOW);
  const shortened = SRS.rate(card, "hard", card.due, { learningSteps: [60000] });
  assert.equal(shortened.state, "review");
  const forgotten = SRS.rate(reviewCard(), "again", NOW, { relearningSteps: [] });
  assert.equal(forgotten.state, "review");
  assert.equal(forgotten.lapses, 1);
});

test("preview/rate never mutate card or settings and persisted cards round-trip", function () {
  const card = reviewCard();
  const settings = { desiredRetention: 0.9, learningSteps: [60000, 600000] };
  const original = JSON.stringify([card, settings]);
  const p = SRS.preview(card, NOW, settings);
  assert.equal(JSON.stringify([card, settings]), original);
  assert.notEqual(p.again, p.good);
  assert.notEqual(p.good, card);
  assert.deepEqual(SRS.rate(card, "good", NOW, settings), p.good);
  const restored = JSON.parse(JSON.stringify(p.good));
  assert.deepEqual(SRS.preview(restored, restored.due), SRS.preview(p.good, p.good.due));
  const normalized = SRS.normalizeSettings();
  normalized.learningSteps[0] = 1000;
  assert.equal(SRS.defaults.learningSteps[0], 60000);
});

test("invalid imported memory, ratings, timestamps, and settings are rejected", function () {
  assert.throws(() => SRS.createCard(NaN), RangeError);
  assert.throws(() => SRS.rate(reviewCard({ stability: 0 }), "good", NOW), TypeError);
  assert.throws(() => SRS.rate(reviewCard(), "toString", NOW), RangeError);
  assert.throws(() => SRS.normalizeSettings({ desiredRetention: 1 }), RangeError);
  assert.throws(() => SRS.normalizeSettings({ maxIntervalDays: 0 }), RangeError);
  assert.throws(() => SRS.normalizeSettings({ learningSteps: [DAY] }), RangeError);
});

test("irregular simulated sessions keep finite memory and valid bounded schedules", function () {
  for (let seed = 0; seed < 25; seed++) {
    let card = SRS.createCard(NOW);
    let time = NOW;
    let lapseCount = 0;
    for (let review = 0; review < 100; review++) {
      const rating = ["again", "hard", "good", "good", "easy"][(review * 7 + seed * 11) % 5];
      if (card.state === "review" && rating === "again") lapseCount++;
      card = SRS.rate(card, rating, time);
      assert.equal(card.reps, review + 1);
      assert.equal(card.lapses, lapseCount);
      assert.ok(Number.isFinite(card.stability) && card.stability >= 0.001);
      assert.ok(card.difficulty >= 1 && card.difficulty <= 10);
      assert.ok(Number.isFinite(card.due) && card.due > time);
      if (card.state === "review") assert.ok(card.interval >= DAY && card.interval <= 36500 * DAY);
      time = card.due + ((review + seed) % 7) * DAY;
    }
  }
});

process.stdout.write(`\n${passed} scheduler tests passed.\n`);
