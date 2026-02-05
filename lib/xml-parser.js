/**
 * Minimal XML helpers (regex-based, no dependency).
 * For RSS/Atom feed parsing — not a full XML parser.
 */

function parseString(xml) {
  // Placeholder — actual parsing is done inline in digest.js via regex
  // This module exists for future expansion (proper SAX/DOM parsing)
  return xml;
}

module.exports = { parseString };
