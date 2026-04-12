export type AuthDeviceLabelMetadata = {
  deviceLabel: string | null;
  deviceLabelSource: string | null;
  deviceLabelConfidence: number | null;
};

const DEVICE_LABEL_SOURCE = "navigator.userAgent";
const DEVICE_LABEL_MAX_LENGTH = 120;

function normalizeDeviceLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, DEVICE_LABEL_MAX_LENGTH);
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

  if (/Safari\//i.test(userAgent) && !/Chrome\//i.test(userAgent) && !/CriOS\//i.test(userAgent)) {
    return "Safari";
  }

  return null;
}

function detectPlatform(userAgent: string) {
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

function computeConfidence(input: {
  browser: string | null;
  platform: string | null;
  formFactor: string;
}) {
  if (!input.browser && !input.platform) {
    return null;
  }

  if (input.browser && input.platform) {
    return input.formFactor === "Desktop" ? 0.72 : 0.8;
  }

  return 0.46;
}

/**
 * Builds a best-effort client device label from browser runtime hints.
 * This metadata is non-authoritative and purely informational for admin visibility.
 */
export function buildClientAuthDeviceLabelMetadata(): AuthDeviceLabelMetadata {
  if (typeof navigator === "undefined") {
    return {
      deviceLabel: null,
      deviceLabelSource: null,
      deviceLabelConfidence: null,
    };
  }

  const userAgent = navigator.userAgent || "";
  const browser = detectBrowser(userAgent);
  const platform = detectPlatform(userAgent);
  const formFactor = detectFormFactor(userAgent);

  let label: string | null = null;
  if (browser && platform) {
    label = `${browser} on ${platform}`;
  } else if (browser) {
    label = `${browser} Browser`;
  } else if (platform) {
    label = `${platform} Device`;
  }

  if (label && formFactor !== "Desktop") {
    label = `${label} (${formFactor})`;
  }

  const normalizedLabel = label ? normalizeDeviceLabel(label) : null;
  const confidence = computeConfidence({
    browser,
    platform,
    formFactor,
  });

  return {
    deviceLabel: normalizedLabel,
    deviceLabelSource: normalizedLabel ? DEVICE_LABEL_SOURCE : null,
    deviceLabelConfidence: normalizedLabel ? confidence : null,
  };
}
