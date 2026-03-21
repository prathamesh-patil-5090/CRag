const fs = require('fs');

const path = 'src/chat/chat.service.ts';
let code = fs.readFileSync(path, 'utf8');

const target = `    const uniqueDocs = new Map<
      string,
      { documentName: string; snippet: string }
    >();
    for (const chunk of searchResults as Array<{
      documentId: string;
      documentName?: string;
      text?: string;
    }>) {
      if (!uniqueDocs.has(chunk.documentId)) {
        uniqueDocs.set(chunk.documentId, {
          documentName: chunk.documentName || 'Unknown Document',
          snippet:
            (chunk.text || '').length > 160
              ? \`\${(chunk.text || '').slice(0, 160)}...\`
              : chunk.text || '',
        });
      }
    }`;

const replacement = `    const uniqueDocs = new Map<
      string,
      { documentName: string; snippet: string; highlight: string }
    >();

    const queryWords = new Set(
      question.toLowerCase().split(/\W+/).filter((w) => w.length > 3)
    );

    for (const chunk of searchResults as Array<{
      documentId: string;
      documentName?: string;
      text?: string;
    }>) {
      if (!uniqueDocs.has(chunk.documentId)) {
        const fullText = chunk.text || '';
        const sentences = fullText.match(/[^.!?]+[.!?]+/g) || [fullText];
        
        let bestSentence = sentences[0] || '';
        let maxMatches = -1;
        
        for (const sentence of sentences) {
          const words = sentence.toLowerCase().split(/\W+/);
          const matches = words.filter((w) => queryWords.has(w)).length;
          if (matches > maxMatches) {
            maxMatches = matches;
            bestSentence = sentence;
          }
        }

        const highlight = bestSentence.trim();
        const snippetText = fullText.length > 160 ? \`\${fullText.slice(0, 160)}...\` : fullText;

        uniqueDocs.set(chunk.documentId, {
          documentName: chunk.documentName || 'Unknown Document',
          snippet: snippetText,
          highlight: highlight.length > 150 ? \`\${highlight.slice(0, 150)}...\` : highlight,
        });
      }
    }`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync(path, code);
  console.log('Patched successfully');
} else {
  console.log('Target not found');
}
