import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as dialogOpen, save } from "@tauri-apps/plugin-dialog";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FileText, Trash2, Upload, Download, RefreshCw, Folder, Hash, Play, Terminal } from "lucide-react";
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

interface VaultManagerProps {
  open: boolean;
  onClose: () => void;
  onLoadConfig: (config: MTConfig) => void;
}

export function VaultManager({ open, onClose, onLoadConfig }: VaultManagerProps) {
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [vaultPath, setVaultPath] = useState<string>("-");
  const [loading, setLoading] = useState(false);
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
    if (open) {
      loadFiles();
    }
  }, [open, settings.vaultPath]);

  const groupedFiles = useMemo(() => {
    const grouped: Record<string, VaultFile[]> = {};
    const uncategorized: VaultFile[] = [];

    files.forEach((file) => {
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
  }, [files]);

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
      onClose();
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

  const handleExportToMT4 = async (file: VaultFile) => {
    try {
      setLoading(true);
      // Export the vault file directly to MT4's Common Files directory
      await invoke("export_vault_file_to_mt_common_files", { 
        sourceFilePath: file.path,
        terminalType: "mt4"
      });
      toast.success(`Exported ${file.name} to MT4 Common Files`);
    } catch (error) {
      toast.error(`Failed to export to MT4: ${error}`);
    } finally {
      setLoading(false);
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
        // Simple extraction from path
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

  const FileItem = ({ file }: { file: VaultFile }) => (
    <div
      className="grid grid-cols-12 gap-4 items-center p-3 hover:bg-muted/50 rounded-lg transition-colors border border-transparent hover:border-border group"
    >
      <div className="col-span-6 font-medium flex flex-col gap-1">
        <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${file.name.endsWith(".json") ? "bg-blue-500" : "bg-green-500"}`} />
            <span className="truncate" title={file.name}>{file.name}</span>
            {file.magic_number !== undefined && (
                <span className="flex items-center gap-1 text-[10px] font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded ml-2 border border-border/50">
                    <Hash className="w-3 h-3" />
                    {file.magic_number}
                </span>
            )}
        </div>
        {file.tags && file.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap ml-4">
                {file.tags.map(tag => (
                    <span key={tag} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                        {tag}
                    </span>
                ))}
            </div>
        )}
        {file.comments && (
             <div className="text-xs text-muted-foreground ml-4 line-clamp-1 group-hover:line-clamp-none transition-all">
                {file.comments}
             </div>
        )}
      </div>
      <div className="col-span-3 text-sm text-muted-foreground">
        {file.last_modified}
      </div>
      <div className="col-span-1 text-sm text-muted-foreground font-mono">
        {(file.size / 1024).toFixed(1)} KB
      </div>
      <div className="col-span-2 flex gap-1 justify-end">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleLoad(file)}
          title="Load into Dashboard"
          className="h-8 w-8"
        >
          <Upload className="h-4 w-4 text-primary" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleExportToMT4(file)}
          title="Send to MT4"
          className="h-8 w-8"
        >
          <Terminal className="h-4 w-4 text-orange-500" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleExport(file)}
          title="Save to PC"
          className="h-8 w-8"
        >
          <Download className="h-4 w-4 text-blue-500" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => handleDelete(file)}
          title="Delete"
          className="h-8 w-8 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px] h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex justify-between items-center pr-8">
            <div>
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <FileText className="h-6 w-6 text-primary" />
                Configuration Vault
              </DialogTitle>
              <DialogDescription>
                Manage your saved trading strategies and presets
              </DialogDescription>
              {!tauriAvailable ? (
                <div className="mt-2 text-xs text-amber-500">
                  Vault requires the Tauri app backend. Browser-only localhost cannot access files.
                </div>
              ) : (
                <div className="mt-2 text-xs text-muted-foreground font-mono">
                  Vault path: {vaultPath}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleImportToVault} disabled={loading || !tauriAvailable}>
                <Upload className="h-4 w-4 mr-2" />
                Import File
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await invoke("open_vault_folder", {
                      vault_path_override: settings.vaultPath
                    });
                  } catch (error) {
                    toast.error(`Failed to open folder: ${error}`);
                  }
                }}
                disabled={loading || !tauriAvailable}
              >
                <Folder className="h-4 w-4 mr-2" />
                Open Folder
              </Button>
              <Button variant="outline" size="sm" onClick={loadFiles} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden mt-4">
          <div className="grid grid-cols-12 gap-4 px-4 py-2 bg-muted/50 font-medium text-sm rounded-t-lg">
            <div className="col-span-6">Name</div>
            <div className="col-span-3">Last Modified</div>
            <div className="col-span-1">Size</div>
            <div className="col-span-2 text-right pr-2">Actions</div>
          </div>
          <ScrollArea className="h-[calc(100%-40px)] border rounded-b-lg p-2">
            <div className="space-y-1">
              {files.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  {!tauriAvailable
                    ? "Vault is unavailable in browser-only mode. Run the Tauri app to load presets."
                    : `No files found in Vault. Add .set/.json files under: ${vaultPath}`}
                </div>
              ) : (
                <>
                  {/* Categorized Files */}
                  {Object.keys(groupedFiles.grouped).length > 0 && (
                    <Accordion type="multiple" defaultValue={Object.keys(groupedFiles.grouped)} className="mb-2">
                      {Object.entries(groupedFiles.grouped).map(([category, catFiles]) => (
                        <AccordionItem value={category} key={category} className="border-b-0 mb-1">
                          <AccordionTrigger className="hover:no-underline py-2 px-3 bg-muted/30 rounded-md data-[state=open]:rounded-b-none text-sm font-semibold">
                            <div className="flex items-center gap-2">
                              <Folder className="h-4 w-4 text-amber-500" />
                              {category}
                              <span className="text-xs text-muted-foreground font-normal ml-2">({catFiles.length})</span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pt-1 pb-2 pl-2">
                            {catFiles.map((file) => (
                              <FileItem key={file.path} file={file} />
                            ))}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  )}

                  {/* Uncategorized Files */}
                  {groupedFiles.uncategorized.length > 0 && (
                    <div className="space-y-1 mt-2">
                      {Object.keys(groupedFiles.grouped).length > 0 && (
                        <div className="px-3 py-2 text-sm font-semibold text-muted-foreground flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Uncategorized
                        </div>
                      )}
                      {groupedFiles.uncategorized.map((file) => (
                        <FileItem key={file.path} file={file} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
