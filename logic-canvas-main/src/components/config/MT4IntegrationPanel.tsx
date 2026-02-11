import { useState, useEffect, useMemo } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { 
  FolderOpen, 
  Settings, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle,
  ChevronRight,
  HardDrive,
  Save,
  Upload,
  Download,
  Trash2,
  Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { 
  Tabs, 
  TabsContent, 
  TabsList, 
  TabsTrigger 
} from "@/components/ui/tabs";
import { toast } from "sonner";
import type { MTConfig } from "@/types/mt-config";

interface MT4Settings {
  terminal_path: string;
  common_files_path: string;
  profiles_path: string;
  broker_name: string;
  is_valid: boolean;
}

interface MT4IntegrationPanelProps {
  onLoadConfig: (config: MTConfig) => void;
  onExportComplete: (filename: string) => void;
}

export function MT4IntegrationPanel({ onLoadConfig, onExportComplete }: MT4IntegrationPanelProps) {
  const { getMT4Settings, autoDetectMT4, setMT4Path, testMT4Connection } = useSettings();
  const [loading, setLoading] = useState(false);
  const [customPath, setCustomPath] = useState("");
  const [activeTab, setActiveTab] = useState("detect");
  const [settings, setSettings] = useState<MT4Settings | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const result = await getMT4Settings();
      setSettings({
        terminal_path: result.terminalPath,
        common_files_path: result.commonFilesPath,
        profiles_path: result.profilesPath,
        broker_name: result.brokerName,
        is_valid: result.isValid,
      });
    } catch (error) {
      console.error("Failed to load MT4 settings:", error);
    }
  };

  const handleAutoDetect = async () => {
    setLoading(true);
    try {
      const result = await autoDetectMT4();
      setSettings({
        terminal_path: result.terminalPath,
        common_files_path: result.commonFilesPath,
        profiles_path: result.profilesPath,
        broker_name: result.brokerName,
        is_valid: result.isValid,
      });
      if (result.isValid) {
        toast.success(`Found MT4: ${result.brokerName}`);
      } else {
        toast.warning("MT4 not automatically detected");
      }
    } catch (error) {
      toast.error(`Detection failed: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomPath = async () => {
    if (!customPath.trim()) return;
    setLoading(true);
    try {
      const isValid = await setMT4Path(customPath);
      if (isValid) {
        await loadSettings();
        toast.success(`MT4 configured`);
      } else {
        toast.error("Invalid MT4 path");
      }
    } catch (error) {
      toast.error(`Configuration failed: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnection = async () => {
    if (!settings?.common_files_path) return;
    setLoading(true);
    try {
      const result = await testMT4Connection();
      if (result) {
        toast.success("MT4 connection successful");
      } else {
        toast.error("Cannot access MT4 Common Files");
      }
    } catch (error) {
      toast.error(`Connection test failed: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenFolder = async (folder: "terminal" | "common" | "profiles") => {
    try {
      await invoke("open_mt_folder", { folderType: folder });
    } catch (error) {
      toast.error(`Failed to open folder: ${error}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <HardDrive className="w-4 h-4" />
            MT4 Integration Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {settings ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                {settings.is_valid ? (
                  <span className="flex items-center gap-1 text-green-500 text-xs">
                    <CheckCircle className="w-3 h-3" />
                    Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-500 text-xs">
                    <AlertCircle className="w-3 h-3" />
                    Not Connected
                  </span>
                )}
              </div>
              
              {settings.is_valid && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Broker</span>
                    <span className="text-sm font-medium">{settings.broker_name || "Unknown"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Terminal</span>
                    <span className="text-xs font-mono truncate max-w-[200px]">
                      {settings.terminal_path || "Not set"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Common Files</span>
                    <span className="text-xs font-mono truncate max-w-[200px]">
                      {settings.common_files_path || "Not set"}
                    </span>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              <p className="text-sm">MT4 not configured</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuration Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="detect" className="text-xs">
            Auto-Detect
          </TabsTrigger>
          <TabsTrigger value="manual" className="text-xs">
            Manual Setup
          </TabsTrigger>
        </TabsList>

        <TabsContent value="detect" className="space-y-4 mt-4">
          <div className="text-center py-6 space-y-4">
            <div className="p-3 rounded-full bg-primary/10 w-fit mx-auto">
              <RefreshCw className={`w-6 h-6 text-primary ${loading ? 'animate-spin' : ''}`} />
            </div>
            <div>
              <p className="text-sm font-medium">Auto-Detect MT4 Installation</p>
              <p className="text-xs text-muted-foreground mt-1">
                Scans common locations for MetaTrader 4
              </p>
            </div>
            <Button 
              onClick={handleAutoDetect} 
              disabled={loading}
              className="w-full"
            >
              {loading ? "Scanning..." : "Scan for MT4"}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="manual" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="mt4path" className="text-xs">
              MT4 Terminal Path
            </Label>
            <Input
              id="mt4path"
              placeholder="C:\Users\...\AppData\Roaming\MetaQuotes\Terminal\..."
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              className="text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Navigate to the folder containing terminal64.exe
            </p>
          </div>
          <Button 
            onClick={handleCustomPath} 
            disabled={loading || !customPath.trim()}
            className="w-full"
          >
            Configure MT4 Path
          </Button>
        </TabsContent>
      </Tabs>

      {/* Quick Actions */}
      {settings?.is_valid && (
        <div className="space-y-3">
          <Label className="text-xs font-medium">Quick Actions</Label>
          <div className="grid grid-cols-3 gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="text-xs"
              onClick={() => handleOpenFolder("terminal")}
            >
              <FolderOpen className="w-3 h-3 mr-1" />
              Terminal
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="text-xs"
              onClick={() => handleOpenFolder("common")}
            >
              <FolderOpen className="w-3 h-3 mr-1" />
              Files
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="text-xs"
              onClick={handleTestConnection}
              disabled={loading}
            >
              <CheckCircle className="w-3 h-3 mr-1" />
              Test
            </Button>
          </div>
        </div>
      )}

      {/* Workflow Guide */}
      <Card className="border-dashed">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ChevronRight className="w-4 h-4" />
            Workflow Guide
          </CardTitle>
          <CardDescription className="text-xs">
            How to use with MT4
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-xs">
            <div className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px]">
                1
              </span>
              <p>Configure MT4 path above (auto-detect or manual)</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px]">
                2
              </span>
              <p>Build your strategy using the dashboard</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px]">
                3
              </span>
              <p>Export to .set file using the File Operations panel</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px]">
                4
              </span>
              <p>File is automatically copied to MT4 Common Files</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[10px]">
                5
              </span>
              <p>In MT4: Attach EA, load .set file from inputs</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
