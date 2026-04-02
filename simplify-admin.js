const fs = require('fs');

const adminPath = 'C:\\zootopia-club-next\\apps\\web\\app\\(protected)\\admin\\page.tsx';
let adminContent = fs.readFileSync(adminPath, 'utf8');

adminContent = adminContent.replace(
  /<p className="max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">\s*\{uiContext\.messages\.adminSubtitle\}\s*<\/p>/g,
  ''
);

fs.writeFileSync(adminPath, adminContent);

console.log('Admin simplified.');
