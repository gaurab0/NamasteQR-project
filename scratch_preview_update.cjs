const fs = require('fs');
let c = fs.readFileSync('src/pages/CustomerMenuPreviewPage.tsx', 'utf8');

const targetAreaStart = c.indexOf('{filteredItems.map((item, idx) => {');
const targetAreaEnd = c.lastIndexOf('            })}');

if (targetAreaStart !== -1 && targetAreaEnd !== -1) {
  let area = c.substring(targetAreaStart, targetAreaEnd);
  
  // Replace item.image_url -> displayImage
  area = area.replace(/item\.image_url/g, 'displayImage');
  
  // Replace item.description -> displayDescription
  area = area.replace(/item\.description/g, 'displayDescription');
  
  c = c.substring(0, targetAreaStart) + area + c.substring(targetAreaEnd);
  fs.writeFileSync('src/pages/CustomerMenuPreviewPage.tsx', c);
  console.log('Replaced correctly');
} else {
  console.log('Could not find area');
}
