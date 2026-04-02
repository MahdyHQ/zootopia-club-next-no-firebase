const fs = require('fs');
for (const p of ["C:/zootopia-club-next/apps/web/components/layout/protected-shell.tsx", "C:/zootopia-club-next/apps/web/components/layout/shell-nav.tsx"]) {
  let c = fs.readFileSync(p, 'utf8');
  let newC = '';
  for (let i=0; i<c.length; i++) {
    if (c[i] === '\\' && (c[i+1] === String.fromCharCode(96) || c[i+1] === String.fromCharCode(36))) {
      // skip backslash
    } else {
      newC += c[i];
    }
  }
  fs.writeFileSync(p, newC);
}
