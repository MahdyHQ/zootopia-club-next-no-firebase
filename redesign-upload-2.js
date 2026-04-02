const fs = require('fs');

const targetPage = 'C:\\zootopia-club-next\\apps\\web\\app\\(protected)\\(completed)\\upload\\page.tsx';
let pageContent = fs.readFileSync(targetPage, 'utf8');

// Replace the entire page content up to `<UploadWorkspace`
const newPageTop = `import { APP_ROUTES } from "@zootopia/shared-config";
import Link from "next/link";
import { UploadCloud, FileText, BrainCircuit, PieChart, ArrowRight, Zap } from "lucide-react";

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
      {/* 1. Hero Upload Section - Dark Premium Glow Design */}
      <section className="relative flex flex-col items-center justify-center min-h-[65vh] w-full rounded-[2.5rem] bg-[#0c121e] border border-white/5 shadow-2xl overflow-hidden p-8 sm:p-12 lg:p-20">
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 50% 0%, #1e4d50 0%, transparent 60%)' }} />
        <div className="absolute inset-0 mix-blend-overlay opacity-10 pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\\"60\\" height=\\"60\\" viewBox=\\"0 0 60 60\\" xmlns=\\"http://www.w3.org/2000/svg\\"%3E%3Cg fill=\\"none\\" fill-rule=\\"evenodd\\"%3E%3Cg fill=\\"%239C92AC\\" fill-opacity=\\"0.15\\"%3E%3Cpath d=\\"M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\\"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }} />
        
        <div className="relative z-10 w-full flex flex-col items-center text-center">
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
            />
          </div>
        </div>
      </section>

      {/* 2. Secondary Metrics & Quick Links (Demoted) */}
      <section className="relative px-2">
`;

// Replace from start to the <section className="..."> after <UploadWorkspace
const regexTop = /import \{ APP_ROUTES[\s\S]*?<section className="relative overflow-hidden rounded-\[1\.75rem\] border border-zinc-200\/80 bg-white\/92 p-8 shadow-lg shadow-zinc-900\/5 backdrop-blur-xl dark:border-zinc-800\/90 dark:bg-zinc-950\/60">/;

pageContent = pageContent.replace(regexTop, newPageTop);
fs.writeFileSync(targetPage, pageContent);

const targetWorkspace = 'C:\\zootopia-club-next\\apps\\web\\components\\upload\\upload-workspace.tsx';
let workspaceContent = fs.readFileSync(targetWorkspace, 'utf8');

const regexReplaceForm = /<div className="relative z-10 max-w-2xl space-y-2 text-center">[\s\S]*?<form action={formAction}[\s\S]*?<\/form>[ \t]*<\/div>/;

const newFormArea = `<div className="w-full flex-1 flex flex-col items-center justify-center p-8 sm:p-12">
        <form action={formAction} className="w-full flex flex-col items-center">
          <div className="relative group w-full max-w-md mx-auto cursor-pointer">
            {/* Outer Glow */}
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/0 via-emerald-400/40 to-emerald-500/0 rounded-full blur-xl group-hover:via-emerald-400/60 transition-all duration-500 ease-out opacity-0 group-hover:opacity-100"></div>
            
            {/* The Main Pill Button */}
            <label htmlFor="file-upload" className="relative flex items-center justify-center w-full px-8 py-5 rounded-[2rem] bg-gradient-to-b from-[#1c3a3e] to-[#0f2124] border border-emerald-500/30 text-emerald-50 hover:text-white shadow-[0_0_40px_rgba(16,185,129,0.15)] group-hover:shadow-[0_0_60px_rgba(16,185,129,0.3)] hover:-translate-y-1 transition-all duration-300 cursor-pointer overflow-hidden backdrop-blur-md">
              <span className="relative z-10 text-lg font-black uppercase tracking-[0.08em] font-[family-name:var(--font-display)]">
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

          <div className="mt-8 text-[11px] font-semibold tracking-widest text-[#73838e] uppercase">
            SUPPORTED FILES: LAB RESULTS, SCHEMATICS, SIMULATIONS, OBSERVATIONS
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
             <span className="text-[10px] text-[#5b6a75] mr-2 uppercase tracking-wider">Drag and drop files here or select one</span>
             <span className="px-2 py-1 bg-[#2c1d22]/80 text-[#d86d77] border border-[#d86d77]/20 font-bold text-[9px] rounded uppercase">.PDF</span>
             <span className="px-2 py-1 bg-[#1a273b]/80 text-[#71a5e4] border border-[#71a5e4]/20 font-bold text-[9px] rounded uppercase">.DOCX</span>
             <span className="px-2 py-1 bg-[#192b26]/80 text-[#54c9a4] border border-[#54c9a4]/20 font-bold text-[9px] rounded uppercase">.XLSX</span>
             <span className="px-2 py-1 bg-[#2a241b]/80 text-[#dda271] border border-[#dda271]/20 font-bold text-[9px] rounded uppercase">.CSV</span>
             <span className="px-2 py-1 bg-[#1e2329]/80 text-[#819bb2] border border-[#819bb2]/20 font-bold text-[9px] rounded uppercase">.JPG</span>
          </div>

          {/* Fallback real submit if hidden file input change doesn't fire */}
          <div className="hidden"><SubmitButton isPending={isPending} /></div>
        </form>
      </div>`;

workspaceContent = workspaceContent.replace(regexReplaceForm, newFormArea);

const stripOldContainerRegex = /<div\s+className=\{cn\(\s*'relative flex cursor-pointer flex-col items-center justify-center gap-4 overflow-hidden rounded-\[2\.4rem\] border-2 border-dashed px-5 py-6 transition-all active:scale-\[0\.99\] sm:px-6 sm:py-7',[^)]+\)[\s\S]*?\}\s*>/;

// Replace with a simpler glass container.
const newContainer = `<div className="relative flex w-full max-w-4xl mx-auto flex-col items-center justify-center gap-4 rounded-[2.4rem] transition-all">`;

workspaceContent = workspaceContent.replace(stripOldContainerRegex, newContainer);

const regexRemoveProps = /title=\{uiContext\.messages\.uploadWorkspaceTitle\}\s+description=\{uiContext\.messages\.uploadPageWorkspaceDetail\}\s+/g;
pageContent = pageContent.replace(regexRemoveProps, '');
fs.writeFileSync(targetPage, pageContent);

fs.writeFileSync(targetWorkspace, workspaceContent);
