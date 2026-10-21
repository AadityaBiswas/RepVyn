// App configuration: prices and support address. Only public values belong here.

export interface Price { monthly: string; yearly: string; yearlyPerMonth: string }
export interface AppConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  /** Turns on Pro checkout and gating. */
  razorpayKeyId?: string;
  vapidPublicKey?: string;
  posthogKey?: string;
  posthogHost?: string;
  version?: string;
  prices: { IN: Price; US: Price };
  supportEmail: string;
}

declare const __REPVYN_CONFIG__: Partial<AppConfig> | undefined;

const DEFAULT_PRICES: AppConfig["prices"] = {
  IN: { monthly: "₹249", yearly: "₹1,499", yearlyPerMonth: "₹125" },
  US: { monthly: "$7.99", yearly: "$49.99", yearlyPerMonth: "$4.17" },
};

const injected: Partial<AppConfig> = typeof __REPVYN_CONFIG__ !== "undefined" ? __REPVYN_CONFIG__ : {};
export const config: AppConfig = { prices: DEFAULT_PRICES, supportEmail: "support@repvyn.app", ...injected };

export const cloudEnabled = () => !!(config.supabaseUrl && config.supabaseAnonKey);
export const billingEnabled = () => cloudEnabled() && !!config.razorpayKeyId;

/** India pays in rupees, everyone else in dollars. Time zone first, since many phones in India use an en-US locale. */
export function marketFor(timeZone: string | undefined, locale: string | undefined): "IN" | "US" {
  if (timeZone === "Asia/Kolkata" || timeZone === "Asia/Calcutta") return "IN";
  return locale?.match(/[-_]([A-Za-z]{2})\b/)?.[1]?.toUpperCase() === "IN" ? "IN" : "US";
}
