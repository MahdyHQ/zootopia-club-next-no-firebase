"use client";

import type {
  ApiResult,
  Locale,
  UpdateUserProfileResponse,
  UserProfileFieldErrors,
} from "@zootopia/shared-types";
import { validatePhoneNumberE164, validateRequiredUserProfile } from "@zootopia/shared-utils";
import {
  type ConfirmationResult,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { AppMessages } from "@/lib/messages";
import {
  getEphemeralFirebaseClientAuth,
  isFirebaseWebConfigured,
} from "@/lib/firebase/client";

function normalizePhoneForCompare(value: string) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function getErrorCode(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    return String(error.code || "");
  }

  return "";
}

type PhoneVerificationPhase =
  | "idle"
  | "sending"
  | "code_sent"
  | "verifying"
  | "verified";

type ProfileSettingsFormProps = {
  messages: AppMessages;
  locale: Locale;
  initialFullName: string;
  initialUniversityCode: string;
  initialPhoneNumber: string;
  initialPhoneVerifiedAt: string | null;
  initialNationality: string;
  initialOriginCountry: string;
  returnTo: string | null;
  profileCompleted: boolean;
  isAdmin?: boolean;
};

export function ProfileSettingsForm({
  messages,
  locale,
  initialFullName,
  initialUniversityCode,
  initialPhoneNumber,
  initialPhoneVerifiedAt,
  initialNationality,
  initialOriginCountry,
  returnTo,
  profileCompleted,
  isAdmin = false,
}: ProfileSettingsFormProps) {
  const router = useRouter();
  const firebaseConfigured = isFirebaseWebConfigured();
  const [fullName, setFullName] = useState(initialFullName);
  const [universityCode, setUniversityCode] = useState(initialUniversityCode);
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber);
  const [nationality, setNationality] = useState(initialNationality);
  const [originCountry, setOriginCountry] = useState(initialOriginCountry);
  const [busy, setBusy] = useState(false);
  const [phonePhase, setPhonePhase] = useState<PhoneVerificationPhase>(
    initialPhoneVerifiedAt ? "verified" : "idle",
  );
  const [otpCode, setOtpCode] = useState("");
  const [phoneMessage, setPhoneMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<UserProfileFieldErrors>({});
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const [verifiedPhoneNumber, setVerifiedPhoneNumber] = useState(
    initialPhoneVerifiedAt ? normalizePhoneForCompare(initialPhoneNumber) : "",
  );
  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState<string | null>(
    initialPhoneVerifiedAt,
  );

  const normalizedPhoneNumber = useMemo(
    () => normalizePhoneForCompare(phoneNumber),
    [phoneNumber],
  );
  const isPhoneVerified =
    Boolean(phoneVerifiedAt) &&
    Boolean(verifiedPhoneNumber) &&
    normalizedPhoneNumber.length > 0 &&
    verifiedPhoneNumber === normalizedPhoneNumber;
  const formTitle = isAdmin
    ? messages.settingsSelfProfileTitle
    : profileCompleted
      ? messages.profileCompletionEditTitle
      : messages.profileCompletionRequiredTitle;
  const formDescription = isAdmin
    ? messages.settingsSelfProfileSubtitle
    : profileCompleted
      ? messages.profileCompletionEditSubtitle
      : messages.profileCompletionRequiredDetail;
  const submitLabel =
    !isAdmin && !profileCompleted
      ? messages.profileCompletionSaveAction
      : messages.settingsProfileSaveAction;

  function clearRecaptchaVerifier() {
    if (recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current.clear();
      recaptchaVerifierRef.current = null;
    }
  }

  useEffect(() => () => {
    clearRecaptchaVerifier();
  }, []);

  async function ensureRecaptchaVerifier() {
    if (recaptchaVerifierRef.current) {
      return recaptchaVerifierRef.current;
    }

    const container = recaptchaContainerRef.current;
    if (!container) {
      throw new Error("RECAPTCHA_CONTAINER_MISSING");
    }

    const auth = await getEphemeralFirebaseClientAuth();
    auth.languageCode = locale;

    const verifier = new RecaptchaVerifier(auth, container, {
      size: "invisible",
      "expired-callback": () => {
        setPhonePhase("idle");
        setPhoneMessage(messages.settingsPhoneVerificationFailed);
        clearRecaptchaVerifier();
      },
    });

    recaptchaVerifierRef.current = verifier;
    await verifier.render();
    return verifier;
  }

  function clearFieldError(field: keyof UserProfileFieldErrors) {
    setFieldErrors((current) => {
      if (!current[field]) {
        return current;
      }

      return {
        ...current,
        [field]: undefined,
      };
    });
  }

  async function handleSendVerificationCode() {
    setPhoneMessage(null);
    setError(null);

    if (!firebaseConfigured) {
      setError(messages.settingsPhoneVerificationFailed);
      return;
    }

    const phoneValidation = validatePhoneNumberE164(phoneNumber);
    if (!phoneValidation.ok) {
      setFieldErrors((current) => ({
        ...current,
        phoneNumber: phoneValidation.error,
      }));
      return;
    }

    clearFieldError("phoneNumber");
    setPhonePhase("sending");

    try {
      const auth = await getEphemeralFirebaseClientAuth();
      auth.languageCode = locale;
      const verifier = await ensureRecaptchaVerifier();
      confirmationResultRef.current = await signInWithPhoneNumber(
        auth,
        phoneValidation.value,
        verifier,
      );
      setOtpCode("");
      setPhonePhase("code_sent");
      setPhoneMessage(messages.settingsPhoneVerificationSent);
    } catch (nextError) {
      const code = getErrorCode(nextError);
      if (
        code === "auth/invalid-phone-number" ||
        code === "auth/missing-phone-number"
      ) {
        setFieldErrors((current) => ({
          ...current,
          phoneNumber:
            messages.settingsPhoneVerificationRequired,
        }));
      } else if (
        code === "auth/too-many-requests" ||
        code === "auth/quota-exceeded"
      ) {
        setError(messages.settingsPhoneVerificationRetryLater);
      } else {
        setError(messages.settingsPhoneVerificationFailed);
      }
      confirmationResultRef.current = null;
      setPhonePhase(isPhoneVerified ? "verified" : "idle");
      clearRecaptchaVerifier();
    }
  }

  async function handleConfirmVerificationCode() {
    setPhoneMessage(null);
    setError(null);

    const confirmationResult = confirmationResultRef.current;
    if (!confirmationResult) {
      setError(messages.settingsPhoneVerificationFailed);
      return;
    }

    const normalizedCode = otpCode.trim();
    if (!/^\d{6}$/.test(normalizedCode)) {
      setError(messages.settingsPhoneVerificationInvalidCode);
      return;
    }

    setPhonePhase("verifying");

    try {
      const credential = await confirmationResult.confirm(normalizedCode);
      const idToken = await credential.user.getIdToken(true);

      const response = await fetch("/api/users/me/phone-verification", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ idToken }),
      });

      let payload: ApiResult<{
        user: {
          phoneNumber: string | null;
          phoneVerifiedAt: string | null;
        };
      }>;

      try {
        payload = (await response.json()) as ApiResult<{
          user: {
            phoneNumber: string | null;
            phoneVerifiedAt: string | null;
          };
        }>;
      } catch {
        throw new Error("PHONE_VERIFICATION_RESPONSE_INVALID");
      }

      if (!response.ok || !payload.ok) {
        throw new Error(payload.ok ? "PHONE_VERIFICATION_FAILED" : payload.error.message);
      }

      const persistedPhone = payload.data.user.phoneNumber ?? normalizedPhoneNumber;
      setPhoneNumber(persistedPhone);
      setVerifiedPhoneNumber(normalizePhoneForCompare(persistedPhone));
      setPhoneVerifiedAt(payload.data.user.phoneVerifiedAt);
      clearFieldError("phoneNumber");
      setOtpCode("");
      setPhonePhase("verified");
      setPhoneMessage(messages.settingsPhoneVerificationSuccess);
      confirmationResultRef.current = null;
      clearRecaptchaVerifier();

      try {
        const auth = await getEphemeralFirebaseClientAuth();
        await signOut(auth);
      } catch {
        // Best-effort cleanup for temporary phone-auth client state.
      }

      router.refresh();
    } catch (nextError) {
      const code = getErrorCode(nextError);
      if (
        code === "auth/invalid-verification-code" ||
        code === "auth/code-expired"
      ) {
        setError(messages.settingsPhoneVerificationInvalidCode);
      } else if (code === "auth/network-request-failed") {
        setError(messages.settingsPhoneVerificationFailed);
      } else {
        setError(
          nextError instanceof Error
            ? nextError.message
            : messages.settingsPhoneVerificationFailed,
        );
      }
      setPhonePhase("code_sent");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const validation = validateRequiredUserProfile({
      fullName,
      universityCode,
      nationality,
      originCountry,
    });

    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors);
      setError(validation.message);
      setBusy(false);
      return;
    }

    if (!isAdmin && !isPhoneVerified) {
      setFieldErrors((current) => ({
        ...current,
        phoneNumber: messages.settingsPhoneVerificationRequired,
      }));
      setError(messages.settingsPhoneVerificationRequired);
      setBusy(false);
      return;
    }

    setFieldErrors({});

    try {
      const targetUrl = new URL("/api/users/me/profile", window.location.origin);
      if (returnTo) {
        targetUrl.searchParams.set("returnTo", returnTo);
      }

      /* Settings writes only through the self-profile route.
         Keep the target account derived from the server session and never add a client-supplied uid to this payload or URL. */
      const response = await fetch(targetUrl, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          fullName: validation.value.fullName,
          universityCode: validation.value.universityCode,
          nationality: validation.value.nationality,
          originCountry: validation.value.originCountry,
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
          {formTitle}
        </h2>
        <p className="text-sm leading-7 text-foreground-muted">
          {formDescription}
        </p>
      </div>

      <form className="mt-6 space-y-5" onSubmit={handleSubmit} noValidate>
        <label className="block space-y-2">
          <span className="text-sm font-semibold text-foreground">
            {messages.settingsPhoneLabel}
          </span>
          <div className="flex items-center gap-3">
            <input
              type="tel"
              value={phoneNumber}
              onChange={(event) => {
                const nextValue = event.target.value;
                setPhoneNumber(nextValue);
                setPhoneMessage(null);
                clearFieldError("phoneNumber");

                if (
                  normalizePhoneForCompare(nextValue) !== verifiedPhoneNumber
                ) {
                  setPhoneVerifiedAt(null);
                  if (phonePhase === "verified") {
                    setPhonePhase("idle");
                  }
                }
              }}
              placeholder={messages.settingsPhonePlaceholder}
              autoComplete="tel"
              inputMode="tel"
              className="w-full rounded-2xl border border-border bg-background-strong px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent"
              aria-invalid={fieldErrors.phoneNumber ? "true" : "false"}
              aria-describedby="settings-phone-hint settings-phone-error"
            />
            <span
              className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                isPhoneVerified
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-500"
              }`}
            >
              {isPhoneVerified
                ? messages.settingsPhoneVerifiedBadge
                : messages.settingsPhoneUnverifiedBadge}
            </span>
          </div>
          <p id="settings-phone-hint" className="text-sm leading-7 text-foreground-muted">
            {messages.settingsPhoneHint}
          </p>

          <div className="space-y-3 rounded-2xl border border-border bg-background-elevated/70 p-4">
            <div ref={recaptchaContainerRef} className="min-h-[1px]" aria-hidden="true" />

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleSendVerificationCode()}
                disabled={!firebaseConfigured || phonePhase === "sending" || phonePhase === "verifying"}
                className="action-button"
              >
                {phonePhase === "sending"
                  ? messages.loading
                  : phonePhase === "code_sent" || phonePhase === "verified"
                    ? messages.settingsPhoneResendCodeAction
                    : messages.settingsPhoneSendCodeAction}
              </button>

              {!firebaseConfigured ? (
                <p className="text-xs text-danger">
                  {messages.settingsPhoneVerificationFailed}
                </p>
              ) : null}
            </div>

            {phonePhase === "code_sent" || phonePhase === "verifying" ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <label className="block space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
                    {messages.settingsPhoneCodeLabel}
                  </span>
                  <input
                    type="text"
                    value={otpCode}
                    onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder={messages.settingsPhoneCodePlaceholder}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    className="w-full rounded-2xl border border-border bg-background-strong px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void handleConfirmVerificationCode()}
                  disabled={phonePhase === "verifying"}
                  className="action-button justify-center"
                >
                  {phonePhase === "verifying"
                    ? messages.loading
                    : messages.settingsPhoneVerifyCodeAction}
                </button>
              </div>
            ) : null}

            {phoneMessage ? (
              <p className="text-sm text-emerald-500">{phoneMessage}</p>
            ) : null}
          </div>

          {fieldErrors.phoneNumber ? (
            <p id="settings-phone-error" className="text-sm text-danger">
              {fieldErrors.phoneNumber}
            </p>
          ) : null}
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-foreground">
            {messages.settingsFullNameLabel}
          </span>
          <input
            type="text"
            value={fullName}
            onChange={(event) => {
              setFullName(event.target.value);
              clearFieldError("fullName");
            }}
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
            onChange={(event) => {
              setUniversityCode(event.target.value);
              clearFieldError("universityCode");
            }}
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

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-foreground">
            {messages.settingsNationalityLabel}
          </span>
          <input
            type="text"
            value={nationality}
            onChange={(event) => {
              setNationality(event.target.value);
              clearFieldError("nationality");
            }}
            placeholder={messages.settingsNationalityPlaceholder}
            autoComplete="off"
            className="w-full rounded-2xl border border-border bg-background-strong px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent"
            aria-invalid={fieldErrors.nationality ? "true" : "false"}
            aria-describedby="settings-nationality-hint settings-nationality-error"
          />
          <p id="settings-nationality-hint" className="text-sm leading-7 text-foreground-muted">
            {messages.settingsNationalityHint}
          </p>
          {fieldErrors.nationality ? (
            <p id="settings-nationality-error" className="text-sm text-danger">
              {fieldErrors.nationality}
            </p>
          ) : null}
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-foreground">
            {messages.settingsOriginCountryLabel}
          </span>
          <input
            type="text"
            value={originCountry}
            onChange={(event) => {
              setOriginCountry(event.target.value);
              clearFieldError("originCountry");
            }}
            placeholder={messages.settingsOriginCountryPlaceholder}
            autoComplete="off"
            className="w-full rounded-2xl border border-border bg-background-strong px-4 py-3 text-sm text-foreground outline-none transition focus:border-accent"
            aria-invalid={fieldErrors.originCountry ? "true" : "false"}
            aria-describedby="settings-origin-country-hint settings-origin-country-error"
          />
          <p
            id="settings-origin-country-hint"
            className="text-sm leading-7 text-foreground-muted"
          >
            {messages.settingsOriginCountryHint}
          </p>
          {fieldErrors.originCountry ? (
            <p id="settings-origin-country-error" className="text-sm text-danger">
              {fieldErrors.originCountry}
            </p>
          ) : null}
        </label>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="action-button w-full justify-center sm:w-auto"
        >
          {busy ? messages.loading : submitLabel}
        </button>
      </form>
    </section>
  );
}
