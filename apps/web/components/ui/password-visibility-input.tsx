"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type PasswordVisibilityInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  showPasswordLabel: string;
  hidePasswordLabel: string;
  wrapperClassName?: string;
  toggleButtonClassName?: string;
};

export function PasswordVisibilityInput({
  showPasswordLabel,
  hidePasswordLabel,
  wrapperClassName,
  toggleButtonClassName,
  className,
  disabled,
  ...inputProps
}: PasswordVisibilityInputProps) {
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? hidePasswordLabel : showPasswordLabel;

  return (
    <div className={cn("relative", wrapperClassName)}>
      <input
        {...inputProps}
        type={visible ? "text" : "password"}
        disabled={disabled}
        className={cn(className, "pe-11")}
      />
      <button
        type="button"
        onClick={() => {
          setVisible((current) => !current);
        }}
        aria-label={toggleLabel}
        title={toggleLabel}
        disabled={disabled}
        className={cn(
          "absolute inset-y-0 end-2 inline-flex items-center justify-center text-foreground-muted/90 transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60",
          toggleButtonClassName,
        )}
      >
        {visible ? (
          <EyeOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Eye className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
