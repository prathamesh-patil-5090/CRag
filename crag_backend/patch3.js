const fs = require('fs');
const path = 'src/chat/chat.service.ts';
let code = fs.readFileSync(path, 'utf8');

// 1. Prompt Update
code = code.replace(
  "content: `You are a helpful assistant. Be concise in your responses if possible. Use the following context to answer the user's question.",
  "content: `You are a helpful assistant. Be concise in your responses if possible. Return ONLY one final answer. Do not repeat or restate the answer. Use the following context to answer the user's question."
);

// 2. Dynamic Confidence Update
code = code.replace(
  "const confidence = searchResults[0]?.score || 0;",
  "const confidence = searchResults.length > 0 ? searchResults.reduce((acc, curr) => acc + (curr.score || 0), 0) / searchResults.length : 0;"
);

// 3. Snippet Cleanup (Output Snippet)
code = code.replace(
  "const snippetText = fullText.length > 160 ? `${fullText.slice(0, 160)}...` : fullText;",
  "const cleanedText = fullText.replace(/\n+/g, ' ');\n        const snippetText = cleanedText.length > 200 ? `${cleanedText.slice(0, 200)}...` : cleanedText;"
);

// 3b. Snippet Cleanup (Context sent to LLM)
code = code.replace(
  "const context = searchResults\n      .map((row: any) => row.text)\n      .join('\n\n---\n\n');",
  "const context = searchResults\n      .map((row: any) => (row.text || '').replace(/\n+/g, ' '))\n      .join('\n\n---\n\n');"
);

fs.writeFileSync(path, code);
console.log('Patched successfully');
