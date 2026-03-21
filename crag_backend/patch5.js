const fs = require('fs');
const path = 'src/chat/chat.service.ts';
let code = fs.readFileSync(path, 'utf8');

// Fix prompt
code = code.replace(
  "content: `You are a helpful assistant. Be concise in your responses if possible. Use the following context to answer the user's question.",
  "content: `You are a helpful assistant. Be concise in your responses if possible. Return ONLY one final answer. Do not repeat or restate the answer. Use the following context to answer the user's question."
);

// Fix Snippet
const snippetTarget = `        const snippetText =
          fullText.length > 160 ? \`\${fullText.slice(0, 160)}...\` : fullText;`;
const snippetTarget2 = `        const snippetText = fullText.length > 160 ? \`\${fullText.slice(0, 160)}...\` : fullText;`;

const snippetReplacement = `        const cleanedText = fullText.replace(/\n+/g, ' ');
        const snippetText = cleanedText.length > 200 ? \`\${cleanedText.slice(0, 200)}...\` : cleanedText;`;

if(code.includes(snippetTarget)) { code = code.replace(snippetTarget, snippetReplacement); }
if(code.includes(snippetTarget2)) { code = code.replace(snippetTarget2, snippetReplacement); }

// Fix context
const contextTarget = `    const context = searchResults
      .map((row: any) => row.text)
      .join('\n\n---\n\n');`;

const contextReplacement = `    const context = searchResults
      .map((row: any) => (row.text || '').replace(/\n+/g, ' '))
      .join('\n\n---\n\n');`;

if(code.includes(contextTarget)) { code = code.replace(contextTarget, contextReplacement); }

fs.writeFileSync(path, code);
console.log('Patched snippet successfully');
