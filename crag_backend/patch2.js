const fs = require('fs');

const path = 'src/chat/chat.service.ts';
let code = fs.readFileSync(path, 'utf8');

const target1 = `    const sources = Array.from(uniqueDocs.values());`;

const replacement1 = `    const sources = Array.from(uniqueDocs.values());
    const confidence = searchResults[0]?.score || 0;`;

if (code.includes(target1)) {
  code = code.replace(target1, replacement1);
} else {
  console.log('Target1 not found');
}

const target2 = `      return {
        answer: completion.choices[0].message.content,
        sources: sources,
      };`;

const replacement2 = `      return {
        answer: completion.choices[0].message.content,
        confidence,
        sources: sources,
      };`;

if (code.includes(target2)) {
  code = code.replace(target2, replacement2);
} else {
  console.log('Target2 not found');
}

const target3 = `        return {
          answer: fallback.choices[0].message.content,
          sources: sources,
          modelUsed: 'meta-llama/llama-3.2-3b-instruct:free',
        };`;

const replacement3 = `        return {
          answer: fallback.choices[0].message.content,
          confidence,
          sources: sources,
          modelUsed: 'meta-llama/llama-3.2-3b-instruct:free',
        };`;

if (code.includes(target3)) {
  code = code.replace(target3, replacement3);
} else {
  console.log('Target3 not found');
}

fs.writeFileSync(path, code);
console.log('Patched successfully');
