'use strict';

const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const grading = require('./grading.js');

assert.equal(grading.normalize('  Ｉ AM，a student!  '), 'i am a student');
assert.equal(grading.normalize('Coffee—tea; water?'), 'coffee tea water');
assert.equal(grading.normalize('I’m a student.'), 'i am a student');
assert.equal(grading.normalize("You're early; we're ready."), 'you are early we are ready');
assert.equal(grading.normalize("I can't swim."), grading.normalize('I cannot swim.'));
assert.equal(grading.normalize("I won't go."), grading.normalize('I will not go.'));
assert.equal(grading.normalize("She doesn't eat meat."), grading.normalize('She does not eat meat.'));
assert.equal(grading.normalize("I didn't go."), grading.normalize('I did not go.'));
assert.equal(grading.normalize("They aren't here."), grading.normalize('They are not here.'));
assert.equal(grading.normalize("It isn't hot."), grading.normalize('It is not hot.'));
assert.equal(grading.normalize(null), '');
assert.equal(grading.normalize('—?!'), '');

assert.deepEqual(grading.compare(' I’m a STUDENT! ', { en: 'I am a student.' }), {
  match: true, kind: 'reference', normalized: 'i am a student'
});
assert.deepEqual(grading.compare('This book belongs to me.', {
  en: 'This is my book.', alternatives: ['This book belongs to me.']
}), { match: true, kind: 'alternative', normalized: 'this book belongs to me' });

// Negation, word order and numbers must never disappear into fuzzy matching.
[
  ['I do not like cats.', 'I like cats.'],
  ['I can swim.', "I can't swim."],
  ['She eats meat.', "She doesn't eat meat."],
  ['I will go.', "I won't go."],
  ['I have two cats.', 'I have three cats.'],
  ['The dog sees the cat.', 'The cat sees the dog.']
].forEach(([input, reference]) => {
  assert.equal(grading.compare(input, { en: reference }).match, false);
});

// An unlisted paraphrase is "unmatched", not labeled an incorrect translation.
assert.equal(grading.compare('I own this book.', { en: 'This is my book.' }).kind, 'unmatched');
assert.equal(grading.compare("I'd eaten.", { en: 'I would eaten.' }).match, false);
assert.equal(grading.compare("He's arrived.", { en: 'He is arrived.' }).match, false);
assert.equal(grading.compare('   ', { en: '' }).kind, 'empty');
assert.equal(grading.compare('?!', { en: 'A question.' }).kind, 'empty');
assert.equal(grading.compare('something', null).kind, 'unmatched');
assert.equal(grading.compare('something', { alternatives: 'something' }).kind, 'unmatched');
assert.equal(grading.compare('something', { alternatives: [null, 42, 'something'] }).kind, 'alternative');

// Verify the shipped classic script also works without CommonJS or a build step.
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'grading.js'), 'utf8'), context);
assert.equal(typeof context.SentenceGrading.compare, 'function');
assert.equal(context.SentenceGrading.compare('Hello!', { en: 'hello' }).match, true);

console.log('Grading tests passed.');
