const fs = require('fs');
let code = fs.readFileSync('src/pages/CustomerMenuPreviewPage.tsx', 'utf8');

// Normalize line endings
code = code.replace(/\r\n/g, '\n');

// 1. Remove the list layout branch entirely to force the grid layout.
// We search for `) : theme.layout === 'list' ? (` and remove it and the entire `list` map block up to `) : (` for the grid.
const listStartRegex = /\) : theme\.layout === 'list' \? \([\s\S]*?\)\s*:\s*\(\s*\/\* ========================================================================= \*\/\s*\/\* Dynamic Layout Grid/;

code = code.replace(listStartRegex, `) : (
          /* ========================================================================= */
          /* Dynamic Layout Grid`);

// 2. Force `effectiveStyle = 'cards'` for ALL items in the grid, bypassing admin settings.
const effectiveStyleRegex = /\/\/ Determine effective presentation style[\s\S]*?\/\/ Column span for layout flow/m;

code = code.replace(effectiveStyleRegex, `// Determine effective presentation style
                const effectiveStyle = 'cards';
                const hasPhoto = Boolean(item.image_url);
                const showPhoto = custom.show_image !== undefined ? custom.show_image : (item.show_image !== undefined ? item.show_image : hasPhoto);
                
                // Column span for layout flow`);

// 3. Make sure the outer wrapper grid uses 1 column so the wide cards look right!
// The current grid is:
// className={`grid gap-3 sm:gap-4.5 ${theme.layout === 'bento' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}
const gridColsRegex = /className=\{\`grid gap-3 sm:gap-4\.5 \$\{[\s\S]*?\}\`\}/;
code = code.replace(gridColsRegex, 'className={`grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-2`}');


// Restore CRLF
code = code.replace(/\n/g, '\r\n');
fs.writeFileSync('src/pages/CustomerMenuPreviewPage.tsx', code);
console.log('Successfully patched layouts in CustomerMenuPreviewPage');
