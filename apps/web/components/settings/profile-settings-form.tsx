"use client";

import type {
  ApiResult,
  UpdateUserProfileResponse,
  UserProfileFieldErrors,
} from "@zootopia/shared-types";
import { validateRequiredUserProfile } from "@zootopia/shared-utils";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AppMessages } from "@/lib/messages";

type ProfileSettingsFormProps = {
  messages: AppMessages;
  initialFullName: string;
  initialUniversityCode: string;
  returnTo: string | null;
  profileCompleted: boolean;
};

export function ProfileSettingsForm({
  messages,
  initialFullName,
  initialUniversityCode,
  returnTo,
  profileCompleted,
}: ProfileSettingsFormProps) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initialFullName);
  const [universityCode, setUniversityCode] = useState(initialUniversityCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<UserProfileFieldErrors>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const validation = validateRequiredUserProfile({
      fullName,
      universityCode,
    });

    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors);
      setError(validation.message);
      setBusy(false);
      return;
    }

    setFieldErrors({});

    try {
      const targetUrl = new URL("/api/users/me/profile", window.location.origin);
      if (returnTo) {
        targetUrl.searchParams.set("returnTo", returnTo);
      }

      const response = await fetch(targetUrl, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          fullName: validation.value.fullName,
          universityCode: validation.value.universityCode,
        }),
      });

      const payload = (await response.json()) as ApiResult<UpdateUserProfileResponse>;
      if (!response.ok || !payload.ok) {
        if (!payload.ok) {
          setFieldErrors((payload.error.fieldErrors ?? {}) as UserProfileFieldErrors);
          throw new Error(payload.error.message);
        }

        throw new Error("PROFILE_UPDATE_FAILED");
      }

      router.replace(payload.data.redirectTo);
      router.refresh();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : messages.profileCompletionSaveFailed,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface-card rounded-[2rem] p-6">
      <div className="flex flex-col gap-3">
        <p className="section-label">{messages.settingsProfileTitle}</p>
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-[-0.04em] text-foreground">
          {profileCompleted
            ? messages.profileCompletionEditTitle
            : messages.profileCompletionRequiredTitle}
        </h2>
        <p className="text-sm leading-7 text-foreground-muted">
          {profileCompleted
            ? messages.profileCompletionEditSubtitle
            : messages.profileCompletionRequiredDetail}
        </p>
      </div>

      <form className="mt-6 space-y-5" onSubmit={handleSubmit} noValidate>
        <label className="block space-y-2">
          <span className="text-sm font-semibold text-foreground">
            {messages.settingsFullNameLabel}
          </span>
          <input
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder={messages.settingsFullNamePlaceholder}
            autoComplete="name"
            className="w-full rounded-2xl border border-border bg-background-strong px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent"
            aria-invalid={fieldErrors.fullName ? "true" : "false"}
            aria-describedby="settings-full-name-hint settings-full-name-error"
          />
          <p
            id="settings-full-name-hint"
            className="text-sm leading-7 text-foreground-muted"
          >
            {messages.settingsFullNameHint}
          </p>
          {fieldErrors.fullName ? (
            <p id="settings-full-name-error" className="text-sm text-danger">
              {fieldErrors.fullName}
            </p>
          ) : null}
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-foreground">
            {messages.settingsUniversityCodeLabel}
          </span>
          <input
            type="text"
            value={universityCode}
            onChange={(event) => setUniversityCode(event.target.value)}
            placeholder={messages.settingsUniversityCodePlaceholder}
            autoComplete="off"
            inputMode="numeric"
            maxLength={7}
            className="w-full rounded-2xl border border-border bg-background-strong px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent"
            aria-invalid={fieldErrors.universityCode ? "true" : "false"}
            aria-describedby="settings-university-code-hint settings-university-code-error"
          />
          <p
            id="settings-university-code-hint"
            className="text-sm leading-7 text-foreground-muted"
          >
            {messages.settingsUniversityCodeHint}
          </p>
          {fieldErrors.universityCode ? (
            <p id="settings-university-code-error" className="text-sm text-danger">
              {fieldErrors.universityCode}
            </p>
          ) : null}
        </label>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="action-button w-full justify-center sm:w-auto"
        >
          {busy ? messages.loading : messages.profileCompletionSaveAction}
        </button>
      </form>
    </section>
  );
}
