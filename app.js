// DOM Elements
const gistUrlInput = document.getElementById('gist-url');
const pasteContent = document.getElementById('paste-content');
const fileInput = document.getElementById('file-input');
const fileUpload = document.querySelector('.file-upload');
const loadGistBtn = document.getElementById('load-gist-btn');
const loadPasteBtn = document.getElementById('load-paste-btn');
const errorMessage = document.getElementById('error-message');
const controls = document.getElementById('controls');
const expandAllBtn = document.getElementById('expand-all');
const collapseAllBtn = document.getElementById('collapse-all');
const sessionContainer = document.getElementById('session-container');

// Tab elements
const tabs = document.querySelectorAll('.tab');
const gistSection = document.getElementById('gist-section');
const pasteSection = document.getElementById('paste-section');
const uploadSection = document.getElementById('upload-section');

// Tab switching
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        const target = tab.dataset.tab;

        // Update active tab
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Show/hide sections
        gistSection.classList.toggle('hidden', target !== 'gist');
        pasteSection.classList.toggle('hidden', target !== 'paste');
        uploadSection.classList.toggle('hidden', target !== 'upload');
    });
});

// Event Listeners
loadGistBtn.addEventListener('click', handleLoadGist);
gistUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLoadGist();
});

loadPasteBtn.addEventListener('click', handleLoadPaste);

fileInput.addEventListener('change', handleFileSelect);

// Drag and drop
fileUpload.addEventListener('dragover', (e) => {
    e.preventDefault();
    fileUpload.classList.add('dragover');
});

fileUpload.addEventListener('dragleave', () => {
    fileUpload.classList.remove('dragover');
});

fileUpload.addEventListener('drop', (e) => {
    e.preventDefault();
    fileUpload.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
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

    if (!files.length) {
        throw new Error('No files found in gist');
    }

    // Get the first file (or .txt file if available)
    const file = files.find(f => f.filename.endsWith('.txt')) || files[0];

    // Fetch raw content if truncated
    let content = file.content;
    if (file.truncated && file.raw_url) {
        const rawResponse = await fetch(file.raw_url);
        content = await rawResponse.text();
    }

    return content;
}

// Parse the Claude Code transcript format
function parseTranscript(text) {
    const messages = [];
    const lines = text.split('\n');

    let i = 0;

    // Skip the header box (everything until we hit the first `>` or `⏺`)
    while (i < lines.length) {
        const line = lines[i];
        if (line.startsWith('> ') || line.startsWith('⏺')) {
            break;
        }
        i++;
    }

    // Parse messages
    while (i < lines.length) {
        const line = lines[i];

        // User message starts with `> `
        if (line.startsWith('> ')) {
            const content = [];
            content.push(line.substring(2));
            i++;

            // Continue until we hit another marker
            while (i < lines.length && !lines[i].startsWith('> ') && !lines[i].startsWith('⏺')) {
                content.push(lines[i]);
                i++;
            }

            messages.push({
                type: 'human',
                content: content.join('\n').trim()
            });
        }
        // Assistant message/action starts with `⏺`
        else if (line.startsWith('⏺')) {
            const assistantContent = [];

            // Process all consecutive assistant blocks
            while (i < lines.length && (lines[i].startsWith('⏺') || lines[i].startsWith('  ⎿') || (lines[i].startsWith('  ') && !lines[i].startsWith('> ')))) {
                const currentLine = lines[i];

                // Tool call: ⏺ Bash(...), ⏺ Write(...), ⏺ Read(...), etc.
                const toolMatch = currentLine.match(/^⏺ (Bash|Write|Read|Edit|Glob|Grep|Task|WebFetch|WebSearch|TodoWrite|NotebookEdit)\((.*?)\)?$/);
                if (toolMatch) {
                    const toolName = toolMatch[1];
                    const toolArg = toolMatch[2];
                    const toolContent = [];
                    i++;

                    // Collect tool output (lines starting with `  ⎿` or indented)
                    while (i < lines.length && (lines[i].startsWith('  ⎿') || (lines[i].startsWith('    ') && !lines[i].startsWith('⏺') && !lines[i].startsWith('> ')))) {
                        const outputLine = lines[i].replace(/^  ⎿ ?/, '').replace(/^    /, '');
                        toolContent.push(outputLine);
                        i++;
                    }

                    assistantContent.push({
                        type: 'tool_use',
                        name: toolName,
                        argument: toolArg,
                        output: toolContent.join('\n').trim()
                    });
                    continue;
                }

                // Status messages (plan mode, etc.) - make collapsible
                const statusMatch = currentLine.match(/^⏺ (Entered plan mode|Updated plan|User approved|User declined)/);
                if (statusMatch) {
                    const statusContent = [currentLine.substring(2)];
                    i++;

                    // Collect any indented content
                    while (i < lines.length && (lines[i].startsWith('  ⎿') || lines[i].startsWith('  ') && !lines[i].startsWith('⏺') && !lines[i].startsWith('> '))) {
                        statusContent.push(lines[i].replace(/^  ⎿ ?/, '').replace(/^  /, ''));
                        i++;
                    }

                    assistantContent.push({
                        type: 'status',
                        content: statusContent.join('\n').trim()
                    });
                    continue;
                }

                // Regular assistant text
                if (currentLine.startsWith('⏺ ')) {
                    const textContent = [currentLine.substring(2)];
                    i++;

                    // Continue collecting text until we hit a tool call, status, or new message
                    while (i < lines.length &&
                           !lines[i].startsWith('> ') &&
                           !lines[i].match(/^⏺ (Bash|Write|Read|Edit|Glob|Grep|Task|WebFetch|WebSearch|TodoWrite|NotebookEdit)\(/) &&
                           !lines[i].match(/^⏺ (Entered plan mode|Updated plan|User approved|User declined)/) &&
                           !lines[i].startsWith('⏺ ')) {

                        if (lines[i].startsWith('  ⎿') || lines[i].startsWith('    ')) {
                            textContent.push(lines[i].replace(/^  ⎿ ?/, '').replace(/^    /, ''));
                        } else if (lines[i].trim() === '') {
                            textContent.push('');
                        } else {
                            break;
                        }
                        i++;
                    }

                    assistantContent.push({
                        type: 'text',
                        content: textContent.join('\n').trim()
                    });
                    continue;
                }

                // Skip other lines
                i++;
            }

            if (assistantContent.length > 0) {
                messages.push({
                    type: 'assistant',
                    content: assistantContent
                });
            }
        }
        else {
            i++;
        }
    }

    return messages;
}

// Handle gist URL load
async function handleLoadGist() {
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
    setLoading(loadGistBtn, true);

    try {
        const content = await fetchGist(gistId);
        loadContent(content);
    } catch (err) {
        showError(err.message);
        sessionContainer.innerHTML = '';
        controls.classList.add('hidden');
    } finally {
        setLoading(loadGistBtn, false);
    }
}

// Handle paste load
function handleLoadPaste() {
    const content = pasteContent.value.trim();
    if (!content) {
        showError('Please paste your session transcript');
        return;
    }

    hideError();
    loadContent(content);
}

// Handle file selection
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) loadFile(file);
}

// Load file
function loadFile(file) {
    hideError();
    const reader = new FileReader();

    reader.onload = (e) => {
        loadContent(e.target.result);
    };

    reader.onerror = () => {
        showError('Failed to read file');
    };

    reader.readAsText(file);
}

// Load and render content
function loadContent(content) {
    try {
        const messages = parseTranscript(content);
        renderSession(messages);
        controls.classList.remove('hidden');
    } catch (err) {
        showError('Failed to parse transcript: ' + err.message);
        sessionContainer.innerHTML = '';
        controls.classList.add('hidden');
    }
}

// Render the full session
function renderSession(messages) {
    sessionContainer.innerHTML = '';

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
    header.textContent = msg.type === 'human' ? 'User' : 'Assistant';
    div.appendChild(header);

    const content = document.createElement('div');
    content.className = 'message-content';

    if (msg.type === 'human') {
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

// Render a content block
function renderContentBlock(block) {
    switch (block.type) {
        case 'text':
            return renderTextContent(block.content);

        case 'tool_use':
            return renderToolUse(block);

        case 'status':
            return renderCollapsible('Status', block.content, 'status');

        default:
            return null;
    }
}

// Render text content with basic markdown support
function renderTextContent(text) {
    const div = document.createElement('div');
    div.className = 'text-block';
    div.innerHTML = processMarkdown(text);
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
    const title = `${block.name}(${block.argument || ''})`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'tool-info';

    if (block.output) {
        // Truncate very long outputs
        const displayOutput = block.output.length > 3000
            ? block.output.substring(0, 3000) + '\n... (truncated)'
            : block.output;

        contentDiv.innerHTML = `<pre>${escapeHtml(displayOutput)}</pre>`;
    }

    return renderCollapsible(title, contentDiv, 'tool-use');
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

function setLoading(btn, loading) {
    btn.disabled = loading;
    btn.textContent = loading ? 'Loading...' : 'Load';

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
        handleLoadGist();
    }
}

// Initialize
checkUrlParams();
