const fs = require('fs');
const path = require('path');

const targetPage = 'C:\\zootopia-club-next\\apps\\web\\app\\(protected)\\(completed)\\upload\\page.tsx';
let pageContent = fs.readFileSync(targetPage, 'utf8');

// Replace the entire page content up to `<UploadWorkspace`
const newPageTop = `import { APP_ROUTES } from "@zootopia/shared-config";
import Link from "next/link";
import { UploadCloud, FileText, BrainCircuit, PieChart, Info, ArrowRight, Zap, Database } from "lucide-react";

import { UploadWorkspace } from "@/components/upload/upload-workspace";
import { getRequestUiContext } from "@/lib/server/request-context";
import {
  listAssessmentGenerationsForUser,
  listDocumentsForUser,
  listInfographicGenerationsForUser,
} from "@/lib/server/repository";
import { requireCompletedUser } from "@/lib/server/session";

export default async function UploadPage() {
  const [user, uiContext] = await Promise.all([
    requireCompletedUser(APP_ROUTES.upload),
    getRequestUiContext(),
  ]);
  const [documents, assessments, infographics] = await Promise.all([
    listDocumentsForUser(user.uid),
    listAssessmentGenerationsForUser(user.uid),
    listInfographicGenerationsForUser(user.uid),
  ]);

  return (
    <div className="space-y-12 pb-8">
      {/* 1. Hero Upload Section */}
      <section className="relative flex flex-col items-center justify-center min-h-[60vh] w-full mt-6 rounded-[2.5rem] bg-[#0c121e] border border-white/5 shadow-2xl overflow-hidden p-8 sm:p-12 lg:p-20">
        {/* Subtle decorative background matching the reference */}
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, #1e4d50 0%, transparent 60%)' }} />
        <div className="absolute inset-0 mix-blend-overlay opacity-10 pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\\"60\\" height=\\"60\\" viewBox=\\"0 0 60 60\\" xmlns=\\"http://www.w3.org/2000/svg\\"%3E%3Cg fill=\\"none\\" fill-rule=\\"evenodd\\"%3E%3Cg fill=\\"%239C92AC\\" fill-opacity=\\"0.15\\"%3E%3Cpath d=\\"M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\\"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
        
        <div className="relative z-10 w-full max-w-4xl mx-auto flex flex-col items-center text-center">
          <div className="flex items-center gap-2 mb-10 opacity-80">
            <UploadCloud className="h-5 w-5 text-emerald-400" />
            <h2 className="text-sm font-bold uppercase tracking-[0.25em] text-zinc-300">
              {uiContext.messages.navUpload?.toUpperCase() || 'UPLOAD RESEARCH DATA'}
            </h2>
          </div>

          <div className="w-full">
            <UploadWorkspace
              messages={uiContext.messages}
              initialDocuments={documents}
              title=""
              description=""
            />
          </div>
        </div>
      </section>

      {/* 2. Secondary Metrics (Demoted) */}
      <section className="relative px-2">
`;

// Replace from start to the <section className="..."> after <UploadWorkspace
const regexTop = /import \{ APP_ROUTES[\s\S]*?<section className="relative overflow-hidden rounded-\[1\.75rem\] border border-zinc-200\/80 bg-white\/92 p-8 shadow-lg shadow-zinc-900\/5 backdrop-blur-xl dark:border-zinc-800\/90 dark:bg-zinc-950\/60">/;

pageContent = pageContent.replace(regexTop, newPageTop);
fs.writeFileSync(targetPage, pageContent);

const targetWorkspace = 'C:\\zootopia-club-next\\apps\\web\\components\\upload\\upload-workspace.tsx';
let workspaceContent = fs.readFileSync(targetWorkspace, 'utf8');

// Completely rewrite the form and input rendering in upload-workspace.tsx to match the glowing teal hero button.
// For effort scale, we just inject the specific styling into the form area.
workspaceContent = workspaceContent.replace(
  /className="p-8 sm:p-12 flex flex-col items-center[\s\S]*?<\/form>[ \t]*<\/div>/g,
  \`className="p-4 sm:p-8 flex flex-col items-center justify-center text-center">
        <form action={formAction} className="w-full flex flex-col items-center">
          <div className="relative group w-full max-w-md mx-auto cursor-pointer">
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/0 via-emerald-400/40 to-emerald-500/0 rounded-full blur-xl group-hover:via-emerald-400/60 transition-all duration-500 ease-out opacity-0 group-hover:opacity-100"></div>
            
            <label htmlFor="file-upload" className="relative flex items-center justify-center w-full px-8 py-5 rounded-[2rem] bg-gradient-to-b from-[#1c3a3e] to-[#0f2124] border-2 border-emerald-500/30 text-emerald-50 hover:text-white shadow-[0_0_40px_rgba(16,185,129,0.15)] group-hover:shadow-[0_0_60px_rgba(16,185,129,0.3)] hover:-translate-y-1 transition-all duration-300 cursor-pointer overflow-hidden backdrop-blur-md">
              <div className="absolute inset-0 flex">
                <div className="w-1/2 h-full bg-gradient-to-r from-transparent via-white/5 to-transparent skew-x-12 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
              </div>
              <span className="relative text-lg font-black uppercase tracking-[0.1em] font-[family-name:var(--font-display)]">
                 START YOUR SCIENTIFIC INQUIRY
              </span>
              <input
                id="file-upload"
                type="file"
                name="file"
                className="hidden"
                disabled={isPending}
                accept=".pdf,.docx,.xlsx,.txt,.csv,.png,.jpg,.jpeg"
                onChange={(e) => {
                   if (e.target.files && e.target.files.length > 0) {
                     e.target.form?.requestSubmit();
                   }
                }}
              />
            </label>
          </div>

          {/* Supported Format Text */}
          <div className="mt-8 text-xs font-semibold tracking-widest text-[#73838e] uppercase">
            SUPPORTED FILES: LAB RESULTS, SCHEMATICS, SIMULATIONS, OBSERVATIONS
          </div>

          {/* Format Badges */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
             <span className="text-[10px] text-zinc-500 mr-2 uppercase tracking-wider">Drag and drop files here or select one</span>
             <span className="px-2 py-1 bg-[#8c313a]/80 text-[#ffb4bb] font-bold text-[9px] rounded uppercase">.PDF</span>
             <span className="px-2 py-1 bg-[#264b73]/80 text-[#a0c8ff] font-bold text-[9px] rounded uppercase">.DOCX</span>
             <span className="px-2 py-1 bg-[#205244]/80 text-[#8cf0c6] font-bold text-[9px] rounded uppercase">.XLSX</span>
             <span className="px-2 py-1 bg-[#6a4221]/80 text-[#ffcca0] font-bold text-[9px] rounded uppercase">.CSV</span>
             <span className="px-2 py-1 bg-[#472c5a]/80 text-[#e0a6ff] font-bold text-[9px] rounded uppercase">.JPG</span>
          </div>

          <SubmitButton isPending={isPending} />
        </form>
      </div>\`
);

// We need to remove the top header of the upload workspace component to clean it up.
workspaceContent = workspaceContent.replace(
  /<div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">[\s\S]*?<\/div>\s*<\/div>/,
  \`{title && (
            <div className="mb-8 text-center">
              <h2 className="text-xl font-[family-name:var(--font-display)] font-bold text-zinc-900 border-b pb-4">
                {title}
              </h2>
              {description && <p className="text-sm mt-2 text-zinc-500">{description}</p>}
            </div>
          )}\`
);

fs.writeFileSync(targetWorkspace, workspaceContent);
