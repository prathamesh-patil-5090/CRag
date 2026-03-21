const fs = require('fs');
const path = 'src/chat/chat.service.ts';
let code = fs.readFileSync(path, 'utf8');

// Fix the regex error
code = code.replace(
  "fullText.replace(/\n+/g, ' ');",
  "fullText.replace(/\\n+/g, ' ');"
);

code = code.replace(
  "row.text || '').replace(/\n+/g, ' ')",
  "row.text || '').replace(/\\n+/g, ' ')"
);

fs.writeFileSync(path, code);
