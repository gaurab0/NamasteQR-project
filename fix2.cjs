const fs = require('fs');
let code = fs.readFileSync('src/pages/CustomerMenuPreviewPage.tsx', 'utf8');

code = code.replace(
  `let effectiveStyle: 'hero' | 'bento' | 'text_only' | 'cards' = 'cards';`,
  `let effectiveStyle: string = 'cards';`
);

fs.writeFileSync('src/pages/CustomerMenuPreviewPage.tsx', code);
console.log('Fixed TS2367 errors');
