const fs = require('fs');

const updateTypes = (filepath) => {
  let code = fs.readFileSync(filepath, 'utf8');
  if (!code.includes('date_format_nav')) {
    code = code.replace(/menu_theme_config\?\: MenuThemeConfig;/, 'menu_theme_config?: MenuThemeConfig;\n  date_format_nav?: "BOTH" | "ENGLISH" | "NEPALI";\n  date_format_billing?: "BOTH" | "ENGLISH" | "NEPALI";');
    fs.writeFileSync(filepath, code, 'utf8');
  }
};

updateTypes('src/types/auth.ts');
updateTypes('server/src/types/index.ts');
console.log('Updated Business interfaces.');
