import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open as dialogOpen } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FileText, Trash2, Upload, Download, RefreshCw, Folder, Hash, Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { MTConfig } from "@/types/mt-config";
import { useSettings } from "@/contexts/SettingsContext";

interface VaultFile {
  name: string;
  path: string;
  last_modified: string;
  size: number;
  category: string | null;
  tags?: string[];
  comments?: string;
  magic_number?: number;
}

interface VaultListing {
  vault_path: string;
  files: VaultFile[];
}

interface VaultPageProps {
  onLoadConfig: (config: MTConfig) => void;
}

export function VaultPage({ onLoadConfig }: VaultPageProps) {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [vaultPath, setVaultPath] = useState<string>("-");
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { settings } = useSettings();
  const tauriAvailable = useMemo(
    () => typeof window !== "undefined" && Boolean((window as any).__TAURI_INTERNALS__),
    []
  );

  const loadFiles = async () => {
    try {
      if (!tauriAvailable) {
        setFiles([]);
        setVaultPath("-");
        return;
      }

      setLoading(true);
      const result = await invoke<VaultListing>("list_vault_files", {
        vault_path_override: settings.vaultPath
      });
      setFiles(result.files);
      setVaultPath(result.vault_path);
    } catch (error) {
      toast.error(`Failed to load vault files: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [settings.vaultPath]);

  const filteredFiles = useMemo(() => {
    if (!searchQuery) return files;
    const query = searchQuery.toLowerCase();
    return files.filter(f => 
      f.name.toLowerCase().includes(query) || 
      f.tags?.some(t => t.toLowerCase().includes(query)) ||
      f.category?.toLowerCase().includes(query)
    );
  }, [files, searchQuery]);

  const groupedFiles = useMemo(() => {
    const grouped: Record<string, VaultFile[]> = {};
    const uncategorized: VaultFile[] = [];

    filteredFiles.forEach((file) => {
      if (file.category) {
        if (!grouped[file.category]) {
          grouped[file.category] = [];
        }
        grouped[file.category].push(file);
      } else {
        uncategorized.push(file);
      }
    });

    return { grouped, uncategorized };
  }, [filteredFiles]);

  const handleLoad = async (file: VaultFile) => {
    try {
      setLoading(true);
      let config: MTConfig;
      
      if (file.name.endsWith(".json")) {
        config = await invoke<MTConfig>("import_json_file", { filePath: file.path });
      } else {
        config = await invoke<MTConfig>("import_set_file", { filePath: file.path });
      }
      
      onLoadConfig(config);
      toast.success(`Loaded configuration: ${file.name}`);
    } catch (error) {
      toast.error(`Failed to load file: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (file: VaultFile) => {
    if (!confirm(`Are you sure you want to delete ${file.name}?`)) return;
    
    try {
      await invoke("delete_from_vault", {
        filename: file.path,
        vault_path_override: settings.vaultPath
      });
      toast.success("File deleted");
      loadFiles();
    } catch (error) {
      toast.error(`Failed to delete file: ${error}`);
    }
  };

  const handleExport = async (file: VaultFile) => {
    try {
      const path = await save({
        defaultPath: file.name,
        filters: [{
          name: file.name.endsWith('.json') ? 'JSON Config' : 'MT Set File',
          extensions: [file.name.endsWith('.json') ? 'json' : 'set']
        }]
      });
      
      if (path) {
        await invoke("export_vault_file", { filename: file.path, targetPath: path });
        toast.success(`Exported to ${path}`);
      }
    } catch (error) {
      toast.error(`Failed to export file: ${error}`);
    }
  };

  const handleImportToVault = async () => {
    try {
      const selected = await dialogOpen({
        multiple: false,
        filters: [{
          name: 'Configuration Files',
          extensions: ['set', 'json']
        }]
      });

      if (selected) {
        setLoading(true);
        const filePath = selected as string;
        // 1. Load the config
        let config: MTConfig;
        if (filePath.endsWith(".json")) {
            config = await invoke<MTConfig>("import_json_file", { filePath });
        } else {
            config = await invoke<MTConfig>("import_set_file", { filePath });
        }

        // 2. Extract filename for the vault name
        const fileName = filePath.split(/[\\/]/).pop()?.replace(/\.(set|json)$/, "") || "Imported_Config";

        // 3. Save to Vault (defaulting to 'Imported' category)
        await invoke("save_to_vault", {
          config,
          name: fileName,
          category: "Imported",
          vault_path_override: settings.vaultPath
        });

        toast.success(`Imported ${fileName} to Vault`);
        loadFiles();
      }
    } catch (error) {
      console.error("Import failed:", error);
      toast.error(`Failed to import: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenVaultFolder = async () => {
    try {
      await invoke("open_vault_folder", {
        vault_path_override: settings.vaultPath
      });
    } catch (error) {
      toast.error(`Failed to open folder: ${error}`);
    }
  };

  const FileItem = ({ file }: { file: VaultFile }) => (
    <div
      className="grid grid-cols-12 gap-4 items-center p-4 bg-card/50 hover:bg-muted/50 rounded-xl transition-all border border-border/40 hover:border-border group shadow-sm hover:shadow-md"
    >
      <div className="col-span-5 font-medium flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ${file.name.endsWith(".json") ? "bg-blue-500 shadow-blue-500/20" : "bg-emerald-500 shadow-emerald-500/20"} shadow-lg`} />
            <span className="truncate text-sm font-semibold text-foreground" title={file.name}>{file.name}</span>
            {file.magic_number !== undefined && (
                <span className="flex items-center gap-1 text-[10px] font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded ml-2 border border-border/50">
                    <Hash className="w-3 h-3" />
                    {file.magic_number}
                </span>
            )}
        </div>
        {file.tags && file.tags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap ml-5">
                {file.tags.map(tag => (
                    <span key={tag} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-md font-medium">
                        {tag}
                    </span>
                ))}
            </div>
        )}
        {file.comments && (
             <div className="text-xs text-muted-foreground ml-5 line-clamp-1 group-hover:line-clamp-none transition-all">
                {file.comments}
             </div>
        )}
      </div>
      <div className="col-span-3 text-xs text-muted-foreground">
        {file.last_modified}
      </div>
      <div className="col-span-2 text-xs text-muted-foreground font-mono">
        {(file.size / 1024).toFixed(1)} KB
      </div>
      <div className="col-span-2 flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => handleLoad(file)}
          title="Load into Dashboard"
          className="h-8 w-8 p-0"
        >
          <Upload className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleExport(file)}
          title="Save to PC"
          className="h-8 w-8 p-0"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => handleDelete(file)}
          title="Delete"
          className="h-8 w-8 p-0 hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-background/50 animate-in fade-in duration-300">
      {/* Header */}
      <div className="px-6 py-6 border-b border-border/50 bg-background/50 backdrop-blur-sm">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3 text-foreground">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              Configuration Vault
            </h1>
            <p className="text-sm text-muted-foreground mt-1 ml-12">
              Manage, organize, and deploy your trading strategies and presets
            </p>
            {!tauriAvailable ? (
              <div className="text-xs text-amber-500 mt-2 ml-12">
                Vault requires the Tauri app backend. Browser-only localhost cannot access files.
              </div>
            ) : (
              <div className="text-xs text-muted-foreground font-mono mt-2 ml-12">
                Vault path: {vaultPath}
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <Button onClick={handleImportToVault} disabled={loading || !tauriAvailable} className="shadow-lg shadow-primary/20">
              <Plus className="h-4 w-4 mr-2" />
              Import Configuration
            </Button>
            <Button onClick={handleOpenVaultFolder} disabled={loading || !tauriAvailable} variant="outline">
              <Folder className="h-4 w-4 mr-2" />
              Open Folder
            </Button>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search configurations, tags, categories..." 
              className="pl-9 bg-muted/30 border-border/50 focus:bg-background transition-colors"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button variant="outline" size="icon" onClick={loadFiles} disabled={loading} title="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 px-6 py-6">
        <div className="space-y-6 max-w-5xl mx-auto pb-20">
          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground border-2 border-dashed border-border/50 rounded-xl bg-muted/10">
              <div className="p-4 bg-muted/30 rounded-full mb-4">
                <Folder className="w-8 h-8 opacity-50" />
              </div>
              <p className="text-lg font-medium text-foreground">Vault is empty</p>
              <p className="text-sm max-w-xs text-center mt-2 mb-6">
                {!tauriAvailable
                  ? "Vault is unavailable in browser-only mode. Run the Tauri app to load presets."
                  : `Add .set/.json files under: ${vaultPath}`}
              </p>
              <Button variant="outline" onClick={handleImportToVault} disabled={!tauriAvailable}>
                <Upload className="w-4 h-4 mr-2" />
                Import File
              </Button>
            </div>
          ) : (
            <>
              {/* Categorized Files */}
              {Object.keys(groupedFiles.grouped).length > 0 && (
                <div className="space-y-6">
                  {Object.entries(groupedFiles.grouped).map(([category, catFiles]) => (
                    <div key={category} className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground/80 px-1">
                        <Folder className="h-4 w-4 text-amber-500" />
                        {category}
                        <span className="text-xs text-muted-foreground font-normal bg-muted px-2 py-0.5 rounded-full">
                          {catFiles.length}
                        </span>
                      </div>
                      <div className="grid gap-3">
                        {catFiles.map((file) => (
                          <FileItem key={file.path} file={file} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Uncategorized Files */}
              {groupedFiles.uncategorized.length > 0 && (
                <div className="space-y-3 mt-8">
                  {Object.keys(groupedFiles.grouped).length > 0 && (
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground/80 px-1 border-t pt-6">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Uncategorized
                    </div>
                  )}
                  <div className="grid gap-3">
                    {groupedFiles.uncategorized.map((file) => (
                      <FileItem key={file.path} file={file} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
