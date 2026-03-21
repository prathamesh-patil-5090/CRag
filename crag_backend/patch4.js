const fs = require('fs');
const path = 'src/chat/chat.service.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  "const confidence = searchResults[0]?.score.toFixed(2) || 0;",
  "const confidence = searchResults.length > 0 ? Number((searchResults.reduce((acc, curr) => acc + (curr.score || 0), 0) / searchResults.length).toFixed(2)) : 0;"
);

code = code.replace(
  "const confidence = searchResults[0]?.score || 0;",
  "const confidence = searchResults.length > 0 ? Number((searchResults.reduce((acc, curr) => acc + (curr.score || 0), 0) / searchResults.length).toFixed(2)) : 0;"
);

fs.writeFileSync(path, code);
console.log('Patched confidence successfully');
