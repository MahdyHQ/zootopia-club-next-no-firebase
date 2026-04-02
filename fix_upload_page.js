const fs = require('fs');
let path = "C:/zootopia-club-next/apps/web/app/(protected)/(completed)/upload/page.tsx";
let c = fs.readFileSync(path, 'utf8');

c = c.replace(/bg-\[\#0c121e\]/g, "bg-background-elevated/40 backdrop-blur-2xl");
c = c.replace(/p-8 sm:p-12 lg:p-20/g, "p-4 sm:p-8 lg:p-12 min-w-0");
c = c.replace(/className="w-full"/g, "className=\"w-full min-w-0\"");

// The cards section at the bottom, add min-w-0
c = c.replace(/className="grid gap-4 lg:grid-cols-3"/g, "className=\"grid gap-4 sm:grid-cols-2 lg:grid-cols-3 min-w-0\"");
c = c.replace(/bg-white\/50 dark:bg-zinc-900\/50/g, "bg-white/5 backdrop-blur-sm");
c = c.replace(/bg-white\/80 dark:hover:bg-zinc-800\/80/g, "hover:bg-white/10");
c = c.replace(/text-zinc-900 dark:text-white/g, "text-white");
c = c.replace(/border-white\/40 dark:border-zinc-800\/50/g, "border-white/5");
c = c.replace(/text-zinc-600 dark:text-zinc-400/g, "text-zinc-400");
c = c.replace(/text-zinc-400 dark:text-zinc-500/g, "text-zinc-400");
c = c.replace(/text-zinc-500 dark:text-zinc-400/g, "text-zinc-400");

fs.writeFileSync(path, c);
console.log('Fixed upload/page.tsx');
