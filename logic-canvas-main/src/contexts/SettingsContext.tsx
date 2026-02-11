import React, { createContext, useContext, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface MT4SettingsState {
  autoDetected: boolean;
  terminalPath: string;
  commonFilesPath: string;
  profilesPath: string;
  brokerName: string;
  isValid: boolean;
  lastTestResult: string | null;
  lastTestTime: number | null;
}

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
  autoExportToMT4: boolean;
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
  
  // MT4 Integration
  mt4: MT4SettingsState;
  mt5: MT4SettingsState;
  autoDetectMTPaths: boolean;
  
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
  
  // MT4/MT5 Paths
  mt4CommonFilesPath: string | null;
  mt5CommonFilesPath: string | null;
}

interface MT4TestResult {
  success: boolean;
  timestamp: number;
  message: string;
  path: string;
}

export const defaultMT4Settings: MT4SettingsState = {
  autoDetected: false,
  terminalPath: "",
  commonFilesPath: "",
  profilesPath: "",
  brokerName: "",
  isValid: false,
  lastTestResult: null,
  lastTestTime: null,
};

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
  autoExportToMT4: true,
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
  
  // MT4 Integration
  mt4: { ...defaultMT4Settings },
  mt5: { ...defaultMT4Settings },
  autoDetectMTPaths: true,
  
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
  
  // MT4/MT5 Paths
  mt4CommonFilesPath: null,
  mt5CommonFilesPath: null,
};

interface SettingsContextType {
  settings: SettingsState;
  updateSetting: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  saveSettings: () => void;
  resetSettings: () => void;
  hasChanges: boolean;
  testMT4Connection: () => Promise<boolean>;
  testMT5Connection: () => Promise<boolean>;
  getMT4Settings: () => Promise<MT4SettingsState>;
  getMT5Settings: () => Promise<MT4SettingsState>;
  setMT4Path: (path: string) => Promise<boolean>;
  setMT5Path: (path: string) => Promise<boolean>;
  autoDetectMT4: () => Promise<MT4SettingsState>;
  autoDetectMT5: () => Promise<MT4SettingsState>;
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
        console.error("Failed to parse settings", e);
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

  // MT4 Integration functions
  const testMT4Connection = async (): Promise<boolean> => {
    try {
      const result = await invoke<boolean>("test_mt4_connection");
      
      // Update last test result
      const testResult: MT4TestResult = {
        success: result,
        timestamp: Date.now(),
        message: result ? "Connection successful" : "Cannot access MT4 Common Files",
        path: settings.mt4.commonFilesPath,
      };
      
      updateSetting("mt4", {
        ...settings.mt4,
        lastTestResult: JSON.stringify(testResult),
        lastTestTime: Date.now(),
        isValid: result,
      });
      
      return result;
    } catch (e) {
      console.error("MT4 test failed:", e);
      return false;
    }
  };

  const testMT5Connection = async (): Promise<boolean> => {
    try {
      const result = await invoke<boolean>("test_mt5_connection");
      
      const testResult: MT4TestResult = {
        success: result,
        timestamp: Date.now(),
        message: result ? "Connection successful" : "Cannot access MT5 Common Files",
        path: settings.mt5.commonFilesPath,
      };
      
      updateSetting("mt5", {
        ...settings.mt5,
        lastTestResult: JSON.stringify(testResult),
        lastTestTime: Date.now(),
        isValid: result,
      });
      
      return result;
    } catch (e) {
      console.error("MT5 test failed:", e);
      return false;
    }
  };

  const getMT4Settings = async (): Promise<MT4SettingsState> => {
    try {
      const result = await invoke<MT4SettingsState>("get_mt4_settings");
      updateSetting("mt4", result);
      return result;
    } catch (e) {
      console.error("Failed to get MT4 settings:", e);
      return settings.mt4;
    }
  };

  const getMT5Settings = async (): Promise<MT4SettingsState> => {
    try {
      const result = await invoke<MT4SettingsState>("get_mt5_settings");
      updateSetting("mt5", result);
      return result;
    } catch (e) {
      console.error("Failed to get MT5 settings:", e);
      return settings.mt5;
    }
  };

  const setMT4Path = async (path: string): Promise<boolean> => {
    try {
      const result = await invoke<MT4SettingsState>("configure_mt4_path", { path });
      updateSetting("mt4", { ...result, autoDetected: false });
      return result.isValid;
    } catch (e) {
      console.error("Failed to set MT4 path:", e);
      return false;
    }
  };

  const setMT5Path = async (path: string): Promise<boolean> => {
    try {
      const result = await invoke<MT4SettingsState>("configure_mt5_path", { path });
      updateSetting("mt5", { ...result, autoDetected: false });
      return result.isValid;
    } catch (e) {
      console.error("Failed to set MT5 path:", e);
      return false;
    }
  };

  const autoDetectMT4 = async (): Promise<MT4SettingsState> => {
    try {
      const result = await invoke<MT4SettingsState>("auto_detect_mt4_paths");
      updateSetting("mt4", { ...result, autoDetected: true });
      return result;
    } catch (e) {
      console.error("MT4 auto-detect failed:", e);
      return settings.mt4;
    }
  };

  const autoDetectMT5 = async (): Promise<MT4SettingsState> => {
    try {
      const result = await invoke<MT4SettingsState>("auto_detect_mt5_paths");
      updateSetting("mt5", { ...result, autoDetected: true });
      return result;
    } catch (e) {
      console.error("MT5 auto-detect failed:", e);
      return settings.mt5;
    }
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        updateSetting,
        saveSettings,
        resetSettings,
        hasChanges,
        testMT4Connection,
        testMT5Connection,
        getMT4Settings,
        getMT5Settings,
        setMT4Path,
        setMT5Path,
        autoDetectMT4,
        autoDetectMT5,
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
