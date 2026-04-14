"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";

type IdentityAvatarProps = {
  src: string | null;
  fallbackInitial: string;
  size: number;
  sizes: string;
  imageAlt?: string;
  containerClassName?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  children?: ReactNode;
};

export function IdentityAvatar({
  src,
  fallbackInitial,
  size,
  sizes,
  imageAlt = "",
  containerClassName,
  imageClassName,
  fallbackClassName,
  children,
}: IdentityAvatarProps) {
  const [failedSrcs, setFailedSrcs] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const resolvedInitial = fallbackInitial.trim() || "U";
  const resolvedSrc = src && !failedSrcs.has(src) ? src : null;

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full",
        containerClassName,
      )}
    >
      {/* Protected-shell and settings avatars intentionally share this local-asset-first wrapper.
          Keep the load-failure fallback centralized here so remounts or session refreshes never
          leak a broken-image placeholder into compact identity chrome on authenticated surfaces. */}
      {resolvedSrc ? (
        <Image
          key={resolvedSrc}
          src={resolvedSrc}
          alt={imageAlt}
          aria-hidden={imageAlt ? undefined : true}
          width={size}
          height={size}
          sizes={sizes}
          unoptimized
          className={cn("h-full w-full object-cover", imageClassName)}
          onError={() => {
            setFailedSrcs((current) => new Set(current).add(resolvedSrc));
          }}
        />
      ) : (
        <span
          className={cn(
            "flex h-full w-full items-center justify-center",
            fallbackClassName,
          )}
        >
          {resolvedInitial}
        </span>
      )}
      {children}
    </span>
  );
}
