type SmartTitleDisplayOptions = {
  maxLength?: number;
  minPrefixLength?: number;
  suffixLengthWithExtension?: number;
  suffixLengthWithoutExtension?: number;
};

const EXTENSION_PATTERN = /^[a-z0-9]{1,12}$/i;

function resolveExtensionParts(value: string) {
  const dotIndex = value.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex >= value.length - 1) {
    return null;
  }

  const extension = value.slice(dotIndex);
  const extensionValue = extension.slice(1);
  if (!EXTENSION_PATTERN.test(extensionValue)) {
    return null;
  }

  return {
    stem: value.slice(0, dotIndex),
    extension,
  };
}

/*
  Smart card-title truncation for narrow viewports.
  What it controls:
  - Keeps a meaningful start of the title.
  - Preserves the visible ending (and full extension when detected).
  - Places "..." in the middle instead of blindly trimming the tail.

  Why it exists:
  - Generated/file/result names can be very long, and end-only truncation hides
    useful identity cues like year suffixes and file extensions.

  Scope safety:
  - UI presentation only; no backend, storage, auth, or metadata contracts.
*/
export function buildSmartTitleDisplay(
  rawValue: string,
  options: SmartTitleDisplayOptions = {},
) {
  const normalizedValue = rawValue.trim();
  if (!normalizedValue) {
    return rawValue;
  }

  const maxLength = Math.max(16, options.maxLength ?? 44);
  if (normalizedValue.length <= maxLength) {
    return normalizedValue;
  }

  const minPrefixLength = Math.max(
    6,
    Math.min(maxLength - 7, options.minPrefixLength ?? 12),
  );

  const extensionParts = resolveExtensionParts(normalizedValue);
  if (extensionParts) {
    let suffixStemLength = Math.min(
      Math.max(2, options.suffixLengthWithExtension ?? 6),
      extensionParts.stem.length,
    );

    let suffix = `${extensionParts.stem.slice(-suffixStemLength)}${extensionParts.extension}`;
    let prefixBudget = maxLength - suffix.length - 3;

    while (prefixBudget < minPrefixLength && suffixStemLength > 1) {
      suffixStemLength -= 1;
      suffix = `${extensionParts.stem.slice(-suffixStemLength)}${extensionParts.extension}`;
      prefixBudget = maxLength - suffix.length - 3;
    }

    if (prefixBudget >= 4) {
      return `${normalizedValue.slice(0, prefixBudget)}...${suffix}`;
    }
  }

  let suffixLength = Math.min(
    Math.max(4, options.suffixLengthWithoutExtension ?? 10),
    normalizedValue.length - 1,
  );
  let suffix = normalizedValue.slice(-suffixLength);
  let prefixBudget = maxLength - suffix.length - 3;

  while (prefixBudget < minPrefixLength && suffixLength > 4) {
    suffixLength -= 1;
    suffix = normalizedValue.slice(-suffixLength);
    prefixBudget = maxLength - suffix.length - 3;
  }

  if (prefixBudget < 4) {
    return `${normalizedValue.slice(0, Math.max(1, maxLength - 3))}...`;
  }

  return `${normalizedValue.slice(0, prefixBudget)}...${suffix}`;
}
