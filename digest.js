#!/usr/bin/env node
/**
 * alphabot-news-digest v0.1
 * 
 * Fetches headlines from configured RSS/Atom feeds and produces a
 * structured digest. Designed to run as a cron job or CLI tool.
 * 
 * Usage:
 *   node digest.js                    # Full digest to stdout (JSON)
 *   node digest.js --format text      # Human-readable text
 *   node digest.js --format markdown  # Markdown format
 *   node digest.js --dry-run          # Test feed fetching, no output
 *   node digest.js --hours 12         # Only items from last 12h (default: 24)
 *   node digest.js --feeds feeds.json # Custom feed list
 * 
 * Output: JSON array of { source, title, url, published, summary }
 */

const https = require('https');
const http = require('http');
const { parseString } = require('./lib/xml-parser');

// Default feeds — AI, agents, crypto/defi (Base), tech
const DEFAULT_FEEDS = [
  { name: 'Hacker News (Top)', url: 'https://hnrss.org/newest?points=100', category: 'tech' },
  { name: 'The Verge - AI', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', category: 'ai' },
  { name: 'MIT Tech Review - AI', url: 'https://www.technologyreview.com/feed/', category: 'ai' },
  { name: 'Base Blog', url: 'https://base.mirror.xyz/feed/atom', category: 'base' },
  { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', category: 'ai' },
];

// --- CLI args ---
const args = process.argv.slice(2);
function getArg(name, def) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return def;
  return args[idx + 1] || def;
}
const hasFlag = (name) => args.includes(`--${name}`);

const FORMAT = getArg('format', 'json');
const HOURS = parseInt(getArg('hours', '24'), 10);
const DRY_RUN = hasFlag('dry-run');
const FEED_FILE = getArg('feeds', null);

// --- HTTP fetch ---
function fetch(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'alphabot-digest/0.1' }, timeout: 10000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        return resolve(fetch(res.headers.location, redirects - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

// --- Parse feed items ---
function extractItems(xml, feedName, category) {
  const items = [];
  
  // RSS 2.0: <item>...</item>
  const rssItems = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  for (const raw of rssItems) {
    const title = (raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    const link = (raw.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    const pubDate = (raw.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1]?.trim();
    const desc = (raw.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim().slice(0, 300);
    
    if (title) {
      items.push({
        source: feedName,
        category,
        title: decodeEntities(title),
        url: link || '',
        published: pubDate ? new Date(pubDate).toISOString() : null,
        summary: desc ? decodeEntities(desc) : ''
      });
    }
  }
  
  // Atom: <entry>...</entry>
  if (items.length === 0) {
    const atomEntries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
    for (const raw of atomEntries) {
      const title = (raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
      const link = (raw.match(/<link[^>]*href="([^"]*)"[^>]*>/i) || [])[1];
      const updated = (raw.match(/<(?:updated|published)[^>]*>([\s\S]*?)<\/(?:updated|published)>/i) || [])[1]?.trim();
      const summary = (raw.match(/<(?:summary|content)[^>]*>([\s\S]*?)<\/(?:summary|content)>/i) || [])[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim().slice(0, 300);
      
      if (title) {
        items.push({
          source: feedName,
          category,
          title: decodeEntities(title),
          url: link || '',
          published: updated ? new Date(updated).toISOString() : null,
          summary: summary ? decodeEntities(summary) : ''
        });
      }
    }
  }
  
  return items;
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
}

// --- Main ---
async function main() {
  let feeds = DEFAULT_FEEDS;
  if (FEED_FILE) {
    const fs = require('fs');
    feeds = JSON.parse(fs.readFileSync(FEED_FILE, 'utf8'));
  }

  const cutoff = new Date(Date.now() - HOURS * 60 * 60 * 1000);
  let allItems = [];
  let errors = [];

  for (const feed of feeds) {
    try {
      const xml = await fetch(feed.url);
      const items = extractItems(xml, feed.name, feed.category || 'general');
      
      // Filter by time window
      const recent = items.filter(item => {
        if (!item.published) return true; // Keep items without dates
        return new Date(item.published) >= cutoff;
      });
      
      allItems.push(...recent);
      if (!DRY_RUN) {
        process.stderr.write(`✅ ${feed.name}: ${recent.length}/${items.length} items (last ${HOURS}h)\n`);
      } else {
        console.log(`✅ ${feed.name}: ${recent.length}/${items.length} items (last ${HOURS}h)`);
      }
    } catch (err) {
      errors.push({ feed: feed.name, error: err.message });
      if (!DRY_RUN) {
        process.stderr.write(`❌ ${feed.name}: ${err.message}\n`);
      } else {
        console.log(`❌ ${feed.name}: ${err.message}`);
      }
    }
  }

  // Sort by published date (newest first)
  allItems.sort((a, b) => {
    if (!a.published) return 1;
    if (!b.published) return -1;
    return new Date(b.published) - new Date(a.published);
  });

  // Deduplicate by URL
  const seen = new Set();
  allItems = allItems.filter(item => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  if (DRY_RUN) {
    console.log(`\n📊 Total: ${allItems.length} items, ${errors.length} errors`);
    return;
  }

  // Output
  switch (FORMAT) {
    case 'text':
      console.log(`=== News Digest (${new Date().toISOString()}) ===\n`);
      for (const item of allItems) {
        console.log(`[${item.category}] ${item.title}`);
        console.log(`  ${item.url}`);
        if (item.summary) console.log(`  ${item.summary.slice(0, 150)}`);
        console.log();
      }
      console.log(`--- ${allItems.length} items from ${feeds.length} feeds ---`);
      break;

    case 'markdown':
      console.log(`# News Digest — ${new Date().toISOString().slice(0, 10)}\n`);
      const byCategory = {};
      for (const item of allItems) {
        if (!byCategory[item.category]) byCategory[item.category] = [];
        byCategory[item.category].push(item);
      }
      for (const [cat, items] of Object.entries(byCategory)) {
        console.log(`## ${cat.charAt(0).toUpperCase() + cat.slice(1)}\n`);
        for (const item of items) {
          console.log(`- **[${item.title}](${item.url})** *(${item.source})*`);
          if (item.summary) console.log(`  ${item.summary.slice(0, 120)}...`);
        }
        console.log();
      }
      break;

    case 'json':
    default:
      console.log(JSON.stringify({ generated: new Date().toISOString(), hours: HOURS, count: allItems.length, errors, items: allItems }, null, 2));
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
