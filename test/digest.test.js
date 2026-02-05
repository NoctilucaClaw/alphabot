#!/usr/bin/env node
/**
 * Tests for alphabot-news-digest
 * Run: node test/digest.test.js
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ ${msg}`);
    failed++;
  }
}

function run(args = '', timeout = 30000) {
  const cmd = `node ${path.join(__dirname, '..', 'digest.js')} ${args}`;
  return execSync(cmd, { encoding: 'utf8', timeout, stdio: ['pipe', 'pipe', 'pipe'] });
}

function runWithStderr(args = '', timeout = 30000) {
  const cmd = `node ${path.join(__dirname, '..', 'digest.js')} ${args}`;
  try {
    const stdout = execSync(cmd, { encoding: 'utf8', timeout });
    return { stdout, stderr: '' };
  } catch (e) {
    return { stdout: e.stdout || '', stderr: e.stderr || '', code: e.status };
  }
}

console.log('alphabot-news-digest tests\n');

// --- XML Parser ---
console.log('xml-parser:');
const { parseString } = require('../lib/xml-parser');
assert(typeof parseString === 'function', 'parseString is a function');
assert(parseString('<test>hello</test>') === '<test>hello</test>', 'parseString returns input (passthrough)');

// --- Feed file loading ---
console.log('\nfeeds.json:');
const feedsPath = path.join(__dirname, '..', 'feeds.json');
if (fs.existsSync(feedsPath)) {
  const feeds = JSON.parse(fs.readFileSync(feedsPath, 'utf8'));
  assert(Array.isArray(feeds), 'feeds.json is an array');
  assert(feeds.length > 0, `feeds.json has ${feeds.length} feeds`);
  assert(feeds.every(f => f.name && f.url), 'all feeds have name and url');
  assert(feeds.every(f => f.category), 'all feeds have category');
} else {
  assert(false, 'feeds.json exists');
}

// --- JSON output format ---
console.log('\n--format json (default):');
try {
  const out = run('--format json --hours 48');
  const json = JSON.parse(out);
  assert(json.generated, 'has generated timestamp');
  assert(typeof json.hours === 'number', 'has hours field');
  assert(typeof json.count === 'number', 'has count field');
  assert(Array.isArray(json.items), 'has items array');
  assert(Array.isArray(json.errors), 'has errors array');
  if (json.items.length > 0) {
    const item = json.items[0];
    assert(item.source, 'item has source');
    assert(item.title, 'item has title');
    assert(item.url, 'item has url');
    assert(item.category, 'item has category');
  }
  assert(json.count === json.items.length, 'count matches items.length');
} catch (e) {
  assert(false, `JSON output parses: ${e.message}`);
}

// --- Text output format ---
console.log('\n--format text:');
try {
  const out = run('--format text --hours 48');
  assert(out.includes('News Digest'), 'text output has header');
  assert(out.includes('items from'), 'text output has footer');
} catch (e) {
  assert(false, `text format works: ${e.message}`);
}

// --- Markdown output format ---
console.log('\n--format markdown:');
try {
  const out = run('--format markdown --hours 48');
  assert(out.startsWith('# News Digest'), 'markdown has h1 header');
  assert(out.includes('##'), 'markdown has category headers');
} catch (e) {
  assert(false, `markdown format works: ${e.message}`);
}

// --- Telegram output format ---
console.log('\n--format telegram:');
try {
  const out = run('--format telegram --hours 48');
  assert(out.includes('<b>'), 'telegram has bold tags');
  assert(out.includes('<a href='), 'telegram has links');
} catch (e) {
  assert(false, `telegram format works: ${e.message}`);
}

// --- --top N flag ---
console.log('\n--top flag:');
try {
  const out = run('--format json --top 3 --hours 48');
  const json = JSON.parse(out);
  assert(json.items.length <= 3, `--top 3 limits to ${json.items.length} items`);
} catch (e) {
  assert(false, `--top flag works: ${e.message}`);
}

// --- --dry-run flag ---
console.log('\n--dry-run:');
try {
  const out = run('--dry-run --hours 48');
  assert(out.includes('Total:'), 'dry-run shows total');
  assert(out.includes('items'), 'dry-run mentions items');
} catch (e) {
  assert(false, `dry-run works: ${e.message}`);
}

// --- Custom feeds file ---
console.log('\n--feeds flag:');
try {
  const out = run(`--feeds ${feedsPath} --format json --top 5 --hours 48`);
  const json = JSON.parse(out);
  assert(json.items.length > 0 || json.errors.length > 0, 'custom feeds file loads');
} catch (e) {
  assert(false, `custom feeds works: ${e.message}`);
}

// --- Deduplication ---
console.log('\ndeduplication:');
try {
  const out = run('--format json --hours 48');
  const json = JSON.parse(out);
  const urls = json.items.map(i => i.url).filter(u => u);
  const unique = new Set(urls);
  assert(urls.length === unique.size, `no duplicate URLs (${urls.length} items, ${unique.size} unique)`);
} catch (e) {
  assert(false, `dedup check: ${e.message}`);
}

// --- Sort order (newest first) ---
console.log('\nsort order:');
try {
  const out = run('--format json --hours 48');
  const json = JSON.parse(out);
  const dated = json.items.filter(i => i.published);
  let sorted = true;
  for (let i = 1; i < dated.length; i++) {
    if (new Date(dated[i].published) > new Date(dated[i-1].published)) {
      sorted = false;
      break;
    }
  }
  assert(sorted, 'items sorted newest-first');
} catch (e) {
  assert(false, `sort order check: ${e.message}`);
}

console.log(`\n📊 ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
