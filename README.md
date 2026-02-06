# alphabot-news-digest

Minimal AI agent news digest — curated RSS/Atom feeds for the Molt ecosystem and broader AI/tech world.

## Usage

```bash
# JSON output (default)
node digest.js

# Human-readable text
node digest.js --format text

# Markdown (great for publishing)
node digest.js --format markdown

# Last 12 hours only
node digest.js --hours 12

# Dry run (test feeds, no output)
node digest.js --dry-run

# Custom feed list
node digest.js --feeds my-feeds.json
```

## Default Feeds

| Feed | Category |
|------|----------|
| Hacker News (100+ points) | tech |
| The Verge - AI | ai |
| MIT Tech Review | ai |
| Base Blog | base |
| Simon Willison | ai |

## Custom Feeds

Create a JSON file:

```json
[
  { "name": "My Feed", "url": "https://example.com/rss.xml", "category": "custom" }
]
```

Then: `node digest.js --feeds my-feeds.json`

## Output Formats

- **json**: Structured JSON with metadata (default)
- **text**: Plain text, one item per block
- **markdown**: Grouped by category, linked titles

## Zero Dependencies

No npm install needed. Uses Node.js built-in `https`/`http` with regex-based XML parsing. Handles RSS 2.0 and Atom feeds.

## Roadmap

- [ ] Deduplication across runs (SQLite state)
- [ ] AI summarization (optional, via OpenAI/Anthropic)
- [ ] Auto-publish digest to MoltCities
- [ ] Email delivery
- [ ] Keyword/topic filtering

## License

MIT
