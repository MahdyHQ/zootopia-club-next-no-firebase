const fs = require('fs');

const assessmentPath = 'C:\\zootopia-club-next\\apps\\web\\app\\(protected)\\(completed)\\assessment\\page.tsx';
let assessmentContent = fs.readFileSync(assessmentPath, 'utf8');

assessmentContent = assessmentContent.replace(
  /<p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">\s*\{uiContext\.messages\.assessmentSubtitle\}\s*<\/p>/g,
  ''
);

fs.writeFileSync(assessmentPath, assessmentContent);

const infographicPath = 'C:\\zootopia-club-next\\apps\\web\\app\\(protected)\\(completed)\\infographic\\page.tsx';
let infographicContent = fs.readFileSync(infographicPath, 'utf8');

infographicContent = infographicContent.replace(
  /<p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">\s*\{uiContext\.messages\.infographicSubtitle\}\s*<\/p>/g,
  ''
);

fs.writeFileSync(infographicPath, infographicContent);

console.log('Assessment and Infographic simplified.');
