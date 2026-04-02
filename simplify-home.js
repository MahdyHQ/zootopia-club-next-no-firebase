const fs = require('fs');

const homePath = 'C:\\zootopia-club-next\\apps\\web\\app\\(protected)\\(completed)\\page.tsx';
let homeContent = fs.readFileSync(homePath, 'utf8');

// 1. Completely remove `homeSubtitle` from the hero block to reduce text bloat.
// 2. Clean up `uploadPageFlowBody`.
homeContent = homeContent.replace(
  /<p className="max-w-2xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">\s*\{uiContext\.messages\.homeSubtitle\}\s*<\/p>/g,
  ''
);

homeContent = homeContent.replace(
  /<p className="mt-4 text-base leading-relaxed text-zinc-600 dark:text-zinc-400 max-w-sm">\s*\{uiContext\.messages\.uploadPageFlowBody\}\s*<\/p>/g,
  ''
);

// 3. Remove the entire verbose subtitle loop map entirely from the 4 tool cards.
homeContent = homeContent.replace(
  /<p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">\s*\{card\.subtitle\}\s*<\/p>/g,
  ''
);

fs.writeFileSync(homePath, homeContent);

console.log('Home page simplified.');
