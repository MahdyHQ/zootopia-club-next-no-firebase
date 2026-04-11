export const FEATURE_FLAGS = {
  // Legacy compatibility flag: App Hosting is no longer the primary deployment target.
  appHostingFirst: false,
  enableAppsApiTraffic: false,
  enableBilling: false,
  enableChat: false,
} as const;
