"use client";

import type { ReactNode } from "react";

interface QuestionSectionProps {
  heading?: string | null;
  dark: boolean;
  children: ReactNode;
}

export function QuestionSection(props: QuestionSectionProps) {
  return (
    <section className="space-y-3">
      {props.heading ? (
        <div
          className={`rounded-[1.1rem] border px-4 py-2 text-sm font-bold tracking-tight ${
            props.dark
              ? "border-cyan-200/20 bg-cyan-300/10 text-cyan-50"
              : "border-cyan-200 bg-cyan-50 text-cyan-800"
          }`}
        >
          {props.heading}
        </div>
      ) : null}
      <div className="grid gap-3">{props.children}</div>
    </section>
  );
}
