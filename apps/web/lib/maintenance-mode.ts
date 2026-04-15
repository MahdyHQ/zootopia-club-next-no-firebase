const TRUE_ENV_VALUES = new Set(["1", "true", "yes", "on"]);

export const MAINTENANCE_MODE_ENV_KEY = "ZOOTOPIA_MAINTENANCE_MODE_ENABLED";

export function readBooleanEnvFlag(value: string | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return TRUE_ENV_VALUES.has(normalized);
}

export function isMaintenanceModeEnabled() {
  return readBooleanEnvFlag(process.env[MAINTENANCE_MODE_ENV_KEY]);
}
