// LMTM-OS: AdsProvider registry.
// Maps platform name -> concrete provider instance. The sync routes and
// the aggregation layer use this to dispatch work without caring about
// the platform.

import type { AdsPlatform, AdsProvider } from "./types.js";
import { metaProvider } from "./providers/meta.js";
import { googleAdsProvider } from "./providers/google.js";
import { tiktokAdsProvider } from "./providers/tiktok.js";
import { linkedinAdsProvider } from "./providers/linkedin.js";

const providersByPlatform: Record<AdsPlatform, AdsProvider> = {
  meta: metaProvider,
  google: googleAdsProvider,
  tiktok: tiktokAdsProvider,
  linkedin: linkedinAdsProvider,
};

export function getAdsProvider(platform: AdsPlatform): AdsProvider {
  const provider = providersByPlatform[platform];
  if (!provider) {
    throw new Error(`Unknown ads platform: ${platform}`);
  }
  return provider;
}

export function listAdsProviders(): AdsProvider[] {
  return Object.values(providersByPlatform);
}

export function isKnownAdsPlatform(value: string): value is AdsPlatform {
  return value === "meta" || value === "google" || value === "tiktok" || value === "linkedin";
}
