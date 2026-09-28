/** Browser and operating system read from a user agent, for the device list (FR-AUTH-10). */
export interface DeviceDescription {
  browser: string | null;
  os: string | null;
  mobile: boolean;
}

const BROWSERS: readonly [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bChrome\/|\bCriOS\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
];

const SYSTEMS: readonly [RegExp, string][] = [
  [/\biPhone\b|\biPad\b|\biPod\b/, "iOS"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows\b/, "Windows"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

/**
 * Coarse, dependency-free user agent reading. Order matters: Edge and
 * Opera also claim Chrome, Chrome also claims Safari, iOS also claims
 * macOS.
 */
export function describeUserAgent(userAgent: string | null): DeviceDescription {
  const ua = userAgent ?? "";
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
  const os = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1] ?? null;
  return { browser, os, mobile: /\bMobile\b|\bAndroid\b|\biPhone\b/.test(ua) };
}
