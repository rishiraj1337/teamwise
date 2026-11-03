'use strict';

/**
 * Truncate a string so its UTF-8 encoded length fits MySQL VARCHAR limits.
 */
function truncateUtf8(str, maxBytes) {
  const value = str === null || str === undefined ? '' : String(str);
  if (maxBytes <= 0) return '';
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) {
    return value;
  }
  let end = value.length;
  while (end > 0 && Buffer.byteLength(value.slice(0, end), 'utf8') > maxBytes) {
    end -= 1;
  }
  return end > 0 ? value.slice(0, end) : '';
}

module.exports = {
  truncateUtf8,
};
