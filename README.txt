MICHI — JAPANESE IN SENTENCES

START ON A COMPUTER
Extract the whole folder. Open index.html in a normal browser (Chrome, Edge,
Firefox, or Safari). Keep the relative files together. No install, account,
build tool, server, or internet connection is required for sentence study.
Use a normal browser rather than an operating-system file preview.
Alternatively, michi-portable.html bundles the same app and deck in one file.
This can help when a browser permits local HTML but blocks relative file access.

ON A PHONE
The interface is responsive: quick reveal by default, optional typing, large
rating buttons, reading hints, and a bottom navigation bar. You may stop or
skip at any time. There are no daily assignments, streaks, or catch-up quotas.

Some phone file viewers cannot run JavaScript or load relative files. This is
especially common with the iOS Files preview. For reliable home-screen use,
put this folder on any static HTTPS host and open its index.html URL. Wait
until Preferences says "Offline files are ready", then use the browser's
Add to Home Screen/Install option. The service worker caches the full app and
deck for offline reopening. First load requires a connection; later sentence
study does not. Browser support for installation varies. No server code is used.
Local file loading remains available wherever the browser allows it.

STUDY, WHENEVER
Read a Japanese sentence and recall its English meaning, then reveal.
You may switch to Write meaning and type your own English. Typing is optional.
The app compares wording only against its reference/alternative translations;
it does not claim to understand arbitrary English paraphrases. If your wording
is different but the meaning is right, choose an appropriate passing rating.

Again: you missed the meaning, or revealed it before recalling.
Hard: you recalled correctly with effort (not a substitute for Again).
Good: you recalled correctly at a comfortable pace.
Easy: you recalled correctly immediately and confidently.

Show kana and Show romaji work separately and can both be open. Kana-first
display is in Preferences. Gradually rely less on romaji as your kana improves.
Listening is optional and uses an installed Japanese speech voice, if present.
Some voices need internet access; recorded native audio is not included.

Stop for now preserves progress. Skip for this visit changes no schedule.
Free practice, including Practice buttons in Sentences, changes no schedule.
New sentences are introduced in order. Due learning/review items come first.
Include new sentences can be turned off, or the new-card ceiling set to zero.
The default ceiling of 5 new sentences/day is a maximum, never a goal.
Missing days does not erase progress or create extra new cards. Review due
dates remain suggestions: gaps may lower recall, and you can relearn calmly.

READY-TO-USE DEFAULTS
Answer mode: quick recall/reveal (optional English typing).
Front: Japanese sentence; reading hints hidden until requested.
New ceiling: 5/day, new cards after due reviews, introduction in ID order.
Reviews: no daily limit or minimum; skip/stop whenever.
Learning steps: 1 minute and 10 minutes; Good on a new card starts at 10 minutes.
Relearning: 10 minutes after a forgotten review.
Scheduler: FSRS-6, published default 21 weights, target retention 90%.
Intervals: whole days after graduation, minimum1 day, maximum36,500 days.
No automatic parameter fitting; no interval fuzz; exact fractional elapsed days.
Preferences offers 85%,90%,95%. Higher targets generally mean more reviews.
Target retention is a model estimate, not a measured or guaranteed outcome.
Preference changes affect later ratings rather than rewriting existing due dates.

PROGRESS AND BACKUPS
Progress is saved automatically in this browser's localStorage. No cloud sync.
Different browsers, file locations, or HTTP origins may have different storage.
Export backup from Preferences before clearing data or moving devices. Import
backup replaces this browser's progress after confirmation. Invalid backups are
rejected without changing current progress. If storage is blocked, the app shows
a warning; export a backup before closing. Undo last rating works in the current
visit; reloading/backup importing deliberately discards the undo snapshot.
The review log keeps the most recent5,000 ratings; each card's memory survives.

THE BUNDLED DECK
1,000 original sentence-only items across40 units,25 sentences each.
Every item includes Japanese, kana, romaji, English, grammar, and optional
alternative meanings/notes. Material is aimed at N5-style beginner grammar;
there is no official exhaustive JLPT N5 sentence list. A few obligation forms
are labeled as a beginner stretch. This is not a certified exam-prep course.
Content received automated structural/readings checks and a language spot-check,
not independent professional native-speaker editing. Combine it with learning
kana, a grammar guide, and listening rather than only memorizing translations.

FILES
index.html                App entry point
styles.css                Responsive interface
app.js                    Study flow, queue, settings, storage, backups
srs.js                    Dependency-free FSRS-6 scheduler (MIT attribution)
grading.js                English reference-phrase comparison
deck.js                   Full bundled1000-card classic-script data
deck.json                 Same data in editable JSON
michi-n5-1000-anki.tsv     Optional sentence export for Anki
manifest.webmanifest      Optional phone installation manifest
sw.js                     Optional HTTPS/localhost offline cache
icon.svg / icon PNGs      App icons
michi-portable.html       The same app and deck bundled into one HTML file
*-tests.js / *.cjs         Optional developer checks (Node only)
anki/                     Optional Anki note templates and setup instructions

Anki export contains content only, not this app's scheduling history. The Anki
templates/setup file are optional; the browser app is fully configured already.

DECK CHOICES IF YOU PREFER ANKI
Tango N5 is a classic sentence-first option. Community editions vary in quality
and availability. Obtain the associated textbook/source legitimately; this app
does not include its copyrighted sentences or audio. TheMoeWay now treats its
old Tango recommendations as legacy and recommends Kaishi1.5k for vocabulary.
Kaishi1.5k is a modern beginner deck with words and example sentences/audio;
its default card is word-focused, rather than exclusively sentence-focused.
JLAB Beginner Course is another option for guided grammar through sentences;
its media-based sentences can be less controlled than a short graded deck.

Anki remains the stronger established option for native mobile apps, synchronization,
recorded-audio decks, and parameter optimization from review history. Michi is a
small portable alternative tailored to quick, optional, sentence-only practice.

PRIMARY REFERENCES (checked2026-10-04)
Anki FSRS settings: https://docs.ankiweb.net/deck-options.html
FSRS algorithm: https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
Reference implementation: https://github.com/open-spaced-repetition/py-fsrs/blob/main/fsrs/scheduler.py
Kaishi: https://github.com/donkuri/kaishi
Current resource guide: https://learnjapanese.moe/resources/
JLAB course: https://www.japanese-like-a-breeze.com/guide-for-beginners/
JLPT syllabus policy: https://www.jlpt.jp/e/faq/

VALIDATION
Passed:1,000-card schema/ID/uniqueness checks, matching JS/JSON/TSV output,
14 scheduler tests, English normalization tests, actual app scripts executed
against a DOM/storage/clock model, and service-worker caching logic tests.
The app model covers queue ordering, short steps, stopping, skipping, free
practice, typing, undo, preferences, persistence, and backup recovery.
These are logical checks. Real-browser integration and visual phone checks
could not run in the build environment because Chromium was unavailable.
The included integration-tests.cjs can be run with a local Playwright install.
Basic checks need only Node; from this folder:
  node scheduler-tests.js
  node grading-tests.js
  node app-model-tests.cjs
  node offline-tests.cjs

MAINTAINING THE APP
No npm dependencies. Node is needed only if you want to run tests.
Edit deck.json as desired and regenerate deck.js to keep the two in sync; the
browser uses deck.js. Preserve card IDs after study begins. If changing cached
app assets on a static host, increment sw.js's cache version before publishing.
