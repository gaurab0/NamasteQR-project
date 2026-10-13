const fs = require('fs');
let code = fs.readFileSync('src/pages/CustomerMenuPreviewPage.tsx', 'utf8');

code = code.replace(
  `const effectiveStyle = 'cards';`,
  `let effectiveStyle: 'hero' | 'bento' | 'text_only' | 'cards' = 'cards';`
);

fs.writeFileSync('src/pages/CustomerMenuPreviewPage.tsx', code);
console.log('Fixed TypeScript strict type errors');
