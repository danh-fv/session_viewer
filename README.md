# Claude Code Session Viewer

A simple web tool to view Claude Code session exports in a readable format. Thinking blocks and tool calls are collapsed by default, making it easy to follow the conversation flow.

## Usage

1. Export your Claude Code session: `/export session.txt`
2. Create a [GitHub Gist](https://gist.github.com) with the exported file
3. Paste the gist URL into the viewer and click Load

You can also link directly to a session by adding `?gist=GIST_ID` to the URL.

## Features

- **Readable format** - Human and assistant messages clearly distinguished
- **Collapsible sections** - Thinking and tool calls hidden by default
- **Expand/Collapse All** - Quick toggle for all collapsible sections
- **Direct linking** - Share sessions via URL parameters
- **No backend** - Runs entirely in the browser using GitHub's API

## Local Development

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000

## Deployment

This is a static site with no build step. Deploy to any static host:

- **GitHub Pages** - Push to a repo and enable Pages in settings
- **Netlify/Vercel** - Connect your repo for automatic deploys
- **Any web server** - Just serve the 3 files

## License

MIT
