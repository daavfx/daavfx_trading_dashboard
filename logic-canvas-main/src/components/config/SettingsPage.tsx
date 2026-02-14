import { useState } from "react";
import { motion } from "framer-motion";
import {
  X,
  Settings,
  Save,
  RotateCcw,
  Keyboard,
  Bell,
  Shield,
  HardDrive,
  ArrowLeft,
  ChevronRight,
  Zap,
  Home,
  LayoutGrid,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useSettings } from "@/contexts/SettingsContext";

interface SettingsPageProps {
  onClose: () => void;
  onNavigateToHome?: () => void;
  onNavigateToEngines?: () => void;
  onNavigateToChat?: () => void;
}

// appearance controls removed

export function SettingsPage({ 
  onClose, 
  onNavigateToHome, 
  onNavigateToEngines, 
  onNavigateToChat 
}: SettingsPageProps) {
  const { settings, updateSetting, saveSettings, resetSettings, hasChanges } = useSettings();
  const [activeTab, setActiveTab] = useState<"behavior" | "data">("behavior");
  

  const tabs = [
    { id: "behavior" as const, label: "Behavior", icon: Settings },
    { id: "data" as const, label: "Data & Storage", icon: HardDrive },
  ];

  const quickNavItems = [
    { id: "home", label: "Dashboard", icon: Home, onClick: onNavigateToHome },
    { id: "engines", label: "Engines", icon: LayoutGrid, onClick: onNavigateToEngines },
    { id: "chat", label: "Chat", icon: MessageSquare, onClick: onNavigateToChat },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-background z-50 flex"
    >
      {/* Left Sidebar Navigation */}
      <div className="w-72 border-r border-border bg-muted/30 flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Settings</h1>
              <p className="text-xs text-muted-foreground">Customize your experience</p>
            </div>
          </div>
        </div>

        {/* Settings Tabs */}
        <ScrollArea className="flex-1 py-4">
          <div className="px-3 space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm transition-all duration-200",
                    activeTab === tab.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {activeTab === tab.id && (
                    <ChevronRight className="w-4 h-4 ml-auto" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Quick Navigation Section */}
          <div className="mt-8 px-6">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
              Quick Navigation
            </h3>
            <div className="space-y-1">
              {quickNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={item.onClick}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200"
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </ScrollArea>

        {/* Footer Actions */}
        <div className="p-4 border-t border-border space-y-2">
          <Button 
            variant="outline" 
            className="w-full justify-start gap-2" 
            onClick={resetSettings}
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Default
          </Button>
          <Button 
            className="w-full justify-start gap-2" 
            onClick={saveSettings}
            disabled={!hasChanges}
          >
            <Save className="w-4 h-4" />
            Save Settings
            {hasChanges && (
              <span className="ml-auto w-2 h-2 rounded-full bg-destructive" />
            )}
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="h-16 border-b border-border flex items-center justify-between px-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Settings</span>
            <ChevronRight className="w-4 h-4" />
            <span className="text-foreground font-medium capitalize">{activeTab}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1 p-8">
          <div className="max-w-3xl mx-auto space-y-8">
            {/* appearance tab removed */}

            {activeTab === "behavior" && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <section className="space-y-6">
                  {/* Autosave */}
                  <SettingToggle
                    label="Autosave"
                    description="Automatically save changes to your configuration"
                    icon={<Save className="w-4 h-4" />}
                    checked={settings.autosave}
                    onCheckedChange={(v) => updateSetting("autosave", v)}
                  />

                  {settings.autosave && (
                    <div className="pl-6 border-l-2 border-border ml-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm">Autosave Interval</span>
                        <span className="text-sm text-muted-foreground">{settings.autosaveInterval}s</span>
                      </div>
                      <Slider
                        value={[settings.autosaveInterval]}
                        onValueChange={([v]) => updateSetting("autosaveInterval", v)}
                        min={10}
                        max={120}
                        step={10}
                        className="w-full"
                      />
                    </div>
                  )}

                  {/* Notifications */}
                  <SettingToggle
                    label="Notifications"
                    description="Show desktop notifications for important events"
                    icon={<Bell className="w-4 h-4" />}
                    checked={settings.notifications}
                    onCheckedChange={(v) => updateSetting("notifications", v)}
                  />

                  {/* Sound Effects */}
                  <SettingToggle
                    label="Sound Effects"
                    description="Play sounds for actions and notifications"
                    checked={settings.soundEffects}
                    onCheckedChange={(v) => updateSetting("soundEffects", v)}
                  />

                  {/* Confirm on Close */}
                  <SettingToggle
                    label="Confirm on Close"
                    description="Ask before closing the application with unsaved changes"
                    icon={<Shield className="w-4 h-4" />}
                    checked={settings.confirmOnClose}
                    onCheckedChange={(v) => updateSetting("confirmOnClose", v)}
                  />

                  {/* Auto-Approve Transactions */}
                  <SettingToggle
                    label="Auto-Approve Transactions"
                    description="Automatically apply chat-generated configuration changes"
                    icon={<Zap className="w-4 h-4" />}
                    checked={settings.autoApproveTransactions}
                    onCheckedChange={(v) => updateSetting("autoApproveTransactions", v)}
                  />

                  {/* Keyboard Shortcuts */}
                  <SettingToggle
                    label="Keyboard Shortcuts"
                    description="Enable keyboard shortcuts for quick navigation"
                    icon={<Keyboard className="w-4 h-4" />}
                    checked={settings.keyboardShortcuts}
                    onCheckedChange={(v) => updateSetting("keyboardShortcuts", v)}
                  />

                  {/* Tooltips */}
                  <SettingToggle
                    label="Show Tooltips"
                    description="Display helpful tooltips on hover throughout the interface"
                    checked={settings.showTooltips}
                    onCheckedChange={(v) => updateSetting("showTooltips", v)}
                  />
                </section>
              </motion.div>
            )}

            {activeTab === "data" && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                

                {/* Grid Lines */}
                <SettingToggle
                  label="Grid Lines"
                  description="Show grid lines in tables for better readability"
                  checked={settings.gridLines}
                  onCheckedChange={(v) => updateSetting("gridLines", v)}
                />

                {/* Highlight Changes */}
                <SettingToggle
                  label="Highlight Changes"
                  description="Highlight modified values to track your edits"
                  checked={settings.highlightChanges}
                  onCheckedChange={(v) => updateSetting("highlightChanges", v)}
                />

                {/* Storage Info */}
                <section className="p-6 rounded-xl border border-border bg-muted/10">
                  <h2 className="text-lg font-semibold mb-4">Local Storage</h2>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between py-2 border-b border-border/40">
                      <span className="text-muted-foreground">Settings</span>
                      <span>1.2 KB</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-border/40">
                      <span className="text-muted-foreground">Vault Snapshots</span>
                      <span>24.5 KB</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-muted-foreground">Autosave Data</span>
                      <span>8.3 KB</span>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full mt-4">
                    Clear Local Data
                  </Button>
                </section>
              </motion.div>
            )}
          </div>
        </ScrollArea>
      </div>
    </motion.div>
  );
}

function SettingToggle({
  label,
  description,
  icon,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  icon?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-border/40 hover:border-border transition-colors">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium">{label}</span>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
