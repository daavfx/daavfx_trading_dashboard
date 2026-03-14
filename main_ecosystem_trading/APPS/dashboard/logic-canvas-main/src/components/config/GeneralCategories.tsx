import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  ArrowLeftRight,
  Shield,
  Newspaper,
  Clock,
  Key,
  Settings2,
  Palette,
  FileText,
  TrendingUp,
  RotateCw,
  Terminal,
  Zap,
  Activity,
  AlertTriangle,
  Globe,
  Monitor,
  Lock,
  User
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfigField } from "./ConfigField";
import type { GeneralConfig } from "@/types/mt-config";
import { generalInputs } from "@/data/general-inputs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Platform } from "@/components/layout/TopBar";

interface GeneralCategoriesProps {
  allCollapsed?: boolean;
  generalConfig?: GeneralConfig;
  selectedCategory?: string;
  onSelectGeneralCategory?: (category: string | null) => void;
  onConfigChange?: (config: GeneralConfig) => void;
  platform?: Platform;
  mtPlatform?: Platform;
  mode?: 1 | 2;
  isHorizontal?: boolean;
  selectedEngines?: string[];
  selectedGroups?: string[];
  selectedLogics?: string[];
}

export const generalCategoriesList = [
  { id: "risk_management", label: "Risk Management", icon: Shield, color: "text-red-400", hasBuySell: true },
  { id: "general", label: "Core", icon: Settings2, color: "text-slate-400", hasBuySell: false },
] as const;

export function GeneralCategories({ 
  allCollapsed, 
  generalConfig, 
  selectedCategory,
  onSelectGeneralCategory,
  onConfigChange,
  platform,
  mtPlatform,
  mode = 1,
  isHorizontal = false,
  selectedEngines = [],
  selectedGroups = [],
  selectedLogics = [],
}: GeneralCategoriesProps) {
  const [expandedCategories, setExpandedCategories] = useState<string[]>(["risk_management"]);
  const [generalEditScope, setGeneralEditScope] = useState<"Buy" | "Sell">(
    "Buy",
  );
  
  // Expanded sections within risk management view
  const [expandedRiskSections, setExpandedRiskSections] = useState<string[]>([
    "spread", "slippage", "equity", "balance", "compounding", "news", "time"
  ]);

  // Calculate selection summary for Control view
  const enginesCount = selectedEngines.length;
  const groupsCount = selectedGroups.length;
  const logicsCount = selectedLogics.length;
  
  // Each logic has Buy and Sell variants (x2)
  const buySellMultiplier = 2;
  const totalEditCount = enginesCount * groupsCount * logicsCount * buySellMultiplier;
  
  const isSingleEdit = enginesCount === 1 && groupsCount === 1 && logicsCount === 1;
  const isMultiEdit = !isSingleEdit && totalEditCount > 0;
  
  const toggleCategory = (id: string) => {
    setExpandedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const expandAll = () => setExpandedCategories(generalCategoriesList.map((c) => c.id));
  const collapseAll = () => setExpandedCategories([]);
  
  // Risk section toggles
  const toggleRiskSection = (section: string) => {
    setExpandedRiskSections(prev => 
      prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
    );
  };
  
  const expandAllRiskSections = () => setExpandedRiskSections([
    "spread", "slippage", "equity", "balance", "compounding", "news", "time"
  ]);
  
  const collapseAllRiskSections = () => setExpandedRiskSections([]);

  const handleUpdate = (categoryId: string, fieldId: string, value: any) => {
    if (!generalConfig || !onConfigChange) return;

    const newConfig = JSON.parse(JSON.stringify(generalConfig));
    
    if (fieldId === "grid_unit" && typeof value === "string") {
        const n = parseInt(value, 10);
        if (!Number.isNaN(n)) value = n;
    }
    
    // Handle slippage fields at global level (not buy/sell scoped)
    if (fieldId === "slippage_enabled") {
        newConfig.slippage_enabled = value === "ON";
        onConfigChange(newConfig);
        return;
    }
    if (fieldId === "max_slippage_points") {
        newConfig.max_slippage_points = typeof value === "string" ? parseInt(value, 10) : value;
        onConfigChange(newConfig);
        return;
    }

    if (categoryId === "general" && (fieldId === "allow_buy" || fieldId === "allow_sell")) {
        // Handle allow_buy and allow_sell as direct boolean toggles
        const boolValue = value === "ON" || value === true || value === 1 || value === "true";
        newConfig[fieldId] = boolValue;
        onConfigChange(newConfig);
        return;
    } else if (categoryId === "general" && (fieldId === "magic_number_buy" || fieldId === "magic_number_sell")) {
        newConfig[fieldId] = typeof value === "string" ? parseInt(value, 10) : value;
    } else if (categoryId === "risk_management") {
        const setRisk = (key: "risk_management" | "risk_management_b" | "risk_management_s") => {
          if (!newConfig[key]) newConfig[key] = {};
          newConfig[key][fieldId] = value;
        };
        if (generalEditScope === "Buy") setRisk("risk_management_b");
        else setRisk("risk_management_s");
    } else if (categoryId === "time") {
        const setTime = (key: "time_filters" | "time_filters_b" | "time_filters_s") => {
          if (!newConfig[key]) newConfig[key] = {};
          if (fieldId.startsWith("session_")) {
            const match = fieldId.match(/^session_(\d+)_(.+)$/);
            if (!match) return;
            const idx = parseInt(match[1]) - 1;
            const prop = match[2];
            if (!newConfig[key].sessions) newConfig[key].sessions = [];
            if (!newConfig[key].sessions[idx]) newConfig[key].sessions[idx] = {};
            newConfig[key].sessions[idx][prop] = value;
          } else {
            if (!newConfig[key].priority_settings) newConfig[key].priority_settings = {};
            newConfig[key].priority_settings[fieldId] = value;
          }
        };

        if (generalEditScope === "Buy") setTime("time_filters_b");
        else setTime("time_filters_s");
    } else if (categoryId === "news") {
         const setNews = (key: "news_filter" | "news_filter_b" | "news_filter_s") => {
           if (!newConfig[key]) newConfig[key] = {};
           newConfig[key][fieldId] = value;
         };
         if (generalEditScope === "Buy") setNews("news_filter_b");
         else setNews("news_filter_s");
    } else if (categoryId === "compounding") {
         newConfig[`compounding_${fieldId}`] = value;
    } else if (categoryId === "logs") {
         newConfig[fieldId] = value === "ON";
    } else {
         newConfig[fieldId] = value;
    }
    
    onConfigChange(newConfig);
  };

  const getScopedValue = <T,>(base: T | undefined, buy: T | undefined, sell: T | undefined): T | undefined => {
    if (generalEditScope === "Buy") return buy ?? base;
    return sell ?? base;
  };

  const renderModeSelectors = (showBuySell: boolean = true) => {
    if (!showBuySell) return null;
    return (
    <div className="mb-3 p-3 bg-muted/30 rounded-lg border border-border/50">
      <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
        <ArrowLeftRight className="w-3 h-3" />
        Buy / Sell Edit Side
      </div>
      <ToggleGroup
        type="single"
        value={generalEditScope === "Buy" ? "buy" : "sell"}
        onValueChange={(val) => {
          if (!val) return;
          if (val === "buy") setGeneralEditScope("Buy");
          else if (val === "sell") setGeneralEditScope("Sell");
        }}
        className="flex flex-col sm:flex-row justify-start gap-2 w-full"
      >
        <ToggleGroupItem
          value="buy"
          className={cn(
            "flex-1 h-8 px-3 text-xs",
            "data-[state=on]:bg-emerald-500/20 data-[state=on]:text-emerald-500 border border-border/50 data-[state=on]:border-emerald-500/30",
          )}
        >
          Buy
        </ToggleGroupItem>
        <ToggleGroupItem
          value="sell"
          className={cn(
            "flex-1 h-8 px-3 text-xs",
            "data-[state=on]:bg-rose-500/20 data-[state=on]:text-rose-500 border border-border/50 data-[state=on]:border-rose-500/30",
          )}
        >
          Sell
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
  }

  // Helper to map type string to "number" | "toggle" | "text" | "select"
  const mapType = (type: string): "number" | "toggle" | "text" | "select" | "header" => {
    if (type === "bool") return "toggle";
    if (type === "int" || type === "double") return "number";
    if (type === "enum") return "select";
    if (type === "header") return "header";
    return "text";
  };

  // Map real config to fields
  const getRealCategoryFields = (categoryId: string) => {
    if (!generalConfig) return [];
    
    const createHandler = (id: string) => (val: any) => handleUpdate(categoryId, id, val);

    switch (categoryId) {
      case "risk_management":
        const riskScoped = getScopedValue(
          generalConfig.risk_management,
          generalConfig.risk_management_b,
          generalConfig.risk_management_s,
        );
        // Get risk management fields from the risk_management object
        const riskFields = generalInputs.risk_management.fields.map(field => ({
          id: field.id,
          label: field.label || field.mt4_variable.replace("gInput_", "").replace(/([A-Z])/g, ' $1').trim(),
          value: (riskScoped as any)?.[field.id] ?? field.default,
          type: mapType(field.type),
          unit: (field as any).unit,
          description: field.description,
          options: (field as any).options,
          onChange: createHandler(field.id)
        }));
        
        // Add slippage fields at global level (not Buy/Sell scoped)
        riskFields.push({
          id: "slippage_header",
          label: "Slippage Protection",
          type: "header" as const,
          value: "",
          onChange: () => {}
        });
        riskFields.push({
          id: "slippage_enabled",
          label: "Enable Slippage Protection",
          value: generalConfig.slippage_enabled ? "ON" : "OFF",
          type: "toggle" as const,
          description: "Enable maximum slippage protection",
          onChange: createHandler("slippage_enabled")
        });
        riskFields.push({
          id: "max_slippage_points",
          label: "Max Slippage Points",
          value: generalConfig.max_slippage_points ?? 30,
          type: "number" as const,
          unit: "pts",
          description: "Maximum permitted slippage in points",
          onChange: createHandler("max_slippage_points")
        });
        
        return riskFields;

      case "time":
        const timeScoped = getScopedValue(
          generalConfig.time_filters,
          generalConfig.time_filters_b,
          generalConfig.time_filters_s,
        );
        return generalInputs.time_filters.fields.map(field => {
          let value;
          const sessionIdMatch = field.id.match(/^session_(\d+)_(.+)$/);
          
          if (sessionIdMatch) {
             const sessionIndex = parseInt(sessionIdMatch[1]) - 1;
             const propName = sessionIdMatch[2];
             
             if (propName === "header") {
               value = ""; 
             } else {
              value = (timeScoped as any)?.sessions?.[sessionIndex]?.[propName] ?? field.default;
             }
          } else {
             // Priority settings
             value = (timeScoped as any)?.priority_settings?.[field.id] ?? field.default;
          }

          return {
            id: field.id,
            label: (field as any).label || field.mt4_variable.replace("gInput_TimeFilter_", "").replace(/([A-Z])/g, ' $1').trim(),
            value: value,
            type: mapType(field.type),
            unit: (field as any).unit,
            description: field.description,
            options: (field as any).options,
            onChange: createHandler(field.id)
          };
        });

      case "news":
        const newsScoped = getScopedValue(
          generalConfig.news_filter,
          generalConfig.news_filter_b,
          generalConfig.news_filter_s,
        );
        return generalInputs.news_filter.fields.map(field => ({
          id: field.id,
          label: field.mt4_variable.replace("gInput_", "").replace(/([A-Z])/g, ' $1').trim(),
          value: (newsScoped as any)?.[field.id] ?? field.default,
          type: mapType(field.type),
          unit: (field as any).unit,
          description: field.description,
          options: (field as any).options,
          onChange: createHandler(field.id)
        }));

      case "license":
        return generalInputs.license.fields.map(field => ({
          id: field.id,
          label: field.mt4_variable.replace("gInput_", "").replace(/([A-Z])/g, ' $1').trim(),
          value: generalConfig[field.id as keyof GeneralConfig] ?? field.default,
          type: mapType(field.type),
          unit: (field as any).unit,
          description: field.description,
          onChange: createHandler(field.id)
        }));
        
      case "general":
        const baseFields = generalInputs.global_system.fields
            .filter(f => f.id !== "allow_buy" && f.id !== "allow_sell")
            .filter(f => f.id !== "magic_number_buy" && f.id !== "magic_number_sell")
            .filter(f => f.id !== "max_slippage_points")
            .map(field => ({
              id: field.id,
              label: field.mt4_variable.replace("gInput_", "").replace(/([A-Z])/g, ' $1').trim(),
              value: generalConfig[field.id as keyof GeneralConfig] ?? field.default,
              type: mapType(field.type),
              unit: (field as any).unit,
              description: field.description,
              onChange: createHandler(field.id)
            }));

        const magicFields = generalInputs.global_system.fields
            .filter(f => f.id === "magic_number_buy" || f.id === "magic_number_sell")
            .map(field => ({
              id: field.id,
              label:
                field.id === "magic_number_buy"
                  ? "Magic Number (Buy)"
                  : "Magic Number (Sell)",
              value: generalConfig[field.id as keyof GeneralConfig] ?? field.default,
              type: mapType(field.type),
              unit: (field as any).unit,
              description: field.description,
              onChange: createHandler(field.id)
            }));

        const fields = [...magicFields, ...baseFields];
            
        // Add separate Buy/Sell enable toggles at the top
        fields.unshift({
            id: "allow_sell",
            label: "Sell Enabled",
            value: generalConfig.allow_sell ? "ON" : "OFF",
            type: "toggle" as const,
            description: "Enable EA to open SELL orders",
            onChange: createHandler("allow_sell")
        });
        fields.unshift({
            id: "allow_buy",
            label: "Buy Enabled",
            value: generalConfig.allow_buy ? "ON" : "OFF",
            type: "toggle" as const,
            description: "Enable EA to open BUY orders",
            onChange: createHandler("allow_buy")
        });

        // Add UI Settings and Logs as headers
        fields.push({
          id: "ui_settings_header",
          label: "UI Settings",
          type: "header" as const,
          value: "",
          onChange: () => {}
        });
        fields.push({
          id: "theme",
          label: "Theme",
          value: "Dark",
          type: "text" as const,
          description: "UI Theme",
          onChange: () => {}
        });
        fields.push({
          id: "language",
          label: "Language",
          value: "English",
          type: "text" as const,
          description: "UI Language",
          onChange: () => {}
        });
        fields.push({
          id: "logs_header",
          label: "Logs",
          type: "header" as const,
          value: "",
          onChange: () => {}
        });
        fields.push({
          id: "enable_logs",
          label: "Enable Logs",
          value: generalConfig.enable_logs ? "ON" : "OFF",
          type: "toggle" as const,
          description: "Enable detailed logging",
          onChange: createHandler("enable_logs")
        });
        
        return fields;
        
      case "compounding":
        return generalInputs.compounding.fields.map(field => ({
          id: field.id,
          label: field.mt4_variable.replace("gInput_", "").replace(/([A-Z])/g, ' $1').trim(),
          // Prefix with 'compounding_' because they are flattened in GeneralConfig but names in generalInputs are 'enabled', 'type' etc.
          value: generalConfig[`compounding_${field.id}` as keyof GeneralConfig] ?? field.default,
          type: mapType(field.type),
          unit: (field as any).unit,
          description: field.description,
          options: (field as any).options,
          onChange: createHandler(field.id)
        }));
      // Restart Policy moved to per-logic in Group 1
      // UI Settings and Logs merged into Core

      default:
        return [];
    }
  };

  // --- Specialized Renderers ---

  const renderTimeFilter = (fields: any[]) => {
    const priorityFields = fields.filter(f => !f.id.startsWith("session_"));
    const sessionFields = fields.filter(f => f.id.startsWith("session_"));
    
    // Group sessions
    const sessions = Array.from({ length: 7 }, (_, i) => {
      const sessionNum = i + 1;
      return {
        id: sessionNum,
        label: `Session ${sessionNum}`,
        fields: sessionFields.filter(f => f.id.startsWith(`session_${sessionNum}_`))
      };
    });

    return (
      <div className="space-y-6">
        <Card className="bg-card/40 border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" />
              Priority Settings
            </CardTitle>
            <CardDescription className="text-xs">
              Configure how different filters interact with each other
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
             {priorityFields.filter(f => f.type !== "header").map(field => (
                <ConfigField key={field.id} {...field} />
             ))}
          </CardContent>
        </Card>

        <Tabs defaultValue="session-1" className="w-full">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-muted-foreground">Session Configuration</h3>
            <TabsList className="h-8 bg-muted/30 p-0.5">
              {sessions.map(s => (
                <TabsTrigger 
                  key={s.id} 
                  value={`session-${s.id}`}
                  className="text-[10px] h-7 px-3 data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
                >
                  S{s.id}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {sessions.map(session => (
            <TabsContent key={session.id} value={`session-${session.id}`} className="mt-0">
              <Card className="bg-card/40 border-border/60">
                <CardHeader className="pb-3 border-b border-white/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Clock className="w-4 h-4 text-blue-400" />
                        {session.label}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Configure operating hours and behavior for this session
                      </CardDescription>
                    </div>
                    {session.fields.find(f => f.id.includes("enabled")) && (
                      <div className="scale-90 origin-right">
                        <ConfigField {...session.fields.find(f => f.id.includes("enabled"))!} label="Enable Session" />
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-4 grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 space-y-2 p-3 rounded-lg bg-black/10 border border-white/5">
                      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Time Window</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           {session.fields.filter(f => f.id.includes("start_hour") || f.id.includes("start_minute")).map(f => (
                             <ConfigField key={f.id} {...f} />
                           ))}
                        </div>
                        <div className="space-y-2">
                           {session.fields.filter(f => f.id.includes("end_hour") || f.id.includes("end_minute")).map(f => (
                             <ConfigField key={f.id} {...f} />
                           ))}
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-white/5">
                        {session.fields.filter(f => f.id.includes("day")).map(f => (
                           <ConfigField key={f.id} {...f} />
                        ))}
                      </div>
                    </div>
                    <div className="col-span-2 space-y-2 p-3 rounded-lg bg-black/10 border border-white/5">
                      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Session Actions</h4>
                      <div className="grid grid-cols-3 gap-2">
                        {session.fields.filter(f => 
                          f.id.includes("stop_ea") || f.id.includes("close_trades") || f.id.includes("restart_mode")
                        ).map(f => (
                          <ConfigField key={f.id} {...f} />
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    );
  };

  // UNIFIED RISK MANAGEMENT - ALL in ONE canvas: Risk + Compounding + News + Time
  const renderRiskManagement = (fields: any[]) => {
    // Get fields for each category
    const compoundingFields = getRealCategoryFields("compounding");
    const newsFields = getRealCategoryFields("news");
    const timeFields = getRealCategoryFields("time");

    // Filter from risk_management fields
    const spreadFields = fields.filter(f => f.id.includes("spread"));
    const slippageFields = fields.filter(f => f.id.includes("slippage"));
    const equityProtectionFields = fields.filter(f => f.id.startsWith("equity_protection"));
    const balanceProtectionFields = fields.filter(f => f.id.startsWith("balance_protection"));

    // Collapsible section component
    const CollapsibleSection = ({ 
      id, 
      title, 
      icon, 
      iconColor, 
      children,
      defaultExpanded = true 
    }: { 
      id: string; 
      title: string; 
      icon: React.ReactNode; 
      iconColor: string;
      children: React.ReactNode;
      defaultExpanded?: boolean;
    }) => {
      const isExpanded = expandedRiskSections.includes(id);
      
      return (
        <Card className="bg-card/40 border-border/60 overflow-hidden">
          <CardHeader 
            className="py-3 px-4 cursor-pointer select-none hover:bg-muted/30 transition-colors"
            onClick={() => toggleRiskSection(id)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <span className={iconColor}>{icon}</span>
                {title}
              </CardTitle>
              <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
            </div>
          </CardHeader>
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <CardContent className="grid grid-cols-2 gap-4 pt-0">
                  {children}
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      );
    };

    // Simple collapsible section without Card wrapper (for compound sections)
    const SimpleCollapsibleSection = ({ 
      id, 
      title, 
      icon, 
      iconColor, 
      children,
    }: { 
      id: string; 
      title: string; 
      icon: React.ReactNode; 
      iconColor: string;
      children: React.ReactNode;
    }) => {
      const isExpanded = expandedRiskSections.includes(id);
      
      return (
        <div className="bg-card/40 border border-border/60 rounded-lg overflow-hidden">
          <div 
            className="py-3 px-4 cursor-pointer select-none hover:bg-muted/30 transition-colors flex items-center justify-between"
            onClick={() => toggleRiskSection(id)}
          >
            <div className="flex items-center gap-2">
              <span className={iconColor}>{icon}</span>
              <span className="text-sm font-medium">{title}</span>
            </div>
            <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
          </div>
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="px-2 pb-2"
              >
                {children}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    };

    const riskSections = [
      { id: "spread", title: "Spread Protection", icon: <Shield className="w-4 h-4" />, iconColor: "text-blue-400", fields: spreadFields, prefix: "spread_" },
      { id: "slippage", title: "Slippage Protection", icon: <Shield className="w-4 h-4" />, iconColor: "text-amber-400", fields: slippageFields.filter(f => f.type !== "header"), prefix: "slippage_" },
      { id: "equity", title: "Equity Protection", icon: <TrendingUp className="w-4 h-4" />, iconColor: "text-green-400", fields: equityProtectionFields, prefix: "equity_" },
      { id: "balance", title: "Balance Protection", icon: <TrendingUp className="w-4 h-4" />, iconColor: "text-purple-400", fields: balanceProtectionFields, prefix: "balance_" },
    ];

    return (
      <div className="space-y-4">
        {/* Expand/Collapse All Buttons - Fixed Position */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pb-3 pt-2 border-b border-border/50">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <span className="text-sm text-muted-foreground font-medium">
              {expandedRiskSections.length} of {riskSections.length + 3} sections expanded
            </span>
            <div className="flex gap-2">
              <button
                onClick={expandAllRiskSections}
                className="text-xs px-4 py-2 rounded-md bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors font-medium"
              >
                Expand All
              </button>
              <button
                onClick={collapseAllRiskSections}
                className="text-xs px-4 py-2 rounded-md bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors font-medium"
              >
                Collapse All
              </button>
            </div>
          </div>
        </div>

        {/* Risk Sections */}
        {riskSections.map(section => (
          <CollapsibleSection
            key={section.id}
            id={section.id}
            title={section.title}
            icon={section.icon}
            iconColor={section.iconColor}
          >
            {section.fields.map(f => (
              <ConfigField key={`${section.prefix}${f.id}`} {...f} />
            ))}
          </CollapsibleSection>
        ))}

        {/* COMPOUNDING - Simple collapsible without extra Card */}
        <SimpleCollapsibleSection
          id="compounding"
          title="Compounding Strategy"
          icon={<TrendingUp className="w-4 h-4" />}
          iconColor="text-indigo-400"
        >
          <Card className="bg-card/40 border-border/60">
            <CardContent className="grid grid-cols-2 gap-4">
              {renderCompounding(compoundingFields)}
            </CardContent>
          </Card>
        </SimpleCollapsibleSection>

        {/* NEWS FILTER - Simple collapsible without extra Card */}
        <SimpleCollapsibleSection
          id="news"
          title="News Filter"
          icon={<Newspaper className="w-4 h-4" />}
          iconColor="text-red-400"
        >
          <Card className="bg-card/40 border-border/60">
            <CardContent className="grid grid-cols-2 gap-4">
              {renderNewsFilter(newsFields)}
            </CardContent>
          </Card>
        </SimpleCollapsibleSection>

        {/* TIME FILTER - Simple collapsible without extra Card */}
        <SimpleCollapsibleSection
          id="time"
          title="Time Filter"
          icon={<Clock className="w-4 h-4" />}
          iconColor="text-cyan-400"
        >
          <Card className="bg-card/40 border-border/60">
            <CardContent className="grid grid-cols-2 gap-4">
              {renderTimeFilter(timeFields)}
            </CardContent>
          </Card>
        </SimpleCollapsibleSection>
      </div>
    );
  };

  const renderCompounding = (fields: any[]) => {
    const modeFields = fields.filter(f => f.id.includes("mode") || f.type === "select" || f.type === "toggle");
    const paramFields = fields.filter(f => !modeFields.includes(f));

    return (
      <div className="space-y-4">
        <Card className="bg-card/40 border-border/60">
          <CardHeader className="pb-3">
             <CardTitle className="text-sm font-medium flex items-center gap-2">
               <TrendingUp className="w-4 h-4 text-indigo-400" />
               Compounding Strategy
             </CardTitle>
             <CardDescription className="text-xs">
               Manage how your position sizes grow with your account
             </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
             <div className="p-4 rounded-lg bg-indigo-500/5 border border-indigo-500/10">
                <h4 className="text-[10px] font-semibold text-indigo-300 uppercase tracking-wider mb-3">Strategy Selection</h4>
                <div className="grid grid-cols-2 gap-4">
                   {modeFields.map(f => (
                      <ConfigField key={f.id} {...f} />
                   ))}
                </div>
             </div>
             
             <div className="p-4 rounded-lg bg-black/10 border border-white/5">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Risk Parameters</h4>
                <div className="grid grid-cols-2 gap-4">
                   {paramFields.map(f => (
                      <ConfigField key={f.id} {...f} />
                   ))}
                </div>
             </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderRestartPolicy = (fields: any[]) => {
    return (
      <div className="space-y-4">
        <Card className="bg-card/40 border-border/60">
          <CardHeader className="pb-3">
             <CardTitle className="text-sm font-medium flex items-center gap-2">
               <RotateCw className="w-4 h-4 text-orange-400" />
               Restart Logic
             </CardTitle>
             <CardDescription className="text-xs">
               Define conditions for restarting the EA after stops or targets
             </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
             <div className="p-4 rounded-lg bg-orange-500/5 border border-orange-500/10">
                <div className="flex items-center gap-2 mb-3">
                   <Zap className="w-3 h-3 text-orange-400" />
                   <h4 className="text-[10px] font-semibold text-orange-300 uppercase tracking-wider">Trigger Conditions</h4>
                </div>
                <div className="grid gap-3">
                   {fields.map(f => (
                      <ConfigField key={f.id} {...f} />
                   ))}
                </div>
             </div>
             
             <div className="p-4 rounded-lg bg-black/10 border border-white/5 flex flex-col justify-center items-center text-center space-y-2">
                <Activity className="w-8 h-8 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground max-w-[200px]">
                   Proper restart policies ensure continuous operation without manual intervention.
                </p>
             </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderNewsFilter = (fields: any[]) => {
    const impactFields = fields.filter(f => f.id.includes("impact"));
    const timeFields = fields.filter(f => f.id.includes("minutes") || f.id.includes("time"));
    const actionFields = fields.filter(f => f.id === "stop_ea" || f.id === "close_trades" || f.id === "restart_mode");
    const otherFields = fields.filter(f => !impactFields.includes(f) && !timeFields.includes(f) && !actionFields.includes(f));

    return (
      <div className="space-y-4">
        <Card className="bg-card/40 border-border/60">
          <CardHeader className="pb-3">
             <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Newspaper className="w-4 h-4 text-amber-400" />
                Economic Calendar Filter
             </CardTitle>
             <CardDescription className="text-xs">
                Avoid trading during high-impact news events
             </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
             {/* Impact Selection */}
             <div className="grid md:grid-cols-3 gap-4">
                {impactFields.map(f => (
                   <div key={f.id} className="p-3 rounded-lg bg-black/20 border border-white/5 flex flex-col items-center text-center gap-2">
                      <AlertTriangle className={cn("w-5 h-5", 
                        f.id.includes("high") ? "text-red-500" : 
                        f.id.includes("medium") ? "text-orange-500" : "text-yellow-500"
                      )} />
                      <div className="w-full">
                         <ConfigField {...f} />
                      </div>
                   </div>
                ))}
             </div>

             <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                   <h4 className="text-xs font-medium text-foreground/80 flex items-center gap-2">
                      <Clock className="w-3 h-3 text-blue-400" /> Timing Rules
                   </h4>
                   <div className="p-3 rounded-lg bg-black/10 border border-white/5 grid gap-3">
                      {timeFields.map(f => (
                         <ConfigField key={f.id} {...f} />
                      ))}
                   </div>
                </div>
                
                <div className="space-y-3">
                   <h4 className="text-xs font-medium text-foreground/80 flex items-center gap-2">
                      <Globe className="w-3 h-3 text-green-400" /> Filter Scope
                   </h4>
                   <div className="p-3 rounded-lg bg-black/10 border border-white/5 grid gap-3">
                      {otherFields.map(f => (
                         <ConfigField key={f.id} {...f} />
                      ))}
                   </div>
                </div>
             </div>

             {/* Action & Restart Controls */}
             <div className="grid md:grid-cols-3 gap-4">
                {actionFields.map(f => (
                   <div key={f.id} className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                      <ConfigField {...f} />
                   </div>
                ))}
             </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderLicense = (fields: any[]) => {
    return (
      <div className="space-y-4">
        <Card className="bg-card/40 border-border/60">
           <CardHeader className="pb-3">
             <CardTitle className="text-sm font-medium flex items-center gap-2">
               <Key className="w-4 h-4 text-purple-400" />
               License Configuration
             </CardTitle>
             <CardDescription className="text-xs">
               Manage your product activation and account bindings
             </CardDescription>
           </CardHeader>
           <CardContent>
              <div className="flex flex-col md:flex-row gap-6">
                 <div className="flex-1 space-y-4">
                    {fields.map(f => (
                       <ConfigField key={f.id} {...f} />
                    ))}
                 </div>
                 <div className="md:w-1/3 flex flex-col items-center justify-center p-6 rounded-xl bg-purple-500/5 border border-purple-500/10 text-center space-y-3">
                    <div className="p-3 rounded-full bg-purple-500/10">
                       <User className="w-8 h-8 text-purple-400" />
                    </div>
                    <div>
                       <h4 className="text-sm font-medium text-purple-200">Account Protection</h4>
                       <p className="text-[10px] text-purple-300/60 mt-1">
                          Ensure your license key matches your trading account number.
                       </p>
                    </div>
                 </div>
              </div>
           </CardContent>
        </Card>
      </div>
    );
  };

  const renderGeneralGlobal = (fields: any[]) => {
    const mainFields = fields.filter(f => !f.type === "header");
    const uiFields = fields.filter(f => f.id === "theme" || f.id === "language" || f.id === "ui_settings_header");
    const logFields = fields.filter(f => f.id === "enable_logs" || f.id === "logs_header");
    const coreFields = fields.filter(f => f.id !== "theme" && f.id !== "language" && f.id !== "ui_settings_header" && f.id !== "enable_logs" && f.id !== "logs_header" && f.type !== "header");

    return (
      <div className="space-y-4">
        {/* Core System Parameters */}
        <Card className="bg-card/40 border-border/60 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-500/10 to-transparent px-4 py-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-200">Core System Parameters</span>
            </div>
            <p className="text-[10px] text-slate-400/60 mt-0.5">Essential settings for trading operation</p>
          </div>
          <CardContent className="p-4">
             <div className="grid grid-cols-2 gap-3">
              {coreFields.map(f => (
                <div key={f.id} className="p-3 rounded-lg bg-black/20 border border-white/5 hover:bg-black/30 transition-all">
                  <ConfigField {...f} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* UI Settings */}
        <Card className="bg-card/40 border-border/60 overflow-hidden">
          <div className="bg-gradient-to-r from-teal-500/10 to-transparent px-4 py-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-teal-400" />
              <span className="text-sm font-medium text-teal-200">Interface Settings</span>
            </div>
            <p className="text-[10px] text-teal-400/60 mt-0.5">Customize your dashboard appearance</p>
          </div>
          <CardContent className="p-4">
             <div className="grid grid-cols-2 gap-3">
              {uiFields.filter(f => f.type !== "header").map(f => (
                <div key={f.id} className="p-3 rounded-lg bg-black/20 border border-white/5 hover:bg-black/30 transition-all">
                  <ConfigField {...f} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Logs */}
        <Card className="bg-card/40 border-border/60 overflow-hidden">
          <div className="bg-gradient-to-r from-green-500/10 to-transparent px-4 py-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-green-200">Logging & Diagnostics</span>
            </div>
            <p className="text-[10px] text-green-400/60 mt-0.5">Debug and monitoring options</p>
          </div>
          <CardContent className="p-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-green-900/10 border border-green-500/20">
              <div className="flex items-center gap-3">
                <Activity className="w-5 h-5 text-green-400" />
                <div>
                   <h4 className="text-sm font-medium text-green-100">Debug Mode</h4>
                   <p className="text-[10px] text-green-400/60">Enable detailed logging output</p>
                </div>
              </div>
              <div className="w-32">
                {logFields.filter(f => f.id === "enable_logs").map(f => (
                  <ConfigField key={f.id} {...f} />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderUISettings = (fields: any[]) => {
     return (
        <div className="space-y-4">
           <Card className="bg-card/40 border-border/60">
              <CardHeader className="pb-3">
                 <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Palette className="w-4 h-4 text-teal-400" />
                    Interface Customization
                 </CardTitle>
                 <CardDescription className="text-xs">
                    Personalize your dashboard appearance
                 </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-6">
                 <div className="flex-1 grid gap-4">
                    {fields.map(f => (
                       <ConfigField key={f.id} {...f} />
                    ))}
                 </div>
                 <div className="hidden md:flex items-center justify-center w-1/3 p-4">
                    <Monitor className="w-24 h-24 text-teal-500/10" />
                 </div>
              </CardContent>
           </Card>
        </div>
     );
  };

  const renderLogs = (fields: any[]) => {
     return (
        <div className="space-y-4">
           <Card className="bg-card/40 border-border/60">
              <CardHeader className="pb-3">
                 <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-green-400" />
                    System Diagnostics
                 </CardTitle>
                 <CardDescription className="text-xs">
                    Control detailed logging output for debugging
                 </CardDescription>
              </CardHeader>
              <CardContent>
                 <div className="flex items-center justify-between p-4 rounded-lg bg-green-900/10 border border-green-500/20">
                    <div className="flex items-center gap-3">
                       <Activity className="w-5 h-5 text-green-400" />
                       <div>
                          <h4 className="text-sm font-medium text-green-100">Debug Mode</h4>
                          <p className="text-[10px] text-green-400/60">Enables verbose output to the console</p>
                       </div>
                    </div>
                    <div className="w-1/3">
                       {fields.map(f => (
                          <ConfigField key={f.id} {...f} />
                       ))}
                    </div>
                 </div>
              </CardContent>
           </Card>
        </div>
     );
  };

  // Single Category View Mode Logic
  if (selectedCategory) {
    // Horizontal Tab View Mode (Control Panel in Canvas)
    if (isHorizontal) {
      const hasSelection = selectedEngines.length > 0 || selectedGroups.length > 0 || selectedLogics.length > 0;
      const validCategory = selectedCategory && generalCategoriesList.find(c => c.id === selectedCategory)
        ? selectedCategory 
        : generalCategoriesList[0]?.id || "risk_management";
      
      return (
        <div className="space-y-4 p-4">
          {/* Category Tabs */}
          <div className="border-b border-border">
            <nav className="flex gap-1 -mb-px overflow-x-auto">
              {generalCategoriesList.map((category) => {
                const Icon = category.icon;
                const isActive = validCategory === category.id;
                return (
                  <button
                    key={category.id}
                    onClick={() => onSelectGeneralCategory?.(category.id)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                      isActive
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
                    )}
                  >
                    <Icon className={cn("w-4 h-4", category.color)} />
                    {category.label}
                  </button>
                );
              })}
            </nav>
          </div>
          
          {/* Selection Banner - Only show for Risk Management categories */}
          {validCategory === "risk_management" && hasSelection && (
            <div className={cn(
              "mt-3 p-4 rounded-lg border",
              isSingleEdit 
                ? "bg-neutral-800/60 border-neutral-700" 
                : "bg-neutral-800/60 border-neutral-700"
            )}>
              {/* Mode & Count */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {isSingleEdit ? (
                    <Zap className="w-4 h-4 text-blue-400" />
                  ) : (
                    <Activity className="w-4 h-4 text-amber-400" />
                  )}
                  <span className={cn(
                    "text-sm font-semibold",
                    isSingleEdit ? "text-blue-400" : "text-amber-400"
                  )}>
                    {isSingleEdit ? "SINGLE EDIT MODE" : "MULTI-EDIT MODE"}
                  </span>
                </div>
                <span className={cn(
                  "text-xs px-2 py-1 rounded font-mono",
                  isSingleEdit 
                    ? "bg-blue-500/20 text-blue-300" 
                    : "bg-amber-500/20 text-amber-300"
                )}>
                  {totalEditCount} configs
                </span>
              </div>
              
              {/* Applying To */}
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedEngines.length > 0 && (
                  <span className="px-2 py-1 rounded-md bg-blue-500/15 text-blue-400 text-xs font-medium border border-blue-500/20">
                    {selectedEngines.length === 1 ? selectedEngines[0] : `${selectedEngines.length} Engines`}
                  </span>
                )}
                {selectedGroups.length > 0 && (
                  <span className="px-2 py-1 rounded-md bg-green-500/15 text-green-400 text-xs font-medium border border-green-500/20">
                    {selectedGroups.length === 20 
                      ? "All 20 Groups" 
                      : selectedGroups.length === 1 ? selectedGroups[0] : `${selectedGroups.length} Groups`
                    }
                  </span>
                )}
                {selectedLogics.length > 0 && (
                  <span className="px-2 py-1 rounded-md bg-amber-500/15 text-amber-400 text-xs font-medium border border-amber-500/20">
                    {selectedLogics.length === 7 
                      ? "All 7 Logics" 
                      : selectedLogics.length === 1 ? selectedLogics[0] : `${selectedLogics.length} Logics`
                    }
                  </span>
                )}
                <span className="px-2 py-1 rounded-md bg-purple-500/15 text-purple-400 text-xs font-medium border border-purple-500/20">
                  Buy + Sell
                </span>
              </div>
              
              {/* Formula */}
              <div className="text-[10px] text-neutral-400 pt-2 border-t border-neutral-700">
                {enginesCount} engine{enginesCount !== 1 ? 's' : ''} × {groupsCount} group{groupsCount !== 1 ? 's' : ''} × {logicsCount} logic{logicsCount !== 1 ? 's' : ''} × 2 (Buy/Sell) = {totalEditCount}
              </div>
              
              {/* Buy/Sell Toggle */}
              <div className="mt-3 pt-3 border-t border-neutral-700">
                <ToggleGroup
                  type="single"
                  value={generalEditScope === "Buy" ? "buy" : "sell"}
                  onValueChange={(val) => {
                    if (!val) return;
                    if (val === "buy") setGeneralEditScope("Buy");
                    else if (val === "sell") setGeneralEditScope("Sell");
                  }}
                  className="flex gap-2 w-full"
                >
                  <ToggleGroupItem
                    value="buy"
                    className={cn(
                      "flex-1 h-9 px-4 text-sm font-medium",
                      "data-[state=on]:bg-emerald-500/20 data-[state=on]:text-emerald-400 data-[state=on]:border-emerald-500/30",
                      "border border-neutral-600 text-neutral-400 hover:text-emerald-400"
                    )}
                  >
                    Buy
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="sell"
                    className={cn(
                      "flex-1 h-9 px-4 text-sm font-medium",
                      "data-[state=on]:bg-rose-500/20 data-[state=on]:text-rose-400 data-[state=on]:border-rose-500/30",
                      "border border-neutral-600 text-neutral-400 hover:text-rose-400"
                    )}
                  >
                    Sell
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
            </div>
          )}
          
          {/* No selection warning for risk management */}
          {validCategory === "risk_management" && !hasSelection && (
            <div className="mt-3 p-4 rounded-lg bg-neutral-800/30 border border-dashed border-neutral-700">
              <div className="flex items-center gap-2 text-neutral-400">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm">Select engine, group, or logic from sidebar</span>
              </div>
            </div>
          )}
          
          {/* Buy/Sell toggle hidden for Core - no Buy/Sell distinction */}
          {validCategory === "general" && (
            <div className="mt-3">
              {/* Core (general) has no Buy/Sell distinction */}
            </div>
          )}
          
          <div>
            {(() => {
              const fields = getRealCategoryFields(validCategory);
              switch (validCategory) {
                case "time": return renderTimeFilter(fields);
                case "risk_management": return renderRiskManagement(fields);
                case "compounding": return renderCompounding(fields);
                case "restart_policy": return renderRestartPolicy(fields);
                case "news": return renderNewsFilter(fields);
                case "license": return renderLicense(fields);
                case "general": return renderGeneralGlobal(fields);
                default:
                  return (
                    <div className="grid grid-cols-2 gap-4">
                      {fields.map((field) => (
                        field.type === "header" ? (
                          <div key={field.id} className="col-span-2 mt-6 mb-2 pb-1 border-b border-white/10 flex items-center gap-2">
                            <div className="w-1 h-4 bg-primary/50 rounded-full" />
                            <h3 className="text-sm font-semibold text-primary/90 tracking-wide uppercase">{field.label}</h3>
                          </div>
                        ) : (
                          <ConfigField
                            key={field.id}
                            label={field.label}
                            value={field.value}
                            type={field.type as any}
                            unit={(field as any).unit}
                            description={field.description}
                            options={(field as any).options}
                          />
                        )
                      ))}
                    </div>
                  );
              }
              })()}
          </div>
        </div>
      );
    }

    const fields = getRealCategoryFields(selectedCategory);

    const content = (() => {
      switch (selectedCategory) {
        case "time": return renderTimeFilter(fields);
        case "risk_management": return renderRiskManagement(fields);
        case "compounding": return renderCompounding(fields);
        case "restart_policy": return renderRestartPolicy(fields);
        case "news": return renderNewsFilter(fields);
        case "license": return renderLicense(fields);
        case "general": return renderGeneralGlobal(fields);
        default:
          return (
            <div className="grid grid-cols-2 gap-4">
              {fields.map((field) => (
                field.type === "header" ? (
                   <div key={field.id} className="col-span-2 mt-6 mb-2 pb-1 border-b border-white/10 flex items-center gap-2">
                      <div className="w-1 h-4 bg-primary/50 rounded-full" />
                      <h3 className="text-sm font-semibold text-primary/90 tracking-wide uppercase">{field.label}</h3>
                   </div>
                ) : (
                <ConfigField
                  key={field.id}
                  label={field.label}
                  value={field.value}
                  type={field.type as any}
                  unit={(field as any).unit}
                  description={field.description}
                  options={(field as any).options}
                />
                )
              ))}
            </div>
          );
      }
    })();

    return (
      <div className="space-y-3">
        {renderModeSelectors(selectedCategory ? generalCategoriesList.find(c => c.id === selectedCategory)?.hasBuySell ?? true : true)}
        {content}
      </div>
    );
  }

  // Accordion View Mode (Sidebar/Default)
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">General Parameters</span>
        <div className="flex gap-1">
          <button
            onClick={expandAll}
            className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/30 transition-colors"
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className="text-[10px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted/30 transition-colors"
          >
            Collapse All
          </button>
        </div>
      </div>

      {(selectedCategory !== "general") && renderModeSelectors(true)}

      {generalCategoriesList.map((category) => {
        const Icon = category.icon;
        const fields = getRealCategoryFields(category.id);
        const expanded = expandedCategories.includes(category.id);
        const filledCount = fields.filter((f) => f.value !== "-" && f.value !== "").length;

        return (
          <div
            key={category.id}
            className="rounded border border-border/40 bg-card/30 overflow-hidden"
          >
            <button
              onClick={() => toggleCategory(category.id)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <motion.div
                  animate={{ rotate: expanded ? 90 : 0 }}
                  transition={{ duration: 0.1 }}
                >
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                </motion.div>
                <Icon className={cn("w-4 h-4", category.color)} />
                <span className="text-sm font-medium">{category.label}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent/70 rounded-full transition-all"
                    style={{ width: `${(filledCount / fields.length) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground font-mono w-8">
                  {filledCount}/{fields.length}
                </span>
              </div>
            </button>

            <AnimatePresence>
              {expanded && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: "auto" }}
                  exit={{ height: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-1">
                    {/* Reuse specialized renderers for accordion content if applicable, or default grid */}
                    {(() => {
                        // We can reuse the specialized renderers here for consistency, 
                        // but usually accordion content is more compact. 
                        // Let's stick to the grid for accordion to save space, or maybe a simplified version.
                        // For now, let's keep the grid but with the same map logic.
                        return (
                          <div className="grid grid-cols-2 gap-2">
                            {fields.map((field) => (
                              <ConfigField
                                key={field.id}
                                label={field.label}
                                value={field.value}
                                type={field.type as any}
                                unit={(field as any).unit}
                                description={field.description}
                                options={(field as any).options}
                              />
                            ))}
                          </div>
                        )
                    })()}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
