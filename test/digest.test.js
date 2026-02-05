#!/usr/bin/env node
/**
 * alphabot-news-digest tests
 * Tests feed parsing, dedup, output formats, and CLI flags.
 * Uses a single fast feed (HN 200+ points) for all tests to avoid timeouts.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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

const DIGEST = path.join(__dirname, '..', 'digest.js');
const CACHE_FILE = path.join(__dirname, 'test-cache.json');
const TIMEOUT = { timeout: 30000 };

// Use a single fast feed for ALL tests to avoid slow default feeds
const FAST_FEED_FILE = path.join(__dirname, 'fast-feed.json');
const FAST_FEED = [{ name: 'HN Only', url: 'https://hnrss.org/newest?points=200', category: 'tech' }];
fs.writeFileSync(FAST_FEED_FILE, JSON.stringify(FAST_FEED));

// Cleanup
try { fs.unlinkSync(CACHE_FILE); } catch {}

console.log('alphabot-news-digest tests\n');

// Test 1: JSON output
console.log('JSON format:');
try {
  const out = execSync(`node ${DIGEST} --format json --top 3 --feeds ${FAST_FEED_FILE} 2>/dev/null`, TIMEOUT).toString();
  const data = JSON.parse(out);
  assert(data.generated, 'has generated timestamp');
  assert(typeof data.count === 'number', 'has count');
  assert(Array.isArray(data.items), 'items is array');
  assert(data.items.length <= 3, `top 3 limit respected (got ${data.items.length})`);
} catch (e) {
  assert(false, `JSON parse failed: ${e.message}`);
}

// Test 2: Text output
console.log('\nText format:');
try {
  const out = execSync(`node ${DIGEST} --format text --top 2 --feeds ${FAST_FEED_FILE} 2>/dev/null`, TIMEOUT).toString();
  assert(out.includes('News Digest'), 'contains header');
  assert(out.includes('items from'), 'contains footer');
} catch (e) {
  assert(false, `text format failed: ${e.message}`);
}

// Test 3: Markdown output
console.log('\nMarkdown format:');
try {
  const out = execSync(`node ${DIGEST} --format markdown --top 2 --feeds ${FAST_FEED_FILE} 2>/dev/null`, TIMEOUT).toString();
  assert(out.includes('# News Digest'), 'has markdown header');
} catch (e) {
  assert(false, `markdown format failed: ${e.message}`);
}

// Test 4: Telegram output
console.log('\nTelegram format:');
try {
  const out = execSync(`node ${DIGEST} --format telegram --top 2 --feeds ${FAST_FEED_FILE} 2>/dev/null`, TIMEOUT).toString();
  assert(out.includes('<b>'), 'has HTML bold tags');
  assert(out.includes('<a href='), 'has HTML links');
} catch (e) {
  assert(false, `telegram format failed: ${e.message}`);
}

// Test 5: Output to file
console.log('\nOutput to file:');
const outFile = path.join(__dirname, 'test-output.json');
try {
  execSync(`node ${DIGEST} --format json --top 1 --output ${outFile} --feeds ${FAST_FEED_FILE} 2>/dev/null`, TIMEOUT);
  assert(fs.existsSync(outFile), 'output file created');
  const data = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert(data.items, 'output file contains valid JSON');
  fs.unlinkSync(outFile);
} catch (e) {
  assert(false, `output file failed: ${e.message}`);
}

// Test 6: Dedup cache
console.log('\nDedup cache:');
try {
  // First run: creates cache
  execSync(`node ${DIGEST} --format json --top 5 --feeds ${FAST_FEED_FILE} --dedup ${CACHE_FILE} 2>/dev/null`, TIMEOUT);
  assert(fs.existsSync(CACHE_FILE), 'cache file created');
  const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  assert(cache.urls && cache.urls.length > 0, `cache has ${cache.urls.length} URLs`);
  assert(cache.updated, 'cache has timestamp');
  
  // Second run: should filter out seen items
  const out2 = execSync(`node ${DIGEST} --format json --top 50 --feeds ${FAST_FEED_FILE} --dedup ${CACHE_FILE} 2>/dev/null`, TIMEOUT).toString();
  const data2 = JSON.parse(out2);
  assert(data2.count === 0, `dedup filters all seen items (got ${data2.count})`);
  
  fs.unlinkSync(CACHE_FILE);
} catch (e) {
  assert(false, `dedup cache failed: ${e.message}`);
}

// Test 7: Custom feeds
console.log('\nCustom feeds:');
try {
  const out = execSync(`node ${DIGEST} --format json --feeds ${FAST_FEED_FILE} 2>/dev/null`, TIMEOUT).toString();
  const data = JSON.parse(out);
  assert(data.items.every(i => i.source === 'HN Only'), 'only custom feed items');
} catch (e) {
  assert(false, `custom feeds failed: ${e.message}`);
}

// Test 8: --hours flag
console.log('\nHours filter:');
try {
  const out = execSync(`node ${DIGEST} --format json --hours 1 --feeds ${FAST_FEED_FILE} 2>/dev/null`, TIMEOUT).toString();
  const data = JSON.parse(out);
  assert(data.hours === 1, 'hours=1 reflected in output');
} catch (e) {
  assert(false, `hours filter failed: ${e.message}`);
}

// Test 9: Dry run
console.log('\nDry run:');
try {
  const out = execSync(`node ${DIGEST} --dry-run --feeds ${FAST_FEED_FILE} 2>&1`, TIMEOUT).toString();
  assert(out.includes('Total:'), 'dry run shows summary');
} catch (e) {
  assert(false, `dry run failed: ${e.message}`);
}

// Cleanup
try { fs.unlinkSync(FAST_FEED_FILE); } catch {}

console.log(`\n📊 ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
