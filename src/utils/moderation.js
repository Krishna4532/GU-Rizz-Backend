const Filter = require('bad-words');
const filter = new Filter();

// Extend with custom campus-specific bad words if needed
// filter.addWords('word1', 'word2');

const containsOffensiveContent = (text) => {
  try {
    return filter.isProfane(text);
  } catch {
    return false;
  }
};

const sanitizeText = (text) => {
  try {
    return filter.clean(text);
  } catch {
    return text;
  }
};

// Basic spam patterns
const isSpam = (text) => {
  const spamPatterns = [
    /(.)\1{10,}/,                 // 10+ repeated chars
    /(https?:\/\/[^\s]+){3,}/,   // 3+ URLs
    /\b(buy now|click here|free money|earn \$)\b/i,
  ];
  return spamPatterns.some((p) => p.test(text));
};

module.exports = { containsOffensiveContent, sanitizeText, isSpam };
