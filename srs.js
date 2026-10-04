/*
 * SentenceSRS 1.0 — dependency-free FSRS-6 memory model with short learning steps.
 * Equations/default weights checked 2026-10-04 against the official sources:
 * https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
 * https://github.com/open-spaced-repetition/py-fsrs/blob/main/fsrs/scheduler.py
 *
 * The memory equations, first-review initialization, difficulty damping,
 * short-term updates, and lapse-stability cap follow FSRS-6 / py-fsrs.
 * Deliberate implementation choices: exact elapsed days (milliseconds / 86400000),
 * deterministic whole-day review intervals without fuzz, and numeric timestamps.
 * Desired retention defaults to 0.9; the published weights are NOT personalized
 * or optimized from this user's history. The target assumes timely reviews.
 * A missed day never resets progress or adds a penalty; the model uses elapsed
 * time and the actual recall grade at the next review.
 *
 * API: createCard(now), preview(card, now, settings), rate(card, rating, now,
 * settings). Ratings: again | hard | good | easy. Times and learning steps are
 * milliseconds; stability and review intervals use days internally. All results
 * are JSON-serializable; input cards/settings are never mutated. preview returns
 * one complete next card per grade, including due, interval (ms), and label.
 * Persist card returned by rate(). Keep the previous card for an undo action.
 *
 * MIT License
 * Copyright (c) 2022 Open Spaced Repetition
 * Copyright (c) 2026 Michi contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.SentenceSRS = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DAY = 86400000;
  const STABILITY_MIN = 0.001;
  const WEIGHTS = Object.freeze([
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194,
    0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629,
    1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542
  ]);
  const RATINGS = Object.freeze({ again: 1, hard: 2, good: 3, easy: 4 });
  const STATES = ["new", "learning", "review", "relearning"];
  const DEFAULTS = Object.freeze({
    desiredRetention: 0.9,
    learningSteps: Object.freeze([60000, 600000]),
    relearningSteps: Object.freeze([600000]),
    maxIntervalDays: 36500
  });
  const DECAY = -WEIGHTS[20];
  const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;
  const clamp = (n, low, high) => Math.min(high, Math.max(low, n));

  function timestamp(now) {
    const ms = now === undefined ? Date.now() : Number(now);
    if (!Number.isFinite(ms) || Math.abs(ms) > 8640000000000000) {
      throw new RangeError("Review time must be a valid millisecond timestamp.");
    }
    return ms;
  }

  function steps(value, fallback, name) {
    if (value === undefined) return fallback.slice();
    if (!Array.isArray(value) || value.length > 20 || value.some(function (ms) {
      return typeof ms !== "number" || !Number.isFinite(ms) || ms < 1000 || ms >= DAY;
    })) throw new RangeError(name + " must contain up to 20 steps between 1 second and 24 hours.");
    return value.slice();
  }

  function normalizeSettings(settings) {
    const source = settings || {};
    const retention = source.desiredRetention === undefined ? DEFAULTS.desiredRetention : Number(source.desiredRetention);
    const maximum = source.maxIntervalDays === undefined ? DEFAULTS.maxIntervalDays : Number(source.maxIntervalDays);
    if (!Number.isFinite(retention) || retention < 0.7 || retention > 0.97) {
      throw new RangeError("Desired retention must be between 0.70 and 0.97.");
    }
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 36500) {
      throw new RangeError("Maximum interval must be a whole number from 1 to 36500 days.");
    }
    return {
      desiredRetention: retention,
      learningSteps: steps(source.learningSteps, DEFAULTS.learningSteps, "Learning steps"),
      relearningSteps: steps(source.relearningSteps, DEFAULTS.relearningSteps, "Relearning steps"),
      maxIntervalDays: maximum
    };
  }

  function createCard(now) {
    return {
      state: "new", due: timestamp(now), stability: 0, difficulty: 0,
      lastReview: null, reps: 0, lapses: 0, step: 0
    };
  }

  function validateCard(card) {
    if (!card || STATES.indexOf(card.state) < 0 || !Number.isFinite(card.due) ||
        !Number.isInteger(card.reps) || card.reps < 0 ||
        !Number.isInteger(card.lapses) || card.lapses < 0 ||
        !Number.isInteger(card.step) || card.step < 0) {
      throw new TypeError("Invalid scheduling card.");
    }
    if (card.state !== "new" &&
        (!Number.isFinite(card.lastReview) || !Number.isFinite(card.stability) ||
         card.stability < STABILITY_MIN || !Number.isFinite(card.difficulty) ||
         card.difficulty < 1 || card.difficulty > 10)) {
      throw new TypeError("A studied card needs valid FSRS memory values and lastReview.");
    }
  }

  // FSRS-6 forgetting curve. At t = stability the modeled recall is exactly 90%.
  function forgettingCurve(elapsedDays, stability) {
    return Math.pow(1 + FACTOR * Math.max(0, elapsedDays) / Math.max(STABILITY_MIN, stability), DECAY);
  }

  function retrievability(card, now) {
    validateCard(card);
    if (card.state === "new") return 0;
    return forgettingCurve((timestamp(now) - card.lastReview) / DAY, card.stability);
  }

  function initialDifficulty(grade) {
    return WEIGHTS[4] - Math.exp(WEIGHTS[5] * (grade - 1)) + 1;
  }

  function nextDifficulty(difficulty, grade) {
    const delta = -WEIGHTS[6] * (grade - 3);
    const damped = difficulty + delta * (10 - difficulty) / 9;
    // The mean-reversion target uses the RAW initial Easy difficulty.
    return clamp(WEIGHTS[7] * initialDifficulty(4) + (1 - WEIGHTS[7]) * damped, 1, 10);
  }

  function nextStability(card, grade, elapsedDays) {
    const s = card.stability;
    const d = card.difficulty;
    let result;
    if (elapsedDays < 1) {
      let increase = Math.exp(WEIGHTS[17] * (grade - 3 + WEIGHTS[18])) * Math.pow(s, -WEIGHTS[19]);
      if (grade >= 2) increase = Math.max(1, increase);
      result = s * increase;
    } else {
      const r = forgettingCurve(elapsedDays, s);
      if (grade === 1) {
        const lapse = WEIGHTS[11] * Math.pow(d, -WEIGHTS[12]) *
          (Math.pow(s + 1, WEIGHTS[13]) - 1) * Math.exp(WEIGHTS[14] * (1 - r));
        const shortTermCap = s / Math.exp(WEIGHTS[17] * WEIGHTS[18]);
        result = Math.min(lapse, shortTermCap);
      } else {
        const hardPenalty = grade === 2 ? WEIGHTS[15] : 1;
        const easyBonus = grade === 4 ? WEIGHTS[16] : 1;
        result = s * (1 + Math.exp(WEIGHTS[8]) * (11 - d) * Math.pow(s, -WEIGHTS[9]) *
          (Math.exp(WEIGHTS[10] * (1 - r)) - 1) * hardPenalty * easyBonus);
      }
    }
    return Math.max(STABILITY_MIN, result);
  }

  function intervalDays(stability, settings) {
    const interval = stability / FACTOR * (Math.pow(settings.desiredRetention, 1 / DECAY) - 1);
    return clamp(Math.round(interval), 1, settings.maxIntervalDays);
  }

  function formatInterval(ms) {
    if (ms < 60000) return Math.max(1, Math.round(ms / 1000)) + "s";
    if (ms < 3600000) return (Math.round(ms / 6000) / 10) + "m";
    if (ms < DAY) return (Math.round(ms / 360000) / 10) + "h";
    const days = Math.round(ms / DAY);
    return days + "d";
  }

  function rate(card, rating, now, settings) {
    validateCard(card);
    if (!Object.prototype.hasOwnProperty.call(RATINGS, rating)) {
      throw new RangeError("Rating must be again, hard, good, or easy.");
    }
    const config = normalizeSettings(settings);
    const ms = timestamp(now);
    const grade = RATINGS[rating];
    const result = Object.assign({}, card);
    if (card.state === "new") {
      result.stability = WEIGHTS[grade - 1];
      result.difficulty = clamp(initialDifficulty(grade), 1, 10);
    } else {
      const elapsedDays = Math.max(0, (ms - card.lastReview) / DAY);
      result.stability = nextStability(card, grade, elapsedDays);
      result.difficulty = nextDifficulty(card.difficulty, grade);
    }

    let interval;
    function graduate() {
      result.state = "review";
      result.step = 0;
      interval = intervalDays(result.stability, config) * DAY;
    }
    function scheduleSteps(activeSteps, state, currentStep) {
      if (!activeSteps.length || (currentStep >= activeSteps.length && grade !== 1)) {
        graduate();
      } else if (grade === 4) {
        graduate();
      } else if (grade === 1) {
        result.state = state;
        result.step = 0;
        interval = activeSteps[0];
      } else if (grade === 2) {
        result.state = state;
        result.step = currentStep;
        interval = currentStep === 0
          ? (activeSteps.length > 1 ? (activeSteps[0] + activeSteps[1]) / 2 : activeSteps[0] * 1.5)
          : activeSteps[currentStep];
      } else if (currentStep + 1 >= activeSteps.length) {
        graduate();
      } else {
        result.state = state;
        result.step = currentStep + 1;
        interval = activeSteps[result.step];
      }
    }

    if (card.state === "review") {
      if (grade === 1) {
        result.lapses += 1;
        if (config.relearningSteps.length) {
          result.state = "relearning";
          result.step = 0;
          interval = config.relearningSteps[0];
        } else graduate();
      } else graduate();
    } else if (card.state === "relearning") {
      scheduleSteps(config.relearningSteps, "relearning", card.step);
    } else {
      scheduleSteps(config.learningSteps, "learning", card.state === "new" ? 0 : card.step);
    }
    result.lastReview = ms;
    result.reps += 1;
    result.due = ms + interval;
    result.interval = interval;
    result.label = formatInterval(interval);
    return result;
  }

  function preview(card, now, settings) {
    const ms = timestamp(now);
    return {
      again: rate(card, "again", ms, settings),
      hard: rate(card, "hard", ms, settings),
      good: rate(card, "good", ms, settings),
      easy: rate(card, "easy", ms, settings)
    };
  }

  return Object.freeze({
    version: "FSRS-6 / SentenceSRS 1.0",
    defaults: DEFAULTS, weights: WEIGHTS, DAY: DAY,
    createCard: createCard, preview: preview, rate: rate,
    retrievability: retrievability, forgettingCurve: forgettingCurve,
    normalizeSettings: normalizeSettings, formatInterval: formatInterval
  });
});
