"use client";

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
  Globe2,
  IdCard,
  LoaderCircle,
  Phone,
  ShieldAlert,
  Sparkles,
  UserRound,
  VenusAndMars,
  type LucideIcon,
} from "lucide-react";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

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

type ProfileSaveFeedbackTone = "idle" | "pending" | "success" | "error";

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
          key: "gender",
          label: messages.settingsGenderLabel,
          icon: VenusAndMars,
          complete: validateUserGender(gender).ok,
        },
        {
          key: "phoneNumber",
          label: messages.settingsPhoneLabel,
          icon: Phone,
          complete: phoneValidation.ok,
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
      messages.settingsFullNameLabel,
      messages.settingsGenderLabel,
      messages.settingsNationalityLabel,
      messages.settingsPhoneLabel,
      messages.settingsUniversityCodeLabel,
      gender,
      nationality,
      phoneValidation.ok,
      universityCode,
    ],
  );

  const missingRequirementCount = requirementItems.filter((item) => !item.complete).length;

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
    "rounded-[1.6rem] border border-white/30 bg-white/70 p-5 shadow-[0_20px_50px_rgba(2,6,23,0.08)] backdrop-blur-xl dark:border-white/8 dark:bg-slate-950/55";
  const textFieldClassName =
    "w-full rounded-[1.25rem] border border-slate-200/80 bg-white/90 px-4 py-3.5 text-sm text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.48),0_14px_28px_rgba(2,6,23,0.05)] outline-none transition focus:border-emerald-500/40 focus:bg-white dark:border-slate-700/70 dark:bg-slate-950/75 dark:focus:border-emerald-400/40";

  return (
    <section className="relative rounded-[2.5rem] border border-white/25 bg-white/65 p-6 shadow-[0_30px_90px_rgba(2,6,23,0.08)] backdrop-blur-2xl dark:border-white/8 dark:bg-slate-950/45 md:p-8 lg:p-9">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(242,198,106,0.12),transparent_38%)]" />

      <div className="relative z-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
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

        <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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

        <form className="mt-9 space-y-7" onSubmit={handleSubmit} noValidate>
          {/* Required field flow for completion-gated profiles.
              Keep this exact top-to-bottom order in this form block when making future UI changes. */}
          <div className="grid gap-5 lg:grid-cols-2">
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
              <span className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-white">
                <IdCard className="h-4.5 w-4.5 text-emerald-700 dark:text-emerald-200" />
                {messages.settingsUniversityCodeLabel}
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
                  phoneValidation.ok
                    ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200"
                    : "border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"
                }`}
              >
                {phoneValidation.ok
                  ? messages.settingsRequirementReady
                  : messages.settingsRequirementRequired}
              </span>
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
                {phoneValidation.ok ? (
                  <span className="inline-flex items-center rounded-full border border-emerald-500/18 bg-emerald-500/10 px-3 py-1 font-medium text-emerald-700 dark:border-emerald-400/18 dark:bg-emerald-400/10 dark:text-emerald-200">
                    {messages.settingsRequirementReady}
                  </span>
                ) : null}
              </div>

              {fieldErrors.phoneNumber ? (
                <p className="text-sm text-danger">{fieldErrors.phoneNumber}</p>
              ) : null}
            </div>
          </section>

          <div className={panelClassName}>
            <SettingsCountrySelect
              label={messages.settingsGenderLabel}
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
