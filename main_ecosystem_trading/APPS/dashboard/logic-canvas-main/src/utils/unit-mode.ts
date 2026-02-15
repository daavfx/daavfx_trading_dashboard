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

