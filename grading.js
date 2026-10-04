(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SentenceGrading = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Expand contractions with an unambiguous standard reading. In particular,
  // do not expand 'd (had/would) or 's (is/has/possessive) by guessing.
  var contractions = {
    "i'm": 'i am',
    "you're": 'you are',
    "we're": 'we are',
    "they're": 'they are',
    "i've": 'i have',
    "you've": 'you have',
    "we've": 'we have',
    "they've": 'they have',
    "i'll": 'i will',
    "you'll": 'you will',
    "he'll": 'he will',
    "she'll": 'she will',
    "it'll": 'it will',
    "we'll": 'we will',
    "they'll": 'they will',
    "isn't": 'is not',
    "aren't": 'are not',
    "wasn't": 'was not',
    "weren't": 'were not',
    "don't": 'do not',
    "doesn't": 'does not',
    "didn't": 'did not',
    "can't": 'can not',
    "couldn't": 'could not',
    "won't": 'will not',
    "wouldn't": 'would not',
    "shouldn't": 'should not',
    "mustn't": 'must not',
    "needn't": 'need not',
    "haven't": 'have not',
    "hasn't": 'has not',
    "hadn't": 'had not',
    "shan't": 'shall not',
    "let's": 'let us'
  };

  function normalize(text) {
    var value = text == null ? '' : String(text);
    value = value.normalize('NFKC').toLowerCase();
    // Curly/typographic apostrophes often come from mobile keyboards.
    value = value.replace(/[\u2018\u2019\u02bc\uff07]/g, "'");
    value = value.replace(/\b[a-z]+(?:'[a-z]+)+\b/g, function (word) {
      return Object.prototype.hasOwnProperty.call(contractions, word)
        ? contractions[word]
        : word;
    });
    value = value.replace(/\bcannot\b/g, 'can not');
    // Keep letters, diacritics and digits; punctuation becomes word boundaries.
    value = value.replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ');
    return value.replace(/\s+/g, ' ').trim();
  }

  function compare(input, card) {
    var normalized = normalize(input);
    if (!normalized) return { match: false, kind: 'empty', normalized: normalized };
    card = card || {};
    if (typeof card.en === 'string' && normalized === normalize(card.en)) {
      return { match: true, kind: 'reference', normalized: normalized };
    }
    var alternatives = Array.isArray(card.alternatives) ? card.alternatives : [];
    for (var i = 0; i < alternatives.length; i += 1) {
      if (typeof alternatives[i] === 'string' && normalized === normalize(alternatives[i])) {
        return { match: true, kind: 'alternative', normalized: normalized };
      }
    }
    // This is a wording comparison, not a judgment of translation correctness.
    return { match: false, kind: 'unmatched', normalized: normalized };
  }

  return Object.freeze({ normalize: normalize, compare: compare });
});
