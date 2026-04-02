const fs = require('fs');

const settingsPath = 'C:\\zootopia-club-next\\apps\\web\\app\\(protected)\\settings\\page.tsx';
let settingsContent = fs.readFileSync(settingsPath, 'utf8');

settingsContent = settingsContent.replace(
  /<p className="max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">\s*\{uiContext\.messages\.settingsSubtitle\}\s*<\/p>/g,
  ''
);

fs.writeFileSync(settingsPath, settingsContent);
console.log('Settings simplified.');
