"use client";

import { APP_ROUTES } from "@zootopia/shared-config";
import type {
  ApiResult,
  Locale,
  UpdateUserProfileResponse,
  UserGender,
  UserProfileFieldErrors,
} from "@zootopia/shared-types";
import {
  validatePhoneNumberE164,
  validateRequiredUserProfile,
  validateUserGender,
} from "@zootopia/shared-utils";
import {
  Check,
  Globe2,
  IdCard,
  LoaderCircle,
  Phone,
  Sparkles,
  UserRound,
  VenusAndMars,
} from "lucide-react";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import {
  SettingsCountrySelect,
  type SettingsSelectOption,
} from "@/components/settings/settings-country-select";
import {
  buildProfileCountryOptions,
  DEFAULT_PHONE_COUNTRY_ISO2,
  findProfileCountryOptionByCanonicalLabel,
  resolveProfileCountryOption,
  type ProfileCountryOption,
} from "@/lib/profile-country-options";
import type { AppMessages } from "@/lib/messages";

const SETTINGS_PHONE_MAX_DIGITS = 18;

type ProfileSettingsFormProps = {
  messages: AppMessages;
  locale: Locale;
  initialFullName: string;
  initialUniversityCode: string;
  initialPhoneNumber: string;
  initialPhoneCountryIso2: string | null;
  initialGender: string;
  initialNationality: string;
  returnTo: string | null;
  profileCompleted: boolean;
  isAdmin?: boolean;
};

type ProfileSaveFeedbackTone = "idle" | "pending" | "success" | "warning" | "error";

type SavedFieldSnapshot = {
  fullName: string;
  universityCode: string;
  phoneNumber: string;
  phoneCountryIso2: string;
  gender: UserGender | "";
  nationality: string;
};

function buildProfileTransitionText(locale: Locale) {
  if (locale === "ar") {
    return {
      capacityAvailable:
        "اكتمل ملفك الشخصي الآن، وأصبح حسابك خاضعاً لنظام الإتاحة والسعة المعتاد في المنصة.",
      capacityFull:
        "اكتمل ملفك الشخصي الآن، وأصبح حسابك خاضعاً لنظام الإتاحة والسعة المعتاد في المنصة. السعة ممتلئة حالياً، وسنعيدك إلى تسجيل الدخول لتجربة الدخول عند توفر مقعد.",
      admissionUnavailable:
        "اكتمل ملفك الشخصي الآن، وأصبح حسابك خاضعاً لنظام الإتاحة والسعة المعتاد في المنصة. تعذر تأكيد حالة الإتاحة حالياً، لذا سجّل الدخول مرة أخرى بعد قليل.",
    };
  }

  return {
    capacityAvailable:
      "Your profile is now complete, and your account now follows the platform's normal admission and capacity rules.",
    capacityFull:
      "Your profile is now complete, and your account now follows the platform's normal admission and capacity rules. Capacity is full right now, so we'll return you to login to try again when a slot opens.",
    admissionUnavailable:
      "Your profile is now complete, and your account now follows the platform's normal admission and capacity rules. We could not confirm availability right now, so please sign in again in a moment.",
  };
}

function normalizeTextValue(value: string) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizePhoneForCompare(value: string | null | undefined) {
  return String(value || "").trim().replace(/\s+/g, "");
}

/* Coerce any stored phone string into a safe `+<digits>` E.164 draft.
   Only digits and a leading `+` are kept. National-digit strings are merged
   with the fallback country calling code when available. */
function normalizePhoneDraftValue(
  value: string | null | undefined,
  fallbackCountryCallingCode?: string,
): string {
  const raw = normalizePhoneForCompare(value);
  if (!raw) return "";

  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(/\D/g, "");
    if (!digits) return "";
    return `+${digits.slice(0, SETTINGS_PHONE_MAX_DIGITS)}`;
  }

  const nationalDigits = raw.replace(/\D/g, "");
  if (!fallbackCountryCallingCode || !nationalDigits) return "";

  const merged = `${fallbackCountryCallingCode}${nationalDigits}`.replace(/\D/g, "");
  if (!merged) return "";
  return `+${merged.slice(0, SETTINGS_PHONE_MAX_DIGITS)}`;
}

function buildCountryFieldOptions(
  options: ProfileCountryOption[],
  currentValue: string,
): SettingsSelectOption[] {
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
  ];
}

function buildPhoneCountryOptions(options: ProfileCountryOption[]): SettingsSelectOption[] {
  return options.map((option) => ({
    value: option.iso2,
    label: option.label,
    description:
      option.canonicalLabel !== option.label ? option.canonicalLabel : undefined,
    badge: `+${option.callingCode}`,
    leadingVisual: option.flag,
    searchTokens: option.searchTokens,
  }));
}

function buildGenderOptions(messages: AppMessages): SettingsSelectOption[] {
  return [
    {
      value: "male",
      label: messages.settingsGenderOptionMale,
      searchTokens: ["male"],
    },
    {
      value: "female",
      label: messages.settingsGenderOptionFemale,
      searchTokens: ["female"],
    },
    {
      value: "prefer_not_to_say",
      label: messages.settingsGenderOptionPreferNotToSay,
      searchTokens: ["prefer not to say", "prefer_not_to_say"],
    },
  ];
}

function extractNationalDigitsFromPhoneValue(
  value: string,
  currentCountry: ProfileCountryOption,
): string {
  const digits = normalizePhoneForCompare(value).replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith(currentCountry.callingCode)
    ? digits.slice(currentCountry.callingCode.length)
    : digits;
}

function resolveInitialPhoneCountryIso2(
  initialPhoneNumber: string,
  initialPhoneCountryIso2: string | null,
  options: ProfileCountryOption[],
): string {
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
      .sort((a, b) => b.callingCode.length - a.callingCode.length)
      .find((option) => digits.startsWith(option.callingCode));
    if (matchedOption) return matchedOption.iso2;
  }

  return resolveProfileCountryOption(options, DEFAULT_PHONE_COUNTRY_ISO2).iso2;
}

function formatPhonePreview(phoneValue: string): string {
  if (!phoneValue || !phoneValue.startsWith("+")) return phoneValue;
  try {
    const parsed = parsePhoneNumberFromString(phoneValue);
    return parsed ? parsed.formatInternational() : phoneValue;
  } catch {
    return phoneValue;
  }
}

function buildSavedFieldSnapshot(input: {
  fullName: string;
  universityCode: string;
  phoneNumber: string;
  phoneCountryIso2: string;
  gender: string;
  nationality: string;
}): SavedFieldSnapshot {
  const normalizedPhone = normalizePhoneDraftValue(input.phoneNumber);
  const phoneValidation = validatePhoneNumberE164(normalizedPhone);
  const genderValidation = validateUserGender(input.gender);

  return {
    fullName: normalizeTextValue(input.fullName),
    universityCode: normalizeTextValue(input.universityCode),
    phoneNumber: phoneValidation.ok
      ? normalizePhoneForCompare(phoneValidation.value)
      : "",
    phoneCountryIso2: input.phoneCountryIso2,
    gender: genderValidation.ok ? genderValidation.value : "",
    nationality: normalizeTextValue(input.nationality),
  };
}

function FieldSavedIndicator(input: {
  isSaved: boolean;
  a11yLabel: string;
}) {
  if (!input.isSaved) {
    return null;
  }

  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
      <Check className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">{input.a11yLabel}</span>
    </span>
  );
}

export function ProfileSettingsForm({
  messages,
  locale,
  initialFullName,
  initialUniversityCode,
  initialPhoneNumber,
  initialPhoneCountryIso2,
  initialGender,
  initialNationality,
  returnTo,
  profileCompleted,
  isAdmin = false,
}: ProfileSettingsFormProps) {
  const router = useRouter();
  const redirectTimerRef = useRef<number | null>(null);

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

  const [selectedPhoneCountryIso2, setSelectedPhoneCountryIso2] = useState(
    defaultPhoneCountryIso2,
  );
  const [phoneValue, setPhoneValue] = useState(
    normalizePhoneDraftValue(initialPhoneNumber),
  );
  const [fullName, setFullName] = useState(initialFullName);
  const [universityCode, setUniversityCode] = useState(initialUniversityCode);
  const [gender, setGender] = useState(initialGender);
  const [nationality, setNationality] = useState(initialNationality);
  const [busy, setBusy] = useState(false);
  const [, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<UserProfileFieldErrors>({});
  const [saveFeedback, setSaveFeedback] = useState<{
    tone: ProfileSaveFeedbackTone;
    message: string | null;
  }>({
    tone: "idle",
    message: null,
  });

  const selectedPhoneCountry = useMemo(
    () => resolveProfileCountryOption(profileCountryOptions, selectedPhoneCountryIso2),
    [profileCountryOptions, selectedPhoneCountryIso2],
  );

  const maxPhoneNationalDigits = useMemo(
    () => Math.max(1, SETTINGS_PHONE_MAX_DIGITS - selectedPhoneCountry.callingCode.length),
    [selectedPhoneCountry.callingCode],
  );

  const phoneNationalDisplay = useMemo(() => {
    if (!phoneValue || !phoneValue.startsWith("+")) return "";
    const digits = phoneValue.slice(1).replace(/\D/g, "");
    return digits.startsWith(selectedPhoneCountry.callingCode)
      ? digits.slice(selectedPhoneCountry.callingCode.length)
      : digits;
  }, [phoneValue, selectedPhoneCountry.callingCode]);

  const phoneValidation = useMemo(
    () => validatePhoneNumberE164(phoneValue),
    [phoneValue],
  );

  const phoneCountryOptions = useMemo(
    () => buildPhoneCountryOptions(profileCountryOptions),
    [profileCountryOptions],
  );

  const nationalityOptions = useMemo(
    () => buildCountryFieldOptions(profileCountryOptions, nationality),
    [nationality, profileCountryOptions],
  );

  const genderOptions = useMemo(
    () => buildGenderOptions(messages),
    [messages],
  );

  const transitionText = useMemo(
    () => buildProfileTransitionText(locale),
    [locale],
  );

  const phonePreview = useMemo(() => formatPhonePreview(phoneValue), [phoneValue]);

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

  /* Keep a local snapshot of the last persisted profile values so each field can expose
     compact saved-state checks without reintroducing heavyweight completion summary cards. */
  const [savedSnapshot, setSavedSnapshot] = useState<SavedFieldSnapshot>(() =>
    buildSavedFieldSnapshot({
      fullName: initialFullName,
      universityCode: initialUniversityCode,
      phoneNumber: initialPhoneNumber,
      phoneCountryIso2: defaultPhoneCountryIso2,
      gender: initialGender,
      nationality: initialNationality,
    }),
  );

  useEffect(() => {
    setSavedSnapshot(
      buildSavedFieldSnapshot({
        fullName: initialFullName,
        universityCode: initialUniversityCode,
        phoneNumber: initialPhoneNumber,
        phoneCountryIso2: defaultPhoneCountryIso2,
        gender: initialGender,
        nationality: initialNationality,
      }),
    );
  }, [
    defaultPhoneCountryIso2,
    initialFullName,
    initialGender,
    initialNationality,
    initialPhoneNumber,
    initialUniversityCode,
  ]);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current !== null) {
        window.clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  const normalizedFullName = useMemo(() => normalizeTextValue(fullName), [fullName]);
  const normalizedUniversityCode = useMemo(
    () => normalizeTextValue(universityCode),
    [universityCode],
  );
  const normalizedNationality = useMemo(
    () => normalizeTextValue(nationality),
    [nationality],
  );
  const genderValidation = useMemo(() => validateUserGender(gender), [gender]);
  const normalizedPhone = phoneValidation.ok
    ? normalizePhoneForCompare(phoneValidation.value)
    : "";

  const fullNameIsSaved =
    normalizedFullName.length > 0 && normalizedFullName === savedSnapshot.fullName;
  const universityCodeIsSaved =
    normalizedUniversityCode.length > 0 &&
    normalizedUniversityCode === savedSnapshot.universityCode;
  const phoneIsSaved =
    normalizedPhone === savedSnapshot.phoneNumber &&
    selectedPhoneCountry.iso2 === savedSnapshot.phoneCountryIso2 &&
    (normalizedPhone.length > 0 || isAdmin);
  const genderIsSaved =
    genderValidation.ok && genderValidation.value === savedSnapshot.gender;
  const nationalityIsSaved =
    normalizedNationality.length > 0 &&
    normalizedNationality === savedSnapshot.nationality;

  function clearFieldError(field: keyof UserProfileFieldErrors) {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      return { ...current, [field]: undefined };
    });
  }

  function resetSaveFeedback() {
    setError(null);
    setSaveFeedback((current) =>
      current.tone === "idle"
        ? current
        : { tone: "idle", message: null },
    );
  }

  function scheduleRedirect(nextUrl: string, refreshAfterReplace: boolean) {
    if (redirectTimerRef.current !== null) {
      window.clearTimeout(redirectTimerRef.current);
    }

    redirectTimerRef.current = window.setTimeout(() => {
      router.replace(nextUrl);
      if (refreshAfterReplace) {
        router.refresh();
      }
    }, 1_500);
  }

  function handleNationalDigitsChange(rawInput: string) {
    const nationalDigits = rawInput.replace(/\D/g, "").slice(0, maxPhoneNationalDigits);
    const nextPhoneValue = nationalDigits
      ? `+${selectedPhoneCountry.callingCode}${nationalDigits}`
      : "";

    if (nextPhoneValue === phoneValue) return;

    setPhoneValue(nextPhoneValue);
    resetSaveFeedback();
    clearFieldError("phoneNumber");
  }

  function handlePhoneCountryChange(nextCountryIso2: string) {
    const nextCountry = resolveProfileCountryOption(profileCountryOptions, nextCountryIso2);
    if (nextCountry.iso2 === selectedPhoneCountryIso2) return;

    const carriedDigits = extractNationalDigitsFromPhoneValue(
      phoneValue,
      selectedPhoneCountry,
    );
    const nextPhoneValue = carriedDigits
      ? `+${nextCountry.callingCode}${carriedDigits}`
      : "";

    setSelectedPhoneCountryIso2(nextCountry.iso2);
    setPhoneValue(nextPhoneValue);
    resetSaveFeedback();
    clearFieldError("phoneNumber");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaveFeedback({
      tone: "pending",
      message: messages.settingsProfileSavePendingStatus,
    });

    const validation = validateRequiredUserProfile({
      fullName,
      universityCode,
      gender,
      nationality,
    });

    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors);
      setError(validation.message);
      setSaveFeedback({
        tone: "error",
        message: validation.message,
      });
      setBusy(false);
      return;
    }

    const requiresPhone = !isAdmin || phoneValue.length > 0;
    if (requiresPhone && !phoneValidation.ok) {
      setFieldErrors((current) => ({
        ...current,
        phoneNumber: phoneValidation.error,
      }));
      setError(phoneValidation.error);
      setSaveFeedback({
        tone: "error",
        message: phoneValidation.error,
      });
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
         Keep the target account derived from the server session and never add a
         client-supplied uid to this payload or URL. */
      const response = await fetch(targetUrl, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          fullName: validation.value.fullName,
          universityCode: validation.value.universityCode,
          gender: validation.value.gender,
          nationality: validation.value.nationality,
          phoneNumber: phoneValidation.ok ? phoneValidation.value : null,
          phoneCountryIso2: phoneValidation.ok ? selectedPhoneCountry.iso2 : null,
          phoneCountryCallingCode: phoneValidation.ok
            ? selectedPhoneCountry.callingCode
            : null,
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

      setSavedSnapshot({
        fullName: validation.value.fullName,
        universityCode: validation.value.universityCode,
        phoneNumber: phoneValidation.ok
          ? normalizePhoneForCompare(phoneValidation.value)
          : "",
        phoneCountryIso2: selectedPhoneCountry.iso2,
        gender: validation.value.gender,
        nationality: validation.value.nationality,
      });

      const completionTransition = payload.data.completionTransition;
      if (completionTransition?.becameEligible) {
        if (completionTransition.admissionState === "capacity_full") {
          const loginUrl = new URL(APP_ROUTES.login, window.location.origin);
          if (payload.data.user.email) {
            loginUrl.searchParams.set("email", payload.data.user.email);
          }
          loginUrl.searchParams.set("profileTransition", "1");
          loginUrl.searchParams.set("profileTransitionState", "capacity_full");

          setSaveFeedback({
            tone: "warning",
            message: transitionText.capacityFull,
          });
          scheduleRedirect(
            `${loginUrl.pathname}${loginUrl.search}`,
            false,
          );
          return;
        }

        if (completionTransition.admissionState === "admission_unavailable") {
          const loginUrl = new URL(APP_ROUTES.login, window.location.origin);
          if (payload.data.user.email) {
            loginUrl.searchParams.set("email", payload.data.user.email);
          }
          loginUrl.searchParams.set("profileTransition", "1");
          loginUrl.searchParams.set("profileTransitionState", "admission_unavailable");

          setSaveFeedback({
            tone: "warning",
            message: transitionText.admissionUnavailable,
          });
          scheduleRedirect(
            `${loginUrl.pathname}${loginUrl.search}`,
            false,
          );
          return;
        }

        setSaveFeedback({
          tone: "success",
          message: transitionText.capacityAvailable,
        });
        scheduleRedirect(payload.data.redirectTo, true);
        return;
      }

      setSaveFeedback({
        tone: "success",
        message: messages.settingsProfileSaveSuccessStatus,
      });

      router.replace(payload.data.redirectTo);
      router.refresh();
    } catch (nextError) {
      const failureMessage =
        nextError instanceof Error
          ? nextError.message
          : messages.profileCompletionSaveFailed;

      setError(
        failureMessage,
      );
      setSaveFeedback({
        tone: "error",
        message: failureMessage,
      });
    } finally {
      setBusy(false);
    }
  }

  const panelClassName =
    "rounded-[1.35rem] border border-white/24 bg-white/64 p-4 shadow-[0_16px_40px_rgba(2,6,23,0.07)] backdrop-blur-xl dark:border-white/8 dark:bg-slate-950/48";
  const textFieldClassName =
    "w-full rounded-[1.15rem] border border-slate-200/80 bg-white/90 px-4 py-3 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.48),0_12px_24px_rgba(2,6,23,0.05)] outline-none transition focus:border-emerald-500/40 focus:bg-white dark:border-slate-700/70 dark:bg-slate-950/75 dark:focus:border-emerald-400/40";

  return (
    <section className="relative rounded-[2rem] border border-white/24 bg-white/56 p-5 shadow-[0_24px_72px_rgba(2,6,23,0.08)] backdrop-blur-2xl dark:border-white/8 dark:bg-slate-950/38 md:p-6 lg:p-7">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(242,198,106,0.12),transparent_38%)]" />

      <div className="relative z-10">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">
              <Sparkles className="h-3.5 w-3.5" />
              {messages.settingsProfileTitle}
            </span>

            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
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

          <div className="space-y-1.5">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white sm:text-[2rem]">
              {formTitle}
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-foreground-muted">
              {formDescription}
            </p>
          </div>
        </div>

        <form className="mt-6 space-y-6" onSubmit={handleSubmit} noValidate>
          {/* Required field flow for completion-gated profiles.
              Keep this exact top-to-bottom order in this form block when making future UI changes. */}
          <div className="grid gap-5 lg:grid-cols-2">
            <label className={`${panelClassName} block space-y-2.5`}>
              <span className="flex items-center justify-between gap-3 text-sm font-semibold text-zinc-950 dark:text-white">
                <span className="inline-flex items-center gap-2">
                  <UserRound className="h-4.5 w-4.5 text-emerald-700 dark:text-emerald-200" />
                  {messages.settingsFullNameLabel}
                </span>
                <FieldSavedIndicator
                  isSaved={fullNameIsSaved}
                  a11yLabel={messages.settingsProfileSaveSuccessStatus}
                />
              </span>
              <input
                type="text"
                value={fullName}
                onChange={(event) => {
                  setFullName(event.target.value);
                  resetSaveFeedback();
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
              <span className="flex items-center justify-between gap-3 text-sm font-semibold text-zinc-950 dark:text-white">
                <span className="inline-flex items-center gap-2">
                  <IdCard className="h-4.5 w-4.5 text-emerald-700 dark:text-emerald-200" />
                  {messages.settingsUniversityCodeLabel}
                </span>
                <FieldSavedIndicator
                  isSaved={universityCodeIsSaved}
                  a11yLabel={messages.settingsProfileSaveSuccessStatus}
                />
              </span>
              <input
                type="text"
                value={universityCode}
                onChange={(event) => {
                  setUniversityCode(event.target.value);
                  resetSaveFeedback();
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
            <div className="flex items-start justify-between gap-3">
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
              <FieldSavedIndicator
                isSaved={phoneIsSaved}
                a11yLabel={messages.settingsProfileSaveSuccessStatus}
              />
            </div>

            <div className="mt-5 space-y-3">
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

                  <input
                    type="tel"
                    value={phoneNationalDisplay}
                    onChange={(event) => handleNationalDigitsChange(event.target.value)}
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
              </div>

              {fieldErrors.phoneNumber ? (
                <p className="text-sm text-danger">{fieldErrors.phoneNumber}</p>
              ) : null}
            </div>
          </section>

          <div className={panelClassName}>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
                <VenusAndMars className="h-4.5 w-4.5 text-emerald-700 dark:text-emerald-200" />
                {messages.settingsGenderLabel}
              </span>
              <FieldSavedIndicator
                isSaved={genderIsSaved}
                a11yLabel={messages.settingsProfileSaveSuccessStatus}
              />
            </div>
            <SettingsCountrySelect
              label={messages.settingsGenderLabel}
              labelVisuallyHidden
              value={gender}
              placeholder={messages.settingsGenderPlaceholder}
              searchPlaceholder={messages.settingsGenderSearchPlaceholder}
              searchEmpty={messages.settingsGenderSearchEmpty}
              options={genderOptions}
              icon={VenusAndMars}
              onChange={(nextValue) => {
                setGender(nextValue as UserGender);
                resetSaveFeedback();
                clearFieldError("gender");
              }}
              error={fieldErrors.gender}
            />
            <p className="mt-2 text-sm text-foreground-muted">
              {messages.settingsGenderHint}
            </p>
          </div>

          <div className={panelClassName}>
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
                <Globe2 className="h-4.5 w-4.5 text-emerald-700 dark:text-emerald-200" />
                {messages.settingsNationalityLabel}
              </span>
              <FieldSavedIndicator
                isSaved={nationalityIsSaved}
                a11yLabel={messages.settingsProfileSaveSuccessStatus}
              />
            </div>
            <SettingsCountrySelect
              label={messages.settingsNationalityLabel}
              labelVisuallyHidden
              value={nationality}
              placeholder={messages.settingsNationalityPlaceholder}
              searchPlaceholder={messages.settingsCountrySearchPlaceholder}
              searchEmpty={messages.settingsCountrySearchEmpty}
              options={nationalityOptions}
              icon={Globe2}
              onChange={(nextValue) => {
                setNationality(nextValue);
                resetSaveFeedback();
                clearFieldError("nationality");
              }}
              error={fieldErrors.nationality}
            />
            <p className="mt-2 text-sm text-foreground-muted">
              {messages.settingsNationalityHint}
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <p className="text-sm text-foreground-muted">
                {isAdmin
                  ? messages.settingsSelfProfileSubtitle
                  : messages.profileCompletionRequiredDetail}
              </p>
              {/* Keep save feedback adjacent to the action rail so submit truth stays visible
                  without forcing users to scan to a distant alert region. */}
              {saveFeedback.tone !== "idle" && saveFeedback.message ? (
                <p
                  className={`inline-flex max-w-full items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                    saveFeedback.tone === "success"
                      ? "border-emerald-500/22 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/22 dark:bg-emerald-400/10 dark:text-emerald-200"
                      : saveFeedback.tone === "warning"
                        ? "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200"
                      : saveFeedback.tone === "error"
                        ? "border-red-500/22 bg-red-500/10 text-red-700 dark:border-red-400/22 dark:bg-red-400/10 dark:text-red-200"
                        : "border-blue-500/22 bg-blue-500/10 text-blue-700 dark:border-blue-400/22 dark:bg-blue-400/10 dark:text-blue-200"
                  }`}
                >
                  {saveFeedback.tone === "pending" ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : null}
                  <span>{saveFeedback.message}</span>
                </p>
              ) : null}
            </div>

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
