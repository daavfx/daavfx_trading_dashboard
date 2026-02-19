import React, { createContext, useContext, useState, useEffect } from "react";

export interface SettingsState {
  // Appearance
  theme: "dark" | "light" | "system";
  accentColor: string;
  density: "compact" | "comfortable" | "spacious";
  fontSize: number;
  animations: boolean;
  
  // Behavior
  autosave: boolean;
  autosaveInterval: number;
  notifications: boolean;
  soundEffects: boolean;
  confirmOnClose: boolean;
  keyboardShortcuts: boolean;
  showTooltips: boolean;
  highlightChanges: boolean;
  
  // Data & Storage
  vaultPath: string;
  exportFormat: "set" | "json";
  backupOnExport: boolean;
  maxVaultFiles: number;
  
  // Version Control
  vcMaxSnapshots: number;
  vcAutoCommitTimeout: number;
  vcEnabled: boolean;
  
  // Undo/Redo
  urMaxStackSize: number;
  urDebounceMs: number;
  urEnabled: boolean;
  
  // Memory System
  msMaxEntries: number;
  msLearningRate: number;
  msEnabled: boolean;
  
  
  // Trading Defaults
  defaultLotSize: number;
  defaultRiskPercent: number;
  defaultSlippage: number;
  maxSpreadFilter: number;
  sessionTimezone: string;
  
  // UI Layout
  showEngineCards: boolean;
  showGroupPanels: boolean;
  compactLogicView: boolean;
  showParameterTooltips: boolean;
  gridLines: boolean;
  
  // Chat & Transactions
  autoApproveTransactions: boolean;
  
  // Units & Display
  unitModeDefault: "direct_price" | "fx_pips";
  unitSymbol: string;
  unitModeBySymbol: Record<string, "direct_price" | "fx_pips">;
  
  
}

 

export const defaultSettings: SettingsState = {
  // Appearance
  theme: "dark",
  accentColor: "gold",
  density: "comfortable",
  fontSize: 13,
  animations: true,
  
  // Behavior
  autosave: true,
  autosaveInterval: 30,
  notifications: true,
  soundEffects: false,
  confirmOnClose: true,
  keyboardShortcuts: true,
  showTooltips: true,
  highlightChanges: true,
  
  // Data & Storage
  vaultPath: "./Vault_Presets",
  exportFormat: "set",
  backupOnExport: false,
  maxVaultFiles: 100,
  
  // Version Control
  vcMaxSnapshots: 50,
  vcAutoCommitTimeout: 300,
  vcEnabled: true,
  
  // Undo/Redo
  urMaxStackSize: 100,
  urDebounceMs: 500,
  urEnabled: true,
  
  // Memory System
  msMaxEntries: 1000,
  msLearningRate: 0.1,
  msEnabled: true,
  
  
  // Trading Defaults
  defaultLotSize: 0.01,
  defaultRiskPercent: 1.0,
  defaultSlippage: 3,
  maxSpreadFilter: 25,
  sessionTimezone: "UTC",
  
  // UI Layout
  showEngineCards: true,
  showGroupPanels: true,
  compactLogicView: false,
  showParameterTooltips: true,
  gridLines: true,
  
  // Chat & Transactions
  autoApproveTransactions: false,
  
  // Units & Display
  unitModeDefault: "fx_pips",
  unitSymbol: "",
  unitModeBySymbol: {},
  
  
};

interface SettingsContextType {
  settings: SettingsState;
  updateSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  saveSettings: () => void;
  resetSettings: () => void;
  hasChanges: boolean;
}

const STORAGE_KEY = "daavfx-settings";
const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [hasChanges, setHasChanges] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Merge with defaults to handle new fields
        setSettings({ ...defaultSettings, ...parsed });
      } catch (e) {
        // Silent fail - use defaults
      }
    }
  }, []);

  const updateSetting = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const saveSettings = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setHasChanges(false);
    // Dispatch event for other components
    window.dispatchEvent(new CustomEvent("settings-changed", { detail: settings }));
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
    setHasChanges(true);
    localStorage.removeItem(STORAGE_KEY);
  };

  

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSetting,
        saveSettings,
        resetSettings,
        hasChanges,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}

// Helper functions for common settings
export function useSetting<K extends keyof SettingsState>(key: K) {
  const { settings, updateSetting } = useSettings();
  return [settings[key], (value: SettingsState[K]) => updateSetting(key, value)] as const;
}
