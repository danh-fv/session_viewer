# Claude Code Session Viewer

A simple web tool to view Claude Code session exports in a readable format. Thinking blocks and tool calls are collapsed by default, making it easy to follow the conversation flow.

## Usage

1. Export your Claude Code session: `/export session.txt`
2. Load the session using one of three methods:
   - **Gist URL** - Upload to [GitHub Gist](https://gist.github.com) and paste the URL
   - **Paste** - Copy/paste the transcript directly
   - **Upload** - Drag & drop or select the exported file

You can also link directly to a gist by adding `?gist=GIST_ID` to the URL.

## Features

- **Multiple input methods** - Load via Gist URL, paste, or file upload
- **Readable format** - Human and assistant messages clearly distinguished
- **Collapsible sections** - Tool calls and status messages hidden by default
- **Expand/Collapse All** - Quick toggle for all collapsible sections
- **Direct linking** - Share sessions via URL parameters
- **No backend** - Runs entirely in the browser

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
