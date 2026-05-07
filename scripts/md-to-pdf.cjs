const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

function markdownToHtml(md) {
  let html = md;

  // Escape HTML special chars in code blocks first
  html = html.replace(/```[\s\S]*?```/g, match => {
    const inner = match.slice(3, match.length - 3).replace(/^[^\n]*\n/, '');
    return `<pre><code>${inner.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`;
  });

  // Tables
  html = html.replace(/\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)+)/g, (match, header, rows) => {
    const headers = header.split('|').filter(h => h.trim()).map(h => `<th>${h.trim()}</th>`).join('');
    const rowHtml = rows.trim().split('\n').map(row => {
      const cells = row.split('|').filter(c => c.trim() !== '').map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('\n');
    return `<table>\n<thead><tr>${headers}</tr></thead>\n<tbody>${rowHtml}</tbody>\n</table>\n`;
  });

  // Headings
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // HR
  html = html.replace(/^---$/gm, '<hr>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists
  html = html.replace(/((?:^[ \t]*[-*+] .+\n?)+)/gm, match => {
    const items = match.trim().split('\n').map(line => {
      const content = line.replace(/^[ \t]*[-*+] /, '');
      return `<li>${content}</li>`;
    }).join('\n');
    return `<ul>\n${items}\n</ul>\n`;
  });

  // Ordered lists
  html = html.replace(/((?:^\d+\. .+\n?)+)/gm, match => {
    const items = match.trim().split('\n').map(line => {
      const content = line.replace(/^\d+\. /, '');
      return `<li>${content}</li>`;
    }).join('\n');
    return `<ol>\n${items}\n</ol>\n`;
  });

  // Paragraphs — wrap lines that are not already tags
  html = html.split('\n\n').map(block => {
    block = block.trim();
    if (!block) return '';
    if (block.startsWith('<h') || block.startsWith('<ul') || block.startsWith('<ol') ||
        block.startsWith('<table') || block.startsWith('<pre') || block.startsWith('<hr') ||
        block.startsWith('<blockquote')) {
      return block;
    }
    return `<p>${block.replace(/\n/g, ' ')}</p>`;
  }).join('\n\n');

  return html;
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  
  * { box-sizing: border-box; margin: 0; padding: 0; }
  
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 11pt;
    line-height: 1.7;
    color: #1a1a2e;
    background: #fff;
    padding: 0;
    margin: 0;
  }

  .page {
    padding: 2cm 2.2cm 2cm 2.2cm;
    max-width: 100%;
  }

  h1 {
    font-size: 22pt;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 0.5em;
    margin-top: 1em;
    border-bottom: 3px solid #3b82f6;
    padding-bottom: 0.3em;
  }

  h1:first-child { margin-top: 0; }

  h2 {
    font-size: 15pt;
    font-weight: 600;
    color: #1e40af;
    margin-top: 1.5em;
    margin-bottom: 0.4em;
    border-left: 4px solid #3b82f6;
    padding-left: 0.5em;
  }

  h3 {
    font-size: 12pt;
    font-weight: 600;
    color: #1e3a5f;
    margin-top: 1.2em;
    margin-bottom: 0.3em;
  }

  h4 { font-size: 11pt; font-weight: 600; color: #374151; margin-top: 1em; margin-bottom: 0.2em; }
  h5, h6 { font-size: 10.5pt; font-weight: 600; color: #4b5563; margin-top: 0.8em; margin-bottom: 0.2em; }

  p {
    margin-bottom: 0.8em;
    color: #374151;
  }

  ul, ol {
    margin: 0.5em 0 0.8em 1.5em;
    color: #374151;
  }

  li {
    margin-bottom: 0.3em;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1em 0;
    font-size: 10pt;
  }

  th {
    background: #1e40af;
    color: #fff;
    font-weight: 600;
    padding: 8px 12px;
    text-align: left;
    border: 1px solid #1e3a8a;
  }

  td {
    padding: 7px 12px;
    border: 1px solid #e2e8f0;
    color: #374151;
    vertical-align: top;
  }

  tr:nth-child(even) td {
    background: #f8fafc;
  }

  tr:hover td {
    background: #eff6ff;
  }

  code {
    font-family: 'Courier New', Courier, monospace;
    font-size: 9.5pt;
    background: #f1f5f9;
    border: 1px solid #e2e8f0;
    padding: 1px 5px;
    border-radius: 3px;
    color: #0f172a;
  }

  pre {
    background: #0f172a;
    color: #e2e8f0;
    padding: 14px 18px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 1em 0;
    font-size: 9.5pt;
  }

  pre code {
    background: none;
    border: none;
    padding: 0;
    color: inherit;
  }

  blockquote {
    border-left: 4px solid #f59e0b;
    background: #fffbeb;
    padding: 10px 16px;
    margin: 1em 0;
    color: #78350f;
    font-style: italic;
    border-radius: 0 4px 4px 0;
  }

  hr {
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 1.5em 0;
  }

  strong { font-weight: 600; color: #0f172a; }
  em { color: #374151; }

  .header-bar {
    background: linear-gradient(135deg, #0a0e1a 0%, #1e3a8a 100%);
    padding: 20px 2.2cm;
    color: #fff;
    margin-bottom: 0;
  }

  .header-bar .doc-type {
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: #93c5fd;
    font-weight: 500;
    margin-bottom: 6px;
  }

  .header-bar h1 {
    color: #fff;
    border: none;
    padding: 0;
    margin: 0;
    font-size: 20pt;
  }

  .header-bar .meta {
    font-size: 9pt;
    color: #93c5fd;
    margin-top: 8px;
  }

  .footer {
    margin-top: 2em;
    padding-top: 1em;
    border-top: 1px solid #e2e8f0;
    font-size: 8.5pt;
    color: #9ca3af;
    display: flex;
    justify-content: space-between;
  }

  @media print {
    body { margin: 0; }
    .page { padding: 0; }
  }

  @page {
    margin: 0;
  }
`;

async function convertMdToPdf(inputPath, outputPath, docTitle) {
  const md = fs.readFileSync(inputPath, 'utf-8');
  const bodyHtml = markdownToHtml(md);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${docTitle}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="header-bar">
    <div class="doc-type">GalaxyBots Holdings — Strategy Document</div>
    <h1>${docTitle}</h1>
    <div class="meta">Confidential &nbsp;|&nbsp; March 2026 &nbsp;|&nbsp; GalaxyBots.ai</div>
  </div>
  <div class="page">
    ${bodyHtml}
    <div class="footer">
      <span>GalaxyBots Holdings &copy; 2026</span>
      <span>Confidential — For Authorized Recipients Only</span>
    </div>
  </div>
</body>
</html>`;

  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH || puppeteer.executablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' }
  });

  await browser.close();
  console.log(`  Created: ${path.basename(outputPath)}`);
}

const docs = [
  {
    input: '.local/tasks/five-year-business-plan.md',
    output: 'exports/GalaxyBots-5-Year-Business-Plan.pdf',
    title: '5-Year Strategic Business Plan 2026–2030'
  },
  {
    input: '.local/tasks/auth-tenant-security-foundation.md',
    output: 'exports/Auth-Tenant-Security-Foundation.pdf',
    title: 'Auth, Tenant Isolation & API Security Foundation'
  },
  {
    input: '.local/tasks/proof-of-value-engine.md',
    output: 'exports/Proof-of-Value-Engine.pdf',
    title: 'Proof-of-Value Engine & Client ROI Dashboard'
  },
  {
    input: '.local/tasks/bingolingo-full-platform.md',
    output: 'exports/BingoLingo-Full-Platform.pdf',
    title: 'BingoLingo.ai — Full Content Intelligence Platform'
  },
  {
    input: '.local/tasks/developer-api-portal.md',
    output: 'exports/Developer-API-Portal.pdf',
    title: 'Public Developer API Portal & Ecosystem'
  },
  {
    input: '.local/tasks/ai-proposal-studio.md',
    output: 'exports/AI-Proposal-Studio.pdf',
    title: 'AI Proposal & Pitch Studio'
  },
  {
    input: '.local/tasks/client-health-intelligence.md',
    output: 'exports/Client-Health-Intelligence.pdf',
    title: 'Client Health Intelligence & Retention Engine'
  },
  {
    input: '.local/tasks/ai-voice-intelligence.md',
    output: 'exports/AI-Voice-Intelligence.pdf',
    title: 'AI Voice Intelligence — Calls, Transcription & Follow-Up'
  }
];

(async () => {
  console.log('Converting strategy documents to PDF...\n');
  for (const doc of docs) {
    await convertMdToPdf(doc.input, doc.output, doc.title);
  }
  console.log('\nAll PDFs generated successfully.');
})();
