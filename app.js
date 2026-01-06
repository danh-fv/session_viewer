// DOM Elements
const gistUrlInput = document.getElementById('gist-url');
const loadBtn = document.getElementById('load-btn');
const errorMessage = document.getElementById('error-message');
const controls = document.getElementById('controls');
const expandAllBtn = document.getElementById('expand-all');
const collapseAllBtn = document.getElementById('collapse-all');
const sessionContainer = document.getElementById('session-container');

// Event Listeners
loadBtn.addEventListener('click', handleLoad);
gistUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLoad();
});
expandAllBtn.addEventListener('click', () => toggleAllCollapsibles(true));
collapseAllBtn.addEventListener('click', () => toggleAllCollapsibles(false));

// Extract gist ID from various URL formats
function extractGistId(url) {
    const patterns = [
        /gist\.github\.com\/[\w-]+\/([a-f0-9]+)/i,
        /gist\.github\.com\/([a-f0-9]+)/i,
        /^([a-f0-9]+)$/i
    ];

    for (const pattern of patterns) {
        const match = url.trim().match(pattern);
        if (match) return match[1];
    }
    return null;
}

// Fetch gist content
async function fetchGist(gistId) {
    const response = await fetch(`https://api.github.com/gists/${gistId}`);
    if (!response.ok) {
        throw new Error(`Failed to fetch gist: ${response.status} ${response.statusText}`);
    }

    const gist = await response.json();
    const files = Object.values(gist.files);

    // Find the JSON file
    const jsonFile = files.find(f => f.filename.endsWith('.json')) || files[0];
    if (!jsonFile) {
        throw new Error('No files found in gist');
    }

    // Fetch raw content if truncated
    let content = jsonFile.content;
    if (jsonFile.truncated && jsonFile.raw_url) {
        const rawResponse = await fetch(jsonFile.raw_url);
        content = await rawResponse.text();
    }

    return JSON.parse(content);
}

// Main load handler
async function handleLoad() {
    const url = gistUrlInput.value.trim();
    if (!url) {
        showError('Please enter a gist URL');
        return;
    }

    const gistId = extractGistId(url);
    if (!gistId) {
        showError('Invalid gist URL format');
        return;
    }

    hideError();
    setLoading(true);

    try {
        const session = await fetchGist(gistId);
        renderSession(session);
        controls.classList.remove('hidden');
    } catch (err) {
        showError(err.message);
        sessionContainer.innerHTML = '';
        controls.classList.add('hidden');
    } finally {
        setLoading(false);
    }
}

// Render the full session
function renderSession(session) {
    sessionContainer.innerHTML = '';

    const messages = session.messages || [];
    if (messages.length === 0) {
        sessionContainer.innerHTML = '<p class="loading">No messages found in session</p>';
        return;
    }

    messages.forEach((msg, index) => {
        const messageEl = renderMessage(msg, index);
        if (messageEl) {
            sessionContainer.appendChild(messageEl);
        }
    });
}

// Render a single message
function renderMessage(msg, index) {
    const div = document.createElement('div');
    div.className = `message ${msg.type}`;

    const header = document.createElement('div');
    header.className = 'message-header';
    header.textContent = getMessageLabel(msg.type);
    div.appendChild(header);

    const content = document.createElement('div');
    content.className = 'message-content';

    if (typeof msg.content === 'string') {
        content.appendChild(renderTextContent(msg.content));
    } else if (Array.isArray(msg.content)) {
        msg.content.forEach(block => {
            const blockEl = renderContentBlock(block);
            if (blockEl) content.appendChild(blockEl);
        });
    }

    div.appendChild(content);
    return div;
}

// Get display label for message type
function getMessageLabel(type) {
    const labels = {
        human: 'User',
        assistant: 'Assistant',
        tool_result: 'Tool Result'
    };
    return labels[type] || type;
}

// Render a content block
function renderContentBlock(block) {
    switch (block.type) {
        case 'text':
            return renderTextContent(block.text);

        case 'thinking':
            return renderCollapsible('Thinking...', block.thinking, 'thinking');

        case 'tool_use':
            return renderToolUse(block);

        case 'tool_result':
            return renderToolResult(block);

        default:
            // Handle unknown types gracefully
            if (block.text) {
                return renderTextContent(block.text);
            }
            return null;
    }
}

// Render text content with basic markdown support
function renderTextContent(text) {
    const div = document.createElement('div');
    div.className = 'text-block';

    // Process markdown-style code blocks
    const processed = processMarkdown(text);
    div.innerHTML = processed;

    return div;
}

// Basic markdown processing
function processMarkdown(text) {
    // Escape HTML
    let html = escapeHtml(text);

    // Code blocks (```lang\ncode\n```)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre class="code-block">${code.trim()}</pre>`;
    });

    // Inline code (`code`)
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Bold (**text**)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic (*text*)
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Line breaks
    html = html.replace(/\n/g, '<br>');

    return html;
}

// Escape HTML entities
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Render a collapsible section
function renderCollapsible(title, content, type = '') {
    const div = document.createElement('div');
    div.className = `collapsible ${type}`;

    const header = document.createElement('div');
    header.className = 'collapsible-header';
    header.innerHTML = `
        <span class="collapsible-icon">&#9654;</span>
        <span class="collapsible-title">${escapeHtml(title)}</span>
    `;
    header.addEventListener('click', () => {
        div.classList.toggle('expanded');
    });

    const contentDiv = document.createElement('div');
    contentDiv.className = 'collapsible-content';

    if (typeof content === 'string') {
        contentDiv.innerHTML = `<pre>${escapeHtml(content)}</pre>`;
    } else {
        contentDiv.appendChild(content);
    }

    div.appendChild(header);
    div.appendChild(contentDiv);

    return div;
}

// Render tool use block
function renderToolUse(block) {
    const title = `Tool: ${block.name}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'tool-info';

    if (block.input) {
        const inputStr = typeof block.input === 'string'
            ? block.input
            : JSON.stringify(block.input, null, 2);

        // Truncate very long inputs
        const displayInput = inputStr.length > 2000
            ? inputStr.substring(0, 2000) + '\n... (truncated)'
            : inputStr;

        contentDiv.innerHTML = `
            <strong>Input:</strong>
            <pre>${escapeHtml(displayInput)}</pre>
        `;
    }

    return renderCollapsible(title, contentDiv, 'tool-use');
}

// Render tool result block
function renderToolResult(block) {
    let content = block.content;
    if (typeof content !== 'string') {
        content = JSON.stringify(content, null, 2);
    }

    // Truncate very long results
    const displayContent = content.length > 3000
        ? content.substring(0, 3000) + '\n... (truncated)'
        : content;

    return renderCollapsible('Tool Output', displayContent, 'tool-use');
}

// Toggle all collapsibles
function toggleAllCollapsibles(expand) {
    const collapsibles = document.querySelectorAll('.collapsible');
    collapsibles.forEach(c => {
        if (expand) {
            c.classList.add('expanded');
        } else {
            c.classList.remove('expanded');
        }
    });
}

// UI helpers
function showError(msg) {
    errorMessage.textContent = msg;
    errorMessage.classList.remove('hidden');
}

function hideError() {
    errorMessage.classList.add('hidden');
}

function setLoading(loading) {
    loadBtn.disabled = loading;
    loadBtn.textContent = loading ? 'Loading...' : 'Load';

    if (loading) {
        sessionContainer.innerHTML = '<div class="loading">Loading session</div>';
    }
}

// Check for gist ID in URL params on load
function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const gistParam = params.get('gist');
    if (gistParam) {
        gistUrlInput.value = gistParam;
        handleLoad();
    }
}

// Initialize
checkUrlParams();
