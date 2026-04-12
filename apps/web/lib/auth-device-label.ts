import type {
  UserClientBestEffortNetworkMetadata,
  UserClientBestEffortScreenMetadata,
  UserClientBestEffortSignInMetadata,
  UserClientBestEffortUserAgentDataHints,
  UserClientBestEffortViewportMetadata,
} from "@zootopia/shared-types";

type AuthDeviceLabelMetadata = {
  deviceLabel: string | null;
  deviceLabelSource: string | null;
  deviceLabelConfidence: number | null;
  clientBestEffortSignInMetadata: UserClientBestEffortSignInMetadata | null;
  clientBestEffortSignInMetadataJson: string | null;
};

type UserAgentDataBrand = {
  brand?: unknown;
  version?: unknown;
};

type NavigatorUserAgentDataLike = {
  brands?: UserAgentDataBrand[];
  mobile?: unknown;
  platform?: unknown;
  getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
};

type NavigatorConnectionLike = {
  effectiveType?: unknown;
  downlink?: unknown;
  rtt?: unknown;
  saveData?: unknown;
};

type NavigatorWithBestEffortHints = Navigator & {
  userAgentData?: NavigatorUserAgentDataLike;
  deviceMemory?: unknown;
  connection?: NavigatorConnectionLike;
};

const DEVICE_LABEL_SOURCE = "navigator.userAgent";
const DEVICE_LABEL_MAX_LENGTH = 120;
const CLIENT_STRING_MAX_LENGTH = 512;
const CLIENT_USER_AGENT_MAX_LENGTH = 1024;
const CLIENT_METADATA_JSON_MAX_LENGTH = 12_000;

function normalizeString(value: unknown, maxLength = CLIENT_STRING_MAX_LENGTH) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function normalizeStringArray(value: unknown, maxItems = 8, maxLength = 120) {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized = value
    .map((entry) => normalizeString(entry, maxLength))
    .filter((entry): entry is string => entry !== null)
    .slice(0, maxItems);

  return normalized.length > 0 ? normalized : null;
}

function normalizeFiniteNumber(
  value: unknown,
  options: {
    min?: number;
    max?: number;
    precision?: number;
  } = {},
) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (typeof options.min === "number" && parsed < options.min) {
    return null;
  }

  if (typeof options.max === "number" && parsed > options.max) {
    return null;
  }

  if (typeof options.precision === "number") {
    return Number(parsed.toFixed(options.precision));
  }

  return parsed;
}

function normalizeBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function detectBrowser(userAgent: string) {
  if (/Edg\//i.test(userAgent)) {
    return "Edge";
  }

  if (/OPR\//i.test(userAgent) || /Opera/i.test(userAgent)) {
    return "Opera";
  }

  if (/SamsungBrowser\//i.test(userAgent)) {
    return "Samsung Internet";
  }

  if (/Chrome\//i.test(userAgent) || /CriOS\//i.test(userAgent)) {
    return "Chrome";
  }

  if (/Firefox\//i.test(userAgent) || /FxiOS\//i.test(userAgent)) {
    return "Firefox";
  }

  if (
    /Safari\//i.test(userAgent)
    && !/Chrome\//i.test(userAgent)
    && !/CriOS\//i.test(userAgent)
  ) {
    return "Safari";
  }

  return null;
}

function detectOperatingSystem(userAgent: string) {
  if (/iPhone|iPad|iPod/i.test(userAgent)) {
    return "iOS";
  }

  if (/Android/i.test(userAgent)) {
    return "Android";
  }

  if (/Windows NT/i.test(userAgent)) {
    return "Windows";
  }

  if (/Macintosh|Mac OS X/i.test(userAgent)) {
    return "macOS";
  }

  if (/CrOS/i.test(userAgent)) {
    return "ChromeOS";
  }

  if (/Linux/i.test(userAgent)) {
    return "Linux";
  }

  return null;
}

function detectFormFactor(userAgent: string) {
  if (/iPad|Tablet/i.test(userAgent)) {
    return "Tablet";
  }

  if (/Mobi|iPhone|Android/i.test(userAgent)) {
    return "Mobile";
  }

  return "Desktop";
}

function computeDeviceLabelConfidence(input: {
  browser: string | null;
  operatingSystem: string | null;
  formFactor: string;
}) {
  if (!input.browser && !input.operatingSystem) {
    return null;
  }

  if (input.browser && input.operatingSystem) {
    return input.formFactor === "Desktop" ? 0.72 : 0.8;
  }

  return 0.46;
}

async function readUserAgentDataHints(
  userAgentData: NavigatorUserAgentDataLike | undefined,
) {
  const brands = normalizeStringArray(
    userAgentData?.brands?.map((brand) => {
      const normalizedBrand = normalizeString(brand.brand, 120);
      const normalizedVersion = normalizeString(brand.version, 64);

      if (!normalizedBrand) {
        return null;
      }

      return normalizedVersion
        ? `${normalizedBrand} ${normalizedVersion}`
        : normalizedBrand;
    }),
    8,
    200,
  );

  const baseHints = {
    brands,
    mobile: normalizeBoolean(userAgentData?.mobile),
    platform: normalizeString(userAgentData?.platform, 120),
    architecture: null,
    bitness: null,
    model: null,
    platformVersion: null,
    uaFullVersion: null,
    wow64: null,
    fullVersionList: null,
  } satisfies UserClientBestEffortUserAgentDataHints;

  if (!userAgentData?.getHighEntropyValues) {
    return baseHints;
  }

  try {
    const highEntropyValues = await userAgentData.getHighEntropyValues([
      "architecture",
      "bitness",
      "model",
      "platformVersion",
      "uaFullVersion",
      "wow64",
      "fullVersionList",
    ]);

    return {
      ...baseHints,
      architecture: normalizeString(highEntropyValues.architecture, 64),
      bitness: normalizeString(highEntropyValues.bitness, 16),
      model: normalizeString(highEntropyValues.model, 120),
      platformVersion: normalizeString(highEntropyValues.platformVersion, 64),
      uaFullVersion: normalizeString(highEntropyValues.uaFullVersion, 64),
      wow64: normalizeBoolean(highEntropyValues.wow64),
      fullVersionList: normalizeStringArray(
        Array.isArray(highEntropyValues.fullVersionList)
          ? highEntropyValues.fullVersionList.map((entry) => {
            if (typeof entry !== "object" || entry === null) {
              return null;
            }

            const brand = normalizeString((entry as Record<string, unknown>).brand, 120);
            const version = normalizeString((entry as Record<string, unknown>).version, 64);
            if (!brand) {
              return null;
            }

            return version ? `${brand} ${version}` : brand;
          })
          : null,
        12,
        200,
      ),
    } satisfies UserClientBestEffortUserAgentDataHints;
  } catch {
    return baseHints;
  }
}

function buildScreenMetadata(): UserClientBestEffortScreenMetadata | null {
  if (typeof window === "undefined") {
    return null;
  }

  return {
    width: normalizeFiniteNumber(window.screen?.width, { min: 0, max: 20_000 }),
    height: normalizeFiniteNumber(window.screen?.height, { min: 0, max: 20_000 }),
    pixelRatio: normalizeFiniteNumber(window.devicePixelRatio, { min: 0, max: 20, precision: 2 }),
    colorDepth: normalizeFiniteNumber(window.screen?.colorDepth, { min: 0, max: 64 }),
  };
}

function buildViewportMetadata(): UserClientBestEffortViewportMetadata | null {
  if (typeof window === "undefined") {
    return null;
  }

  return {
    width: normalizeFiniteNumber(window.innerWidth, { min: 0, max: 20_000 }),
    height: normalizeFiniteNumber(window.innerHeight, { min: 0, max: 20_000 }),
  };
}

function buildNetworkMetadata(connection: NavigatorConnectionLike | undefined): UserClientBestEffortNetworkMetadata | null {
  if (!connection) {
    return null;
  }

  return {
    effectiveType: normalizeString(connection.effectiveType, 32),
    downlinkMbps: normalizeFiniteNumber(connection.downlink, {
      min: 0,
      max: 10_000,
      precision: 2,
    }),
    rttMs: normalizeFiniteNumber(connection.rtt, { min: 0, max: 60_000 }),
    saveData: normalizeBoolean(connection.saveData),
  };
}

function hasMeaningfulUserAgentDataHints(value: UserClientBestEffortUserAgentDataHints | null) {
  if (!value) {
    return false;
  }

  return Boolean(
    value.brands
    || typeof value.mobile === "boolean"
    || value.platform
    || value.architecture
    || value.bitness
    || value.model
    || value.platformVersion
    || value.uaFullVersion
    || typeof value.wow64 === "boolean"
    || value.fullVersionList,
  );
}

function safeStringifyMetadata(value: UserClientBestEffortSignInMetadata) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > CLIENT_METADATA_JSON_MAX_LENGTH) {
      return null;
    }

    return serialized;
  } catch {
    return null;
  }
}

/**
 * Builds best-effort, non-authoritative client metadata for admin observability only.
 * This capture must never block authentication and must never be used for trust decisions.
 */
export async function buildClientAuthDeviceLabelMetadata(): Promise<AuthDeviceLabelMetadata> {
  const emptyResult: AuthDeviceLabelMetadata = {
    deviceLabel: null,
    deviceLabelSource: null,
    deviceLabelConfidence: null,
    clientBestEffortSignInMetadata: null,
    clientBestEffortSignInMetadataJson: null,
  };

  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return emptyResult;
  }

  try {
    const navigatorHints = navigator as NavigatorWithBestEffortHints;
    const userAgent = normalizeString(navigatorHints.userAgent, CLIENT_USER_AGENT_MAX_LENGTH) ?? "";
    const browser = detectBrowser(userAgent);
    const operatingSystem = detectOperatingSystem(userAgent);
    const formFactor = detectFormFactor(userAgent);

    let approximateLabel: string | null = null;
    if (browser && operatingSystem) {
      approximateLabel = `${browser} on ${operatingSystem}`;
    } else if (browser) {
      approximateLabel = `${browser} Browser`;
    } else if (operatingSystem) {
      approximateLabel = `${operatingSystem} Device`;
    }

    if (approximateLabel && formFactor !== "Desktop") {
      approximateLabel = `${approximateLabel} (${formFactor})`;
    }

    const deviceLabel = normalizeString(approximateLabel, DEVICE_LABEL_MAX_LENGTH);
    const deviceLabelSource = deviceLabel ? DEVICE_LABEL_SOURCE : null;
    const deviceLabelConfidence = deviceLabel
      ? computeDeviceLabelConfidence({
        browser,
        operatingSystem,
        formFactor,
      })
      : null;

    const userAgentDataHints = await readUserAgentDataHints(navigatorHints.userAgentData);
    const maxTouchPoints = normalizeFiniteNumber(navigatorHints.maxTouchPoints, {
      min: 0,
      max: 32,
    });

    const touchCapable =
      typeof maxTouchPoints === "number"
        ? maxTouchPoints > 0
        : typeof window.matchMedia === "function"
          ? window.matchMedia("(pointer: coarse)").matches
          : null;

    const metadata: UserClientBestEffortSignInMetadata = {
      nonAuthoritative: true,
      capturedAt: new Date().toISOString(),
      userAgent: userAgent || null,
      browser,
      operatingSystem,
      platform:
        normalizeString(navigatorHints.platform, 120)
        ?? normalizeString(navigatorHints.userAgentData?.platform, 120),
      language: normalizeString(navigatorHints.language, 64),
      languages: normalizeStringArray(navigatorHints.languages, 8, 64),
      timezone: normalizeString(Intl.DateTimeFormat().resolvedOptions().timeZone, 120),
      maxTouchPoints,
      touchCapable,
      deviceMemoryGb: normalizeFiniteNumber(navigatorHints.deviceMemory, {
        min: 0,
        max: 1024,
        precision: 2,
      }),
      hardwareConcurrency: normalizeFiniteNumber(navigatorHints.hardwareConcurrency, {
        min: 0,
        max: 1024,
      }),
      userAgentData: hasMeaningfulUserAgentDataHints(userAgentDataHints)
        ? userAgentDataHints
        : null,
      screen: buildScreenMetadata(),
      viewport: buildViewportMetadata(),
      network: buildNetworkMetadata(navigatorHints.connection),
      approximateDeviceLabel: deviceLabel,
      approximateDeviceLabelSource: deviceLabelSource,
      approximateDeviceLabelConfidence: deviceLabelConfidence,
    };

    return {
      deviceLabel,
      deviceLabelSource,
      deviceLabelConfidence,
      clientBestEffortSignInMetadata: metadata,
      clientBestEffortSignInMetadataJson: safeStringifyMetadata(metadata),
    };
  } catch {
    return emptyResult;
  }
}
