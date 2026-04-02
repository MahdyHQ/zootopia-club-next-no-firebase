const fs = require('fs');

const uploadPath = 'C:\\zootopia-club-next\\apps\\web\\app\\(protected)\\(completed)\\upload\\page.tsx';
let uploadContent = fs.readFileSync(uploadPath, 'utf8');

// Remove the quick action "subtitle" blocks
uploadContent = uploadContent.replace(
  /<p className="mt-2 text-sm leading-relax text-zinc-500 dark:text-zinc-400">\s*\{uiContext\.messages\.[a-zA-Z]+Subtitle\}\s*<\/p>/g,
  ''
);

// Remove the main quick actions subtitle desc block
uploadContent = uploadContent.replace(
  /<p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">\s*\{uiContext\.messages\.uploadPageQuickActionsSubtitle\}\s*<\/p>/g,
  ''
);

fs.writeFileSync(uploadPath, uploadContent);
console.log('Upload quick actions simplified.');
