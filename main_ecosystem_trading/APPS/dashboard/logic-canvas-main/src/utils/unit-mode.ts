import type { SettingsState } from "@/contexts/SettingsContext";
import type { MTConfig } from "@/types/mt-config";

export const getUseDirectPriceGrid = (settings: SettingsState): boolean => {
  const symbol = (settings.unitSymbol || "").trim().toUpperCase();
  const mode = (settings.unitModeBySymbol && symbol && settings.unitModeBySymbol[symbol]) || settings.unitModeDefault;
  return mode === "direct_price";
};

export const withUseDirectPriceGrid = (config: MTConfig, settings: SettingsState): MTConfig => {
  return {
    ...config,
    general: {
      ...config.general,
      use_direct_price_grid: getUseDirectPriceGrid(settings),
    },
  };
};

const normalizeValue = (value: any): any => {
  if (value === "ON" || value === "on" || value === "true" || value === "1") return true;
  if (value === "OFF" || value === "off" || value === "false" || value === "0") return false;
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value !== null && typeof value === "object") return normalizeConfigForExport(value);
  return value;
};

export const normalizeConfigForExport = (config: any): any => {
  if (config === null || typeof config !== "object") return config;
  const normalized: any = {};
  for (const [key, value] of Object.entries(config)) {
    normalized[key] = normalizeValue(value);
  }
  return normalized;
};
