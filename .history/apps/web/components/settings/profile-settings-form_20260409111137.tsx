"use client";

import type {
  ApiResult,
  Locale,
  UpdateUserProfileResponse,
  UserProfileFieldErrors,
} from "@zootopia/shared-types";
import { validatePhoneNumberE164, validateRequiredUserProfile } from "@zootopia/shared-utils";
import {
  Globe2,
  IdCard,
  LoaderCircle,
  Phone,
  ShieldAlert,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { useRouter } from "next/navigation";
import PhoneNumberInput, {
  formatPhoneNumberIntl,
  type Country,
} from "react-phone-number-input/input";
import {
  type ConfirmationResult,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
} from "firebase/auth";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  SettingsCountrySelect,
  type SettingsSelectOption,
} from "@/components/settings/settings-country-select";
import {
  getEphemeralFirebaseClientAuth,
  isFirebaseWebConfigured,
} from "@/lib/firebase/client";
import {
  buildProfileCountryOptions,
  DEFAULT_PHONE_COUNTRY_ISO2,
  findProfileCountryOptionByCanonicalLabel,
  resolveProfileCountryOption,
  type ProfileCountryOption,
} from "@/lib/profile-country-options";
import type { AppMessages } from "@/lib/messages";

type PhoneVerificationPhase =
  | "idle"
  | "sending"
  | "code_sent"
  | "verifying"
  | "verified";

const OTP_RESEND_COOLDOWN_SECONDS = 60;
const SETTINGS_PHONE_MAX_DIGITS = 18;

type ProfileSettingsFormProps = {
  messages: AppMessages;
  locale: Locale;
  initialFullName: string;
  initialUniversityCode: string;
  initialPhoneNumber: string;
  initialPhoneCountryIso2: string | null;
  initialPhoneVerifiedAt: string | null;
  initialNationality: string;
  returnTo: string | null;
  profileCompleted: boolean;
  isAdmin?: boolean;
};

function normalizeTextValue(value: string) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizePhoneForCompare(value: string | null | undefined) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function normalizePhoneDraftValue(
  value: string | null | undefined,
  fallbackCountryCallingCode?: string,
) {
  const normalized = normalizePhoneForCompare(value);
  if (!normalized) {
    return "";
  }

  /* Keep the draft phone value stable while the user types.
     react-phone-number-input can emit E.164 values (preferred) or intermediate
     country-scoped digits depending on formatting mode and caret edits. Normalizing
     both shapes into one canonical `+<digits>` draft prevents controlled-value
     feedback loops when the component reconciles intermediate edits. */
  if (normalized.startsWith("+")) {
    const internationalDigits = normalized.slice(1).replace(/\D/g, "");
    if (!internationalDigits) {
      return "";
    }

    return `+${internationalDigits.slice(0, SETTINGS_PHONE_MAX_DIGITS)}`;
  }

  const nationalDigits = normalized.replace(/\D/g, "");
  if (!fallbackCountryCallingCode || !nationalDigits) {
    return "";
  }

  const mergedDigits = `${fallbackCountryCallingCode}${nationalDigits}`.replace(
    /\D/g,
    "",
  );
  if (!mergedDigits) {
    return "";
  }

  return `+${mergedDigits.slice(0, SETTINGS_PHONE_MAX_DIGITS)}`;
}

function buildCountryFieldOptions(
  options: ProfileCountryOption[],
  currentValue: string,
) {
  const mappedOptions = options.map((option) => ({
    value: option.canonicalLabel,
    label: option.label,
    description:
      option.canonicalLabel !== option.label ? option.canonicalLabel : undefined,
    leadingVisual: option.flag,
    searchTokens: option.searchTokens,
  })) satisfies SettingsSelectOption[];

  const currentOption = findProfileCountryOptionByCanonicalLabel(options, currentValue);
  if (currentOption || !normalizeTextValue(currentValue)) {
    return mappedOptions;
  }

  return [
    {
      value: normalizeTextValue(currentValue),
      label: normalizeTextValue(currentValue),
      searchTokens: [normalizeTextValue(currentValue)],
    },
    ...mappedOptions,
  ] satisfies SettingsSelectOption[];
}

function buildPhoneCountryOptions(options: ProfileCountryOption[]) {
  return options.map((option) => ({
    value: option.iso2,
    label: option.label,
    description:
      option.canonicalLabel !== option.label ? option.canonicalLabel : undefined,
    badge: `+${option.callingCode}`,
    leadingVisual: option.flag,
    searchTokens: option.searchTokens,
  })) satisfies SettingsSelectOption[];
}

function extractNationalDigitsFromPhoneValue(
  value: string,
  currentCountry: ProfileCountryOption,
) {
  const normalizedValue = normalizePhoneForCompare(value);
  const digits = normalizedValue.replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  return digits.startsWith(currentCountry.callingCode)
    ? digits.slice(currentCountry.callingCode.length)
    : digits;
}

function resolveInitialPhoneCountryIso2(
  initialPhoneNumber: string,
  initialPhoneCountryIso2: string | null,
  options: ProfileCountryOption[],
) {
  const parsedPhone = parsePhoneNumberFromString(initialPhoneNumber || "");
  if (parsedPhone?.country) {
    return resolveProfileCountryOption(options, parsedPhone.country).iso2;
  }

  if (initialPhoneCountryIso2) {
    return resolveProfileCountryOption(options, initialPhoneCountryIso2).iso2;
  }

  const digits = normalizePhoneForCompare(initialPhoneNumber).replace(/^\+/, "");
  if (digits) {
    const matchedOption = [...options]
      .sort((left, right) => right.callingCode.length - left.callingCode.length)
      .find((option) => digits.startsWith(option.callingCode));

    if (matchedOption) {
      return matchedOption.iso2;
    }
  }

  return resolveProfileCountryOption(options, DEFAULT_PHONE_COUNTRY_ISO2).iso2;
}

function formatPhonePreview(value: string) {
  const normalizedValue = normalizePhoneForCompare(value);
  if (!normalizedValue) {
    return "";
  }

  try {
    return formatPhoneNumberIntl(normalizedValue);
  } catch {
    return normalizedValue;
  }
}

function getErrorCode(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    return String(error.code || "");
  }

  return "";
}

export function ProfileSettingsForm({
  messages,
  locale,
  initialFullName,
  initialUniversityCode,
  initialPhoneNumber,
  initialPhoneCountryIso2,
  initialPhoneVerifiedAt,
  initialNationality,
  returnTo,
  profileCompleted,
  isAdmin = false,
}: ProfileSettingsFormProps) {
  const router = useRouter();
  const firebaseConfigured = isFirebaseWebConfigured();
  const recaptchaContainerRef = useRef<HTMLDivElement | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);

  const profileCountryOptions = useMemo(
    () => buildProfileCountryOptions(locale),
    [locale],
  );

  const defaultPhoneCountryIso2 = useMemo(
    () =>
      resolveInitialPhoneCountryIso2(
        initialPhoneNumber,
        initialPhoneCountryIso2,
        profileCountryOptions,
      ),
    [initialPhoneCountryIso2, initialPhoneNumber, profileCountryOptions],
  );

  /* Legacy users can still carry historic phone strings that are not valid
     E.164 drafts. Keep the controlled phone input fed with a safe value only
     so mount-time normalization cannot enter a render/update loop. */
  const initialPhoneDraftValue = normalizePhoneDraftValue(initialPhoneNumber);
  const initialPhoneVerifiedTimestamp =
    initialPhoneVerifiedAt && initialPhoneDraftValue ? initialPhoneVerifiedAt : null;

  const [selectedPhoneCountryIso2, setSelectedPhoneCountryIso2] = useState(
    defaultPhoneCountryIso2,
  );
  const [phoneValue, setPhoneValue] = useState(initialPhoneDraftValue);
  const [fullName, setFullName] = useState(initialFullName);
  const [universityCode, setUniversityCode] = useState(initialUniversityCode);
  const [nationality, setNationality] = useState(initialNationality);
  const [busy, setBusy] = useState(false);
  const [phonePhase, setPhonePhase] = useState<PhoneVerificationPhase>(
    initialPhoneVerifiedTimestamp ? "verified" : "idle",
  );
  const [otpCode, setOtpCode] = useState("");
  const [phoneMessage, setPhoneMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<UserProfileFieldErrors>({});
  const [otpResendAvailableAt, setOtpResendAvailableAt] = useState<number | null>(
    null,
  );
  const [otpTickMs, setOtpTickMs] = useState<number>(() => Date.now());
  const [verifiedPhoneNumber, setVerifiedPhoneNumber] = useState(
    initialPhoneVerifiedTimestamp ? initialPhoneDraftValue : "",
  );
  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState<string | null>(
    initialPhoneVerifiedTimestamp,
  );

  const selectedPhoneCountry = useMemo(
    () =>
      resolveProfileCountryOption(profileCountryOptions, selectedPhoneCountryIso2),
    [profileCountryOptions, selectedPhoneCountryIso2],
  );

  /* The Settings phone row renders country code outside the input field.
     Keep this derived national-digit cap in sync with selected country so the
     persisted E.164 draft never exceeds the 18-digit phone contract. */
  const maxPhoneNationalDigits = useMemo(
    () =>
      Math.max(1, SETTINGS_PHONE_MAX_DIGITS - selectedPhoneCountry.callingCode.length),
    [selectedPhoneCountry.callingCode],
  );

  /* Stable E.164 value for PhoneNumberInput.
     react-phone-number-input expects a pure E.164 string ("+<digits>") or
     undefined. Passing an empty string causes the library to call onChange
     with undefined on every render cycle, which re-triggers updatePhoneDraft
     and sets state again — producing an infinite setState loop.

     Also, the library may internally re-format a value like "+12025550123" into
     a slightly different representation and immediately fire onChange, which
     causes another render. Memoizing the conversion to undefined (for empty) and
     a strict E.164 string (for non-empty) ensures the reference is stable between
     renders unless phoneValue genuinely changes, breaking the loop. */
  const phoneInputValue = useMemo((): string | undefined => {
    if (!phoneValue || !phoneValue.startsWith("+")) return undefined;
    return phoneValue;
  }, [phoneValue]);

  const phoneCountryOptions = useMemo(
    () => buildPhoneCountryOptions(profileCountryOptions),
    [profileCountryOptions],
  );

  const nationalityOptions = useMemo(
    () => buildCountryFieldOptions(profileCountryOptions, nationality),
    [nationality, profileCountryOptions],
  );

  const phonePreview = useMemo(
    () => formatPhonePreview(phoneValue),
    [phoneValue],
  );

  const isPhoneVerified =
    Boolean(phoneVerifiedAt) &&
    Boolean(verifiedPhoneNumber) &&
    phoneValue.length > 0 &&
    verifiedPhoneNumber === phoneValue;

  const otpResendRemainingSeconds = useMemo(() => {
    if (!otpResendAvailableAt) {
      return 0;
    }

    const remainingMs = otpResendAvailableAt - otpTickMs;
    if (remainingMs <= 0) {
      return 0;
    }

    return Math.ceil(remainingMs / 1000);
  }, [otpResendAvailableAt, otpTickMs]);

  const otpResendCountdownText =
    otpResendRemainingSeconds > 0
      ? messages.settingsPhoneOtpCountdownLabel.replace(
          "{seconds}",
          String(otpResendRemainingSeconds),
        )
      : messages.settingsPhoneOtpReadyLabel;

  const otpInputVisible =
    phonePhase === "code_sent" || phonePhase === "verifying";

  const otpResendLocked =
    (phonePhase === "code_sent" || phonePhase === "verified") &&
    otpResendRemainingSeconds > 0;

  const otpDeliveryStateVisible =
    phonePhase === "code_sent" ||
    phonePhase === "verifying" ||
    phonePhase === "verified";

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

  const requirementItems = useMemo(
    () =>
      [
        {
          key: "fullName",
          label: messages.settingsFullNameLabel,
          icon: UserRound,
          complete: Boolean(normalizeTextValue(fullName)),
        },
        {
          key: "universityCode",
          label: messages.settingsUniversityCodeLabel,
          icon: IdCard,
          complete: Boolean(normalizeTextValue(universityCode)),
        },
        {
          key: "phoneNumber",
          label: messages.settingsPhoneLabel,
          icon: Phone,
          complete: isPhoneVerified,
        },
        {
          key: "nationality",
          label: messages.settingsNationalityLabel,
          icon: Globe2,
          complete: Boolean(normalizeTextValue(nationality)),
        },
      ] satisfies {
        key: keyof UserProfileFieldErrors;
        label: string;
        icon: LucideIcon;
        complete: boolean;
      }[],
    [
      fullName,
      isPhoneVerified,
      messages.settingsFullNameLabel,
      messages.settingsNationalityLabel,
      messages.settingsPhoneLabel,
      messages.settingsUniversityCodeLabel,
      nationality,
      universityCode,
    ],
  );

  const missingRequirementCount = requirementItems.filter(
    (item) => !item.complete,
  ).length;

  function clearRecaptchaVerifier() {
    if (recaptchaVerifierRef.current) {
      recaptchaVerifierRef.current.clear();
      recaptchaVerifierRef.current = null;
    }
  }

  useEffect(
    () => () => {
      clearRecaptchaVerifier();
    },
    [],
  );

  useEffect(() => {
    if (!otpResendAvailableAt) {
      return;
    }

    const timerId = window.setInterval(() => {
      setOtpTickMs(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [otpResendAvailableAt]);

  useEffect(() => {
    if (!otpResendAvailableAt) {
      return;
    }

    if (otpResendRemainingSeconds === 0) {
      setOtpResendAvailableAt(null);
    }
  }, [otpResendAvailableAt, otpResendRemainingSeconds]);

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

  function updatePhoneDraft(nextCountryIso2: string, nextPhoneValue: string) {
    const fallbackCountry = resolveProfileCountryOption(
      profileCountryOptions,
      nextCountryIso2,
    );
    const normalizedNextPhoneValue = normalizePhoneDraftValue(
      nextPhoneValue,
      fallbackCountry.callingCode,
    );
    const countryChanged = selectedPhoneCountryIso2 !== fallbackCountry.iso2;
    const phoneChanged = phoneValue !== normalizedNextPhoneValue;

    /* Settings keeps country ownership in the explicit country selector.
       Avoid re-deriving country from each typed value, which can bounce between
       equally valid regions and retrigger controlled-input reconciliation. */
    if (!countryChanged && !phoneChanged) {
      return;
    }

    setSelectedPhoneCountryIso2(fallbackCountry.iso2);
    setPhoneValue(normalizedNextPhoneValue);
    setPhoneMessage(null);
    setError(null);
    setOtpResendAvailableAt(null);
    clearFieldError("phoneNumber");

    if (phonePhase === "code_sent" || phonePhase === "verifying") {
      confirmationResultRef.current = null;
      setOtpCode("");
      clearRecaptchaVerifier();
      setPhonePhase("idle");
    }

    /* Phone verification is tied to one exact normalized E.164 number.
       If the student edits the country or digits after a successful OTP, clear the verified snapshot here so the server-enforced completion gate can't be bypassed with a stale verification state. */
    if (normalizedNextPhoneValue !== verifiedPhoneNumber) {
      setPhoneVerifiedAt(null);
      if (phonePhase === "verified") {
        setPhonePhase("idle");
      }
    }
  }

  function handlePhoneCountryChange(nextCountryIso2: string) {
    const currentCountry = selectedPhoneCountry;
    const nextCountry = resolveProfileCountryOption(
      profileCountryOptions,
      nextCountryIso2,
    );
    const carriedNationalDigits = extractNationalDigitsFromPhoneValue(
      phoneValue,
      currentCountry,
    );
    const nextPhoneValue = carriedNationalDigits
      ? `+${nextCountry.callingCode}${carriedNationalDigits}`
      : "";

    updatePhoneDraft(nextCountry.iso2, nextPhoneValue);
  }

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
        setPhonePhase(isPhoneVerified ? "verified" : "idle");
        setPhoneMessage(messages.settingsPhoneVerificationFailed);
        clearRecaptchaVerifier();
      },
    });

    recaptchaVerifierRef.current = verifier;
    await verifier.render();
    return verifier;
  }

  async function handleSendVerificationCode() {
    setPhoneMessage(null);
    setError(null);

    if (!firebaseConfigured) {
      setError(messages.settingsPhoneVerificationFailed);
      return;
    }

    const phoneValidation = validatePhoneNumberE164(phoneValue);
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
      setOtpTickMs(Date.now());
      setOtpResendAvailableAt(
        Date.now() + OTP_RESEND_COOLDOWN_SECONDS * 1000,
      );
      setPhoneMessage(messages.settingsPhoneVerificationSent);
    } catch (nextError) {
      const code = getErrorCode(nextError);
      if (
        code === "auth/invalid-phone-number" ||
        code === "auth/missing-phone-number"
      ) {
        setFieldErrors((current) => ({
          ...current,
          phoneNumber: messages.settingsPhoneVerificationRequired,
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
      setOtpResendAvailableAt(null);
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
          phoneCountryIso2: string | null;
          phoneCountryCallingCode: string | null;
        };
      }>;

      try {
        payload = (await response.json()) as ApiResult<{
          user: {
            phoneNumber: string | null;
            phoneVerifiedAt: string | null;
            phoneCountryIso2: string | null;
            phoneCountryCallingCode: string | null;
          };
        }>;
      } catch {
        throw new Error("PHONE_VERIFICATION_RESPONSE_INVALID");
      }

      if (!response.ok || !payload.ok) {
        if (!payload.ok && payload.error.code === "PHONE_VERIFICATION_RATE_LIMITED") {
          throw new Error("PHONE_VERIFICATION_RATE_LIMITED");
        }

        throw new Error(
          payload.ok ? "PHONE_VERIFICATION_FAILED" : payload.error.message,
        );
      }

      const persistedPhone = payload.data.user.phoneNumber ?? phoneValue;
      const persistedCountryIso2 =
        payload.data.user.phoneCountryIso2 ?? selectedPhoneCountry.iso2;
      const normalizedPersistedPhone = normalizePhoneDraftValue(persistedPhone);
      const persistedPhoneVerifiedAt =
        normalizedPersistedPhone && payload.data.user.phoneVerifiedAt
          ? payload.data.user.phoneVerifiedAt
          : null;

      setSelectedPhoneCountryIso2(
        resolveProfileCountryOption(profileCountryOptions, persistedCountryIso2).iso2,
      );
      setPhoneValue(normalizedPersistedPhone);
      setVerifiedPhoneNumber(normalizedPersistedPhone);
      setPhoneVerifiedAt(persistedPhoneVerifiedAt);
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
      const message =
        nextError instanceof Error ? nextError.message : "";

      if (
        code === "auth/invalid-verification-code" ||
        code === "auth/code-expired"
      ) {
        setError(messages.settingsPhoneVerificationInvalidCode);
      } else if (message === "PHONE_VERIFICATION_RATE_LIMITED") {
        setError(messages.settingsPhoneVerificationRetryLater);
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

  const panelClassName =
    "rounded-[1.6rem] border border-white/30 bg-white/70 p-5 shadow-[0_20px_50px_rgba(2,6,23,0.08)] backdrop-blur-xl dark:border-white/8 dark:bg-slate-950/55";
  const textFieldClassName =
    "w-full rounded-[1.25rem] border border-slate-200/80 bg-white/90 px-4 py-3.5 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.48),0_14px_28px_rgba(2,6,23,0.05)] outline-none transition focus:border-emerald-500/40 focus:bg-white dark:border-slate-700/70 dark:bg-slate-950/75 dark:focus:border-emerald-400/40";

  return (
    <section className="relative rounded-[2.5rem] border border-white/25 bg-white/65 p-6 shadow-[0_30px_90px_rgba(2,6,23,0.08)] backdrop-blur-2xl dark:border-white/8 dark:bg-slate-950/45 md:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(242,198,106,0.12),transparent_38%)]" />

      <div className="relative z-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
              <Sparkles className="h-3.5 w-3.5" />
              {messages.settingsProfileTitle}
            </span>

            <div className="space-y-2">
              <h2 className="font-[family-name:var(--font-display)] text-3xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white sm:text-[2.2rem]">
                {formTitle}
              </h2>
              <p className="max-w-2xl text-sm leading-7 text-foreground-muted">
                {formDescription}
              </p>
            </div>
          </div>

          <span
            className={`inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] ${
              isAdmin
                ? "border border-purple-500/25 bg-purple-500/10 text-purple-700 dark:border-purple-400/25 dark:bg-purple-400/10 dark:text-purple-200"
                : profileCompleted
                  ? "border border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200"
                  : "border border-amber-500/25 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200"
            }`}
          >
            {isAdmin
              ? messages.profileCompletionAdminExemptBadge
              : profileCompleted
                ? messages.profileCompletionCompleteStatus
                : messages.profileCompletionIncompleteStatus}
          </span>
        </div>

        {!isAdmin && !profileCompleted ? (
          <div className="mt-6 flex flex-col gap-3 rounded-[1.75rem] border border-amber-500/25 bg-[linear-gradient(135deg,rgba(245,158,11,0.12),rgba(255,255,255,0.72))] p-4 shadow-[0_18px_42px_rgba(245,158,11,0.12)] dark:bg-[linear-gradient(135deg,rgba(245,158,11,0.12),rgba(2,6,23,0.58))] sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/14 text-amber-700 dark:text-amber-200">
                <ShieldAlert className="h-5 w-5" />
              </span>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-zinc-950 dark:text-white">
                  {messages.profileCompletionRequiredNotice}
                </p>
                <p className="text-sm text-foreground-muted">
                  {messages.profileCompletionRequiredDetail}
                </p>
              </div>
            </div>

            <span className="inline-flex w-fit items-center rounded-full border border-amber-500/25 bg-white/70 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-700 dark:bg-slate-950/60 dark:text-amber-200">
              {missingRequirementCount} {messages.settingsCompletionRemainingLabel}
            </span>
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {requirementItems.map((item) => (
            <div
              key={item.key}
              className={`rounded-[1.35rem] border p-3.5 shadow-[0_16px_36px_rgba(2,6,23,0.06)] ${
                item.complete
                  ? "border-emerald-500/20 bg-emerald-500/8"
                  : "border-slate-200/85 bg-white/80 dark:border-slate-700/70 dark:bg-slate-950/65"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl ${
                    item.complete
                      ? "bg-emerald-500/14 text-emerald-700 dark:text-emerald-200"
                      : "bg-slate-200/80 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  }`}
                >
                  <item.icon className="h-4.5 w-4.5" />
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                    item.complete
                      ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
                      : "border border-slate-300/80 bg-white/80 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  }`}
                >
                  {item.complete
                    ? messages.settingsRequirementReady
                    : messages.settingsRequirementRequired}
                </span>
              </div>

              <p className="mt-3 text-sm font-semibold text-zinc-950 dark:text-white">
                {item.label}
              </p>
            </div>
          ))}
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit} noValidate>
          {/* Required field flow for completion-gated profiles.
              Keep this exact top-to-bottom order in this form block when making future UI changes. */}
          <div className="grid gap-4 lg:grid-cols-2">
            <label className={`${panelClassName} block space-y-2.5`}>
              <span className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
                <UserRound className="h-4.5 w-4.5 text-emerald-700 dark:text-emerald-200" />
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
                className={textFieldClassName}
                aria-invalid={fieldErrors.fullName ? "true" : "false"}
              />
              <p className="text-sm text-foreground-muted">
                {messages.settingsFullNameHint}
              </p>
              {fieldErrors.fullName ? (
                <p className="text-sm text-danger">{fieldErrors.fullName}</p>
              ) : null}
            </label>

            <label className={`${panelClassName} block space-y-2.5`}>
              <span className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
                <IdCard className="h-4.5 w-4.5 text-emerald-700 dark:text-emerald-200" />
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
                dir="ltr"
                className={textFieldClassName}
                aria-invalid={fieldErrors.universityCode ? "true" : "false"}
              />
              <p className="text-sm text-foreground-muted">
                {messages.settingsUniversityCodeHint}
              </p>
              {fieldErrors.universityCode ? (
                <p className="text-sm text-danger">{fieldErrors.universityCode}</p>
              ) : null}
            </label>
          </div>

          <section className={panelClassName}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-700 dark:text-emerald-200">
                    <Phone className="h-4.5 w-4.5" />
                  </span>
                  <span>{messages.settingsPhoneLabel}</span>
                </div>
                <p className="text-sm text-foreground-muted">
                  {messages.settingsPhoneHint}
                </p>
              </div>

              <span
                className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] ${
                  isPhoneVerified
                    ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
                    : "border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
                }`}
              >
                {isPhoneVerified
                  ? messages.settingsPhoneVerifiedBadge
                  : messages.settingsPhoneUnverifiedBadge}
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {/* Phone country and number are intentionally rendered as one row-level control pair.
                  Keep both controls on the same rhythm and visual height so the country selector and number input feel like one premium input surface. */}
              <div className="grid items-stretch gap-3 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
                <SettingsCountrySelect
                  label={messages.settingsPhoneCountryLabel}
                  labelVisuallyHidden
                  value={selectedPhoneCountry.iso2}
                  placeholder={messages.settingsPhoneCountryLabel}
                  searchPlaceholder={messages.settingsCountrySearchPlaceholder}
                  searchEmpty={messages.settingsCountrySearchEmpty}
                  options={phoneCountryOptions}
                  icon={Globe2}
                  onChange={handlePhoneCountryChange}
                />

                <div className="settings-phone-combo">
                  <span className="inline-flex shrink-0 rounded-full border border-emerald-500/15 bg-emerald-500/8 px-3 py-1 text-sm font-semibold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
                    +{selectedPhoneCountry.callingCode}
                  </span>

                  <PhoneNumberInput
                    country={selectedPhoneCountry.iso2 as Country}
                    international={false}
                    value={phoneInputValue}
                    onChange={(nextValue) => {
                      updatePhoneDraft(
                        selectedPhoneCountry.iso2,
                        nextValue ?? "",
                      );
                    }}
                    placeholder={messages.settingsPhonePlaceholder}
                    autoComplete="tel-national"
                    inputMode="tel"
                    maxLength={maxPhoneNationalDigits}
                    dir="ltr"
                    className="w-full min-w-0 border-0 bg-transparent p-0 text-sm text-foreground outline-none placeholder:text-foreground-muted"
                    aria-invalid={fieldErrors.phoneNumber ? "true" : "false"}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
                {phonePreview ? (
                  <span className="inline-flex items-center rounded-full border border-slate-300/80 bg-white/80 px-3 py-1 font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    {phonePreview}
                  </span>
                ) : null}
                {phoneVerifiedAt ? (
                  <span className="inline-flex items-center rounded-full border border-emerald-500/18 bg-emerald-500/10 px-3 py-1 font-medium text-emerald-700 dark:border-emerald-400/18 dark:bg-emerald-400/10 dark:text-emerald-200">
                    {messages.settingsPhoneVerifiedBadge}
                  </span>
                ) : null}
              </div>

              {fieldErrors.phoneNumber ? (
                <p className="text-sm text-danger">{fieldErrors.phoneNumber}</p>
              ) : null}
            </div>

          </section>

          <section className={`${panelClassName} space-y-4`}>
            <div ref={recaptchaContainerRef} className="min-h-[1px]" aria-hidden="true" />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-zinc-950 dark:text-white">
                  {messages.settingsPhoneCodeLabel}
                </p>
                <p className="text-xs text-foreground-muted">
                  {messages.settingsPhoneCodeHint}
                </p>
                {otpDeliveryStateVisible ? (
                  <div className="mt-2 inline-flex items-center rounded-full border border-slate-300/80 bg-white/85 px-3 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900/85 dark:text-slate-200">
                    {otpResendRemainingSeconds > 0
                      ? `${messages.settingsPhoneOtpWaitingLabel} ${otpResendCountdownText}`
                      : otpResendCountdownText}
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => void handleSendVerificationCode()}
                disabled={
                  !firebaseConfigured ||
                  !phoneValue ||
                  phonePhase === "sending" ||
                  phonePhase === "verifying" ||
                  otpResendLocked
                }
                className="action-button justify-center"
              >
                {phonePhase === "sending" ? (
                  <span className="inline-flex items-center gap-2">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    {messages.loading}
                  </span>
                ) : phonePhase === "code_sent" || phonePhase === "verified" ? (
                  messages.settingsPhoneResendCodeAction
                ) : (
                  messages.settingsPhoneSendCodeAction
                )}
              </button>
            </div>

            {otpInputVisible ? (
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label className="block space-y-2">
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-foreground-muted">
                    {messages.settingsPhoneCodeLabel}
                  </span>
                  <input
                    id="settings-phone-otp-code"
                    name="settings-phone-otp-code"
                    type="text"
                    value={otpCode}
                    onChange={(event) =>
                      setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder={messages.settingsPhoneCodePlaceholder}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={6}
                    dir="ltr"
                    className={textFieldClassName}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void handleConfirmVerificationCode()}
                  disabled={phonePhase === "verifying"}
                  className="action-button justify-center"
                >
                  {phonePhase === "verifying" ? (
                    <span className="inline-flex items-center gap-2">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      {messages.loading}
                    </span>
                  ) : (
                    messages.settingsPhoneVerifyCodeAction
                  )}
                </button>
              </div>
            ) : null}

            {!firebaseConfigured ? (
              <p className="text-sm text-danger">
                {messages.settingsPhoneVerificationFailed}
              </p>
            ) : null}

            {phoneMessage ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-300">
                {phoneMessage}
              </p>
            ) : null}
          </section>

          <div className={panelClassName}>
            <SettingsCountrySelect
              label={messages.settingsNationalityLabel}
              value={nationality}
              placeholder={messages.settingsNationalityPlaceholder}
              searchPlaceholder={messages.settingsCountrySearchPlaceholder}
              searchEmpty={messages.settingsCountrySearchEmpty}
              options={nationalityOptions}
              icon={Globe2}
              onChange={(nextValue) => {
                setNationality(nextValue);
                clearFieldError("nationality");
              }}
              error={fieldErrors.nationality}
            />
            <p className="mt-2 text-sm text-foreground-muted">
              {messages.settingsNationalityHint}
            </p>
          </div>

          {error ? (
            <div className="rounded-[1.4rem] border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-700 shadow-[0_14px_34px_rgba(239,68,68,0.08)] dark:text-red-300">
              {error}
            </div>
          ) : null}

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-foreground-muted">
              {isAdmin
                ? messages.settingsSelfProfileSubtitle
                : messages.profileCompletionRequiredDetail}
            </p>

            <button
              type="submit"
              disabled={busy}
              className="action-button min-w-[14rem] justify-center"
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  {messages.loading}
                </span>
              ) : (
                submitLabel
              )}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}