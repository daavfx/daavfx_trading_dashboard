import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Settings,
  Palette,
  Monitor,
  Moon,
  Sun,
  Laptop,
  Grid3X3,
  Type,
  Save,
  RotateCcw,
  Keyboard,
  Bell,
  Shield,
  HardDrive,
  Zap,
  FolderOpen,
  ChevronRight,
  Info,
  Sparkles,
  Layout,
  Clock,
  Volume2,
  MousePointer,
  FileJson,
  Trash2,
  Database,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { useSettings } from "@/contexts/SettingsContext";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

const accentColors = [
  { id: "gold", color: "#D4AF37", label: "Gold", description: "Classic trading aesthetic" },
  { id: "blue", color: "#3B82F6", label: "Ocean", description: "Calm and professional" },
  { id: "emerald", color: "#10B981", label: "Emerald", description: "Growth and success" },
  { id: "purple", color: "#8B5CF6", label: "Royal", description: "Premium experience" },
  { id: "rose", color: "#F43F5E", label: "Coral", description: "Bold and energetic" },
  { id: "orange", color: "#F97316", label: "Sunset", description: "Warm and inviting" },
];

const densityOptions = [
  { 
    id: "compact", 
    label: "Compact", 
    description: "Maximum information density",
    detail: "Best for power users with large monitors"
  },
  { 
    id: "comfortable", 
    label: "Comfortable", 
    description: "Balanced spacing",
    detail: "Recommended for most users"
  },
  { 
    id: "spacious", 
    label: "Spacious", 
    description: "Generous whitespace",
    detail: "Easier on the eyes for long sessions"
  },
];

type TabId = "appearance" | "behavior" | "shortcuts" | "data";

interface SettingsSection {
  id: TabId;
  label: string;
  icon: React.ElementType;
  description: string;
}

const sections: SettingsSection[] = [
  { 
    id: "appearance", 
    label: "Appearance", 
    icon: Palette,
    description: "Customize visual style"
  },
  { 
    id: "behavior", 
    label: "Behavior", 
    icon: Settings,
    description: "Control app interactions"
  },
  { 
    id: "shortcuts", 
    label: "Shortcuts", 
    icon: Keyboard,
    description: "Keyboard navigation"
  },
  { 
    id: "data", 
    label: "Data & Storage", 
    icon: HardDrive,
    description: "Manage files and storage"
  },
];

// Elegant Card Component
function SettingCard({ 
  title, 
  description, 
  children, 
  icon: Icon,
  className 
}: { 
  title: string; 
  description?: string; 
  children: React.ReactNode; 
  icon?: React.ElementType;
  className?: string;
}) {
  return (
    <div className={cn("group rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden", className)}>
      <div className="px-5 py-4 border-b border-border/30">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-muted-foreground" />}
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

// Elegant Toggle Component
function ElegantToggle({
  label,
  description,
  checked,
  onCheckedChange,
  icon: Icon,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  icon?: React.ElementType;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="mt-0.5 p-1.5 rounded-md bg-muted/50">
            <Icon className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        )}
        <div>
          <div className="text-sm font-medium">{label}</div>
          {description && (
            <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
          )}
        </div>
      </div>
      <Switch 
        checked={checked} 
        onCheckedChange={onCheckedChange}
        className="data-[state=checked]:bg-primary"
      />
    </div>
  );
}

export function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  const { settings, updateSetting, saveSettings, resetSettings, hasChanges } = useSettings();
  const [activeTab, setActiveTab] = useState<TabId>("appearance");
  const [storageInfo, setStorageInfo] = useState({
    used: 0,
    available: 0,
    items: 0,
  });
  const tauriAvailable = typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__);

  // Calculate storage usage
  useEffect(() => {
    if (!open) return;
    
    let totalSize = 0;
    let itemCount = 0;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || "";
      if (key.startsWith("daavfx-")) {
        const value = localStorage.getItem(key) || "";
        totalSize += value.length * 2; // UTF-16 encoding
        itemCount++;
      }
    }
    
    setStorageInfo({
      used: totalSize,
      available: 5 * 1024 * 1024 - totalSize, // Assume 5MB limit
      items: itemCount,
    });
  }, [open]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const handleClearData = (type: "snapshots" | "history" | "memory" | "all") => {
    const messages = {
      snapshots: "All version snapshots cleared",
      history: "Undo/redo history cleared",
      memory: "Learning memory cleared",
      all: "All local data cleared",
    };
    
    switch (type) {
      case "snapshots":
        localStorage.removeItem("daavfx_version_control");
        break;
      case "history":
        localStorage.removeItem("daavfx_undo_redo");
        break;
      case "memory":
        localStorage.removeItem("daavfx_memory_system");
        break;
      case "all":
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i) || "";
          if (key.startsWith("daavfx-")) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        resetSettings();
        break;
    }
    
    toast.success(messages[type]);
  };

  return (
    <TooltipProvider>
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            />

            {/* Drawer */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed right-0 top-0 bottom-0 w-[480px] bg-background/95 backdrop-blur-xl border-l border-border/50 z-50 flex flex-col shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-border/50">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Settings</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Customize your experience</p>
                </div>
                <button 
                  onClick={onClose} 
                  className="p-2 hover:bg-muted rounded-full transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-1 overflow-hidden">
                {/* Sidebar Navigation */}
                <div className="w-48 border-r border-border/50 bg-muted/20 p-3 space-y-1">
                  {sections.map((section) => {
                    const Icon = section.icon;
                    const isActive = activeTab === section.id;
                    return (
                      <button
                        key={section.id}
                        onClick={() => setActiveTab(section.id)}
                        className={cn(
                          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-200",
                          isActive
                            ? "bg-primary/10 text-primary shadow-sm"
                            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                        )}
                      >
                        <Icon className={cn("w-4 h-4", isActive && "text-primary")} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{section.label}</div>
                          <div className="text-[10px] opacity-60 truncate">{section.description}</div>
                        </div>
                        {isActive && <ChevronRight className="w-3 h-3 opacity-50" />}
                      </button>
                    );
                  })}

                  {/* Storage Mini-Indicator */}
                  <div className="mt-6 pt-4 border-t border-border/30 px-3">
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-2">
                      <Database className="w-3 h-3" />
                      <span>Storage</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary/60 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min((storageInfo.used / (5 * 1024 * 1024)) * 100, 100)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1.5">
                      {formatBytes(storageInfo.used)} used
                    </div>
                  </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto">
                  <div className="p-6 space-y-6">
                    
                    {/* Appearance Tab */}
                    {activeTab === "appearance" && (
                      <>
                        {/* Theme Selection */}
                        <SettingCard 
                          title="Theme" 
                          description="Choose your preferred color scheme"
                          icon={Monitor}
                        >
                          <div className="grid grid-cols-3 gap-3">
                            {[
                              { id: "dark", label: "Dark", icon: Moon },
                              { id: "light", label: "Light", icon: Sun },
                              { id: "system", label: "System", icon: Laptop },
                            ].map((theme) => {
                              const Icon = theme.icon;
                              const isActive = settings.theme === theme.id;
                              return (
                                <button
                                  key={theme.id}
                                  onClick={() => updateSetting("theme", theme.id)}
                                  className={cn(
                                    "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200",
                                    isActive
                                      ? "border-primary bg-primary/5"
                                      : "border-border/50 hover:border-border hover:bg-muted/30"
                                  )}
                                >
                                  <Icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground")} />
                                  <span className={cn("text-xs font-medium", isActive ? "text-primary" : "text-muted-foreground")}>
                                    {theme.label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </SettingCard>

                        {/* Accent Color */}
                        <SettingCard 
                          title="Accent Color" 
                          description="Personalize your interface"
                          icon={Sparkles}
                        >
                          <div className="grid grid-cols-3 gap-3">
                            {accentColors.map((color) => {
                              const isActive = settings.accentColor === color.id;
                              return (
                                <button
                                  key={color.id}
                                  onClick={() => updateSetting("accentColor", color.id)}
                                  className={cn(
                                    "group relative flex items-center gap-3 p-3 rounded-xl border-2 transition-all duration-200 text-left",
                                    isActive
                                      ? "border-primary bg-primary/5"
                                      : "border-border/50 hover:border-border/80 hover:bg-muted/20"
                                  )}
                                >
                                  <div 
                                    className="w-8 h-8 rounded-full shadow-sm ring-2 ring-white/20"
                                    style={{ backgroundColor: color.color }}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium">{color.label}</div>
                                    <div className="text-[10px] text-muted-foreground truncate">{color.description}</div>
                                  </div>
                                  {isActive && (
                                    <div className="absolute top-2 right-2">
                                      <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                                        <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                      </div>
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </SettingCard>

                        {/* Density */}
                        <SettingCard 
                          title="Layout Density" 
                          description="Control information density"
                          icon={Layout}
                        >
                          <div className="space-y-2">
                            {densityOptions.map((option) => {
                              const isActive = settings.density === option.id;
                              return (
                                <button
                                  key={option.id}
                                  onClick={() => updateSetting("density", option.id as any)}
                                  className={cn(
                                    "w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 text-left",
                                    isActive
                                      ? "border-primary bg-primary/5"
                                      : "border-border/50 hover:border-border/80 hover:bg-muted/20"
                                  )}
                                >
                                  <div className={cn(
                                    "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
                                    isActive ? "bg-primary/20" : "bg-muted"
                                  )}>
                                    <Grid3X3 className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground")} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className={cn("text-sm font-medium", isActive && "text-primary")}>
                                        {option.label}
                                      </span>
                                      {isActive && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                                          Active
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-muted-foreground">{option.description}</div>
                                    <div className="text-[10px] text-muted-foreground/60 mt-0.5">{option.detail}</div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </SettingCard>

                        {/* Font Size */}
                        <SettingCard title="Font Size" icon={Type}>
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">Preview</span>
                              <span className="text-xs font-medium">{settings.fontSize}px</span>
                            </div>
                            <div 
                              className="p-4 rounded-lg bg-muted/30 text-center transition-all duration-200"
                              style={{ fontSize: `${settings.fontSize}px` }}
                            >
                              The quick brown fox
                            </div>
                            <Slider
                              value={[settings.fontSize]}
                              onValueChange={([v]) => updateSetting("fontSize", v)}
                              min={11}
                              max={16}
                              step={1}
                              className="w-full"
                            />
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                              <span>Small</span>
                              <span>Large</span>
                            </div>
                          </div>
                        </SettingCard>

                        {/* Animations */}
                        <SettingCard>
                          <ElegantToggle
                            label="Smooth Animations"
                            description="Enable transitions and micro-interactions"
                            checked={settings.animations}
                            onCheckedChange={(v) => updateSetting("animations", v)}
                            icon={Sparkles}
                          />
                        </SettingCard>
                      </>
                    )}

                    {/* Behavior Tab */}
                    {activeTab === "behavior" && (
                      <>
                        <SettingCard 
                          title="Auto-Save" 
                          description="Protect your work automatically"
                          icon={Save}
                        >
                          <div className="space-y-4">
                            <ElegantToggle
                              label="Enable Auto-Save"
                              description="Automatically save changes to disk"
                              checked={settings.autosave}
                              onCheckedChange={(v) => updateSetting("autosave", v)}
                            />
                            
                            {settings.autosave && (
                              <div className="pl-4 border-l-2 border-primary/20 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-muted-foreground">Save interval</span>
                                  <span className="text-xs font-medium">{settings.autosaveInterval}s</span>
                                </div>
                                <Slider
                                  value={[settings.autosaveInterval]}
                                  onValueChange={([v]) => updateSetting("autosaveInterval", v)}
                                  min={10}
                                  max={300}
                                  step={10}
                                />
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                  <span>10s</span>
                                  <span>5min</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </SettingCard>

                        <SettingCard title="Notifications" icon={Bell}>
                          <div className="space-y-1">
                            <ElegantToggle
                              label="Desktop Notifications"
                              description="Show system notifications for important events"
                              checked={settings.notifications}
                              onCheckedChange={(v) => updateSetting("notifications", v)}
                            />
                            <ElegantToggle
                              label="Sound Effects"
                              description="Play audio feedback for actions"
                              checked={settings.soundEffects}
                              onCheckedChange={(v) => updateSetting("soundEffects", v)}
                              icon={Volume2}
                            />
                          </div>
                        </SettingCard>

                        <SettingCard title="Safety" icon={Shield}>
                          <div className="space-y-1">
                            <ElegantToggle
                              label="Confirm Before Closing"
                              description="Warn when closing with unsaved changes"
                              checked={settings.confirmOnClose}
                              onCheckedChange={(v) => updateSetting("confirmOnClose", v)}
                            />
                            <ElegantToggle
                              label="Auto-Approve Chat Commands"
                              description="Skip confirmation for chat-generated changes"
                              checked={settings.autoApproveTransactions}
                              onCheckedChange={(v) => updateSetting("autoApproveTransactions", v)}
                              icon={Zap}
                            />
                          </div>
                        </SettingCard>

                        <SettingCard title="Interface" icon={MousePointer}>
                          <ElegantToggle
                            label="Show Tooltips"
                            description="Display helpful hints on hover"
                            checked={settings.showTooltips}
                            onCheckedChange={(v) => updateSetting("showTooltips", v)}
                          />
                        </SettingCard>
                      </>
                    )}

                    {/* Shortcuts Tab */}
                    {activeTab === "shortcuts" && (
                      <SettingCard 
                        title="Keyboard Shortcuts" 
                        description="Quick navigation commands"
                        icon={Keyboard}
                      >
                        <div className="space-y-2">
                          {[
                            { key: "Ctrl + K", action: "Open Chat" },
                            { key: "Ctrl + S", action: "Save Configuration" },
                            { key: "Ctrl + Z", action: "Undo Last Change" },
                            { key: "Ctrl + Shift + Z", action: "Redo Change" },
                            { key: "Ctrl + E", action: "Export to MT4" },
                            { key: "Esc", action: "Close Panels" },
                            { key: "?", action: "Show Help" },
                          ].map((shortcut, i) => (
                            <div 
                              key={i} 
                              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/30 transition-colors"
                            >
                              <span className="text-sm text-muted-foreground">{shortcut.action}</span>
                              <kbd className="px-2 py-1 text-xs font-mono bg-muted rounded border border-border/50">
                                {shortcut.key}
                              </kbd>
                            </div>
                          ))}
                        </div>
                        
                        <div className="mt-4 pt-4 border-t border-border/30">
                          <ElegantToggle
                            label="Enable Keyboard Shortcuts"
                            description="Allow keyboard navigation"
                            checked={settings.keyboardShortcuts}
                            onCheckedChange={(v) => updateSetting("keyboardShortcuts", v)}
                          />
                        </div>
                      </SettingCard>
                    )}

                    {/* Data & Storage Tab */}
                    {activeTab === "data" && (
                      <>
                        {/* Storage Overview */}
                        <SettingCard 
                          title="Storage Usage" 
                          description="Manage your local data"
                          icon={Database}
                        >
                          <div className="space-y-4">
                            <div className="flex items-center gap-4">
                              <div className="relative w-20 h-20">
                                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                                  <path
                                    className="text-muted"
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                  />
                                  <path
                                    className="text-primary"
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    strokeDasharray={`${(storageInfo.used / (5 * 1024 * 1024)) * 100}, 100`}
                                  />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <span className="text-xs font-medium">{Math.round((storageInfo.used / (5 * 1024 * 1024)) * 100)}%</span>
                                </div>
                              </div>
                              <div className="flex-1">
                                <div className="text-sm font-medium">{formatBytes(storageInfo.used)} used</div>
                                <div className="text-xs text-muted-foreground">{storageInfo.items} items stored</div>
                                <div className="text-[10px] text-muted-foreground/60 mt-1">
                                  {formatBytes(storageInfo.available)} available
                                </div>
                              </div>
                            </div>
                          </div>
                        </SettingCard>

                        {/* Vault Location */}
                        <SettingCard 
                          title="Vault Location" 
                          description="Where presets are saved"
                          icon={FolderOpen}
                        >
                          <div className="space-y-3">
                            <div className="flex gap-2">
                              <Input
                                value={settings.vaultPath || ""}
                                onChange={(e) => updateSetting("vaultPath", e.target.value)}
                                className="flex-1 h-9 text-xs font-mono bg-muted/50"
                                placeholder="./Vault_Presets"
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-9 px-3"
                                onClick={async () => {
                                  try {
                                    const folderPath = await openDialog({
                                      directory: true,
                                      multiple: false,
                                      title: "Select Vault Folder"
                                    });
                                    if (folderPath) {
                                      const path = Array.isArray(folderPath) ? folderPath[0] : folderPath;
                                      updateSetting("vaultPath", String(path));
                                      toast.success("Vault location updated");
                                    }
                                  } catch (err) {
                                    toast.error("Failed to select folder");
                                  }
                                }}
                                disabled={!tauriAvailable}
                              >
                                Browse
                              </Button>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => updateSetting("vaultPath", "./Vault_Presets")}
                            >
                              Reset to default
                            </Button>
                          </div>
                        </SettingCard>

                        {/* Data Management */}
                        <SettingCard 
                          title="Data Management" 
                          description="Clear specific data types"
                          icon={Trash2}
                          className="border-destructive/20"
                        >
                          <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => handleClearData("snapshots")}
                                className="p-3 rounded-lg border border-border/50 hover:border-destructive/50 hover:bg-destructive/5 transition-all text-left"
                              >
                                <div className="text-xs font-medium">Version Snapshots</div>
                                <div className="text-[10px] text-muted-foreground">Git-like history</div>
                              </button>
                              <button
                                onClick={() => handleClearData("history")}
                                className="p-3 rounded-lg border border-border/50 hover:border-destructive/50 hover:bg-destructive/5 transition-all text-left"
                              >
                                <div className="text-xs font-medium">Undo History</div>
                                <div className="text-[10px] text-muted-foreground">Change tracking</div>
                              </button>
                              <button
                                onClick={() => handleClearData("memory")}
                                className="p-3 rounded-lg border border-border/50 hover:border-destructive/50 hover:bg-destructive/5 transition-all text-left"
                              >
                                <div className="text-xs font-medium">AI Memory</div>
                                <div className="text-[10px] text-muted-foreground">Learning data</div>
                              </button>
                              <button
                                onClick={() => handleClearData("all")}
                                className="p-3 rounded-lg border border-destructive/30 hover:border-destructive hover:bg-destructive/10 transition-all text-left group"
                              >
                                <div className="text-xs font-medium text-destructive group-hover:text-destructive">Clear Everything</div>
                                <div className="text-[10px] text-muted-foreground">Reset all data</div>
                              </button>
                            </div>
                            
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                              <p className="text-[10px] text-amber-700 dark:text-amber-300">
                                Clearing data cannot be undone. Your current configuration will be preserved.
                              </p>
                            </div>
                          </div>
                        </SettingCard>

                        {/* Export Format */}
                        <SettingCard title="Export Format" icon={FileJson}>
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { id: "set", label: ".set File", desc: "MT4/MT5 format" },
                              { id: "json", label: "JSON", desc: "Human-readable" },
                            ].map((format) => (
                              <button
                                key={format.id}
                                onClick={() => updateSetting("exportFormat", format.id as any)}
                                className={cn(
                                  "p-3 rounded-lg border-2 text-left transition-all",
                                  settings.exportFormat === format.id
                                    ? "border-primary bg-primary/5"
                                    : "border-border/50 hover:border-border"
                                )}
                              >
                                <div className="text-xs font-medium">{format.label}</div>
                                <div className="text-[10px] text-muted-foreground">{format.desc}</div>
                              </button>
                            ))}
                          </div>
                        </SettingCard>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-border/50 bg-muted/20">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={resetSettings}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="w-3 h-3 mr-1.5" />
                  Reset All
                </Button>
                <div className="flex items-center gap-3">
                  {hasChanges && (
                    <span className="text-xs text-muted-foreground">Unsaved changes</span>
                  )}
                  <Button
                    size="sm"
                    onClick={saveSettings}
                    disabled={!hasChanges}
                    className="text-xs"
                  >
                    <Save className="w-3 h-3 mr-1.5" />
                    Save Changes
                  </Button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </TooltipProvider>
  );
}
