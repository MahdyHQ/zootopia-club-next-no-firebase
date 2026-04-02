const fs = require('fs');

const layoutPath = 'C:\\zootopia-club-next\\apps\\web\\app\\(protected)\\layout.tsx';
let layoutContent = fs.readFileSync(layoutPath, 'utf8');

const newWrapperTop = `
  return (
    <div className="relative min-h-screen">
      {/* Shared Deep Space Grid Background */}
      <div className="fixed inset-0 z-[-1] pointer-events-none bg-[#0a0f18]">
        <div className="absolute inset-0 bg-[url('/my-app-background.png')] bg-cover bg-center bg-fixed bg-no-repeat opacity-[0.25] dark:opacity-[0.10]" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-background/80 to-background/95 backdrop-blur-[2px]" />
      </div>

      <div className="page-shell relative z-10 px-4 py-6 md:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          <ShellNav
            messages={uiContext.messages}
            user={user}
            locale={uiContext.locale}
            themeMode={uiContext.themeMode}
          />
          <main className="space-y-6 pb-8">{children}</main>
        </div>
      </div>
    </div>
  );
`;

const replaceRegex = /return \([\s\S]*?\);\n}/;
layoutContent = layoutContent.replace(replaceRegex, newWrapperTop + '\n}');

fs.writeFileSync(layoutPath, layoutContent);
