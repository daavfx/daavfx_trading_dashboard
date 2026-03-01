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
}

export const generalCategoriesList = [
  { id: "risk_management", label: "Risk Management", icon: Shield, color: "text-red-400" },
  { id: "compounding", label: "Compounding", icon: TrendingUp, color: "text-indigo-400" },
  { id: "restart_policy", label: "Restart Policy", icon: RotateCw, color: "text-orange-400" },
  { id: "news", label: "News Filter", icon: Newspaper, color: "text-amber-400" },
  { id: "time", label: "Time Filter", icon: Clock, color: "text-blue-400" },
  { id: "general", label: "General", icon: Settings2, color: "text-slate-400" },
  { id: "ui", label: "UI Settings", icon: Palette, color: "text-teal-400" },
  { id: "logs", label: "Logs", icon: Terminal, color: "text-green-400" },
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
}: GeneralCategoriesProps) {
  const [expandedCategories, setExpandedCategories] = useState<string[]>(["risk_management"]);
  const [generalEditScope, setGeneralEditScope] = useState<"Buy" | "Sell">(
    "Buy",
  );

  const toggleCategory = (id: string) => {
    setExpandedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const expandAll = () => setExpandedCategories(generalCategoriesList.map((c) => c.id));
  const collapseAll = () => setExpandedCategories([]);

  const handleUpdate = (categoryId: string, fieldId: string, value: any) => {
    if (!generalConfig || !onConfigChange) return;

    const newConfig = JSON.parse(JSON.stringify(generalConfig));
    
    if (fieldId === "grid_unit" && typeof value === "string") {
        const n = parseInt(value, 10);
        if (!Number.isNaN(n)) value = n;
    }

    if (categoryId === "general" && fieldId === "trading_direction") {
        if (value === "Buy Only") {
            newConfig.allow_buy = true;
            newConfig.allow_sell = false;
        } else if (value === "Sell Only") {
            newConfig.allow_buy = false;
            newConfig.allow_sell = true;
        } else {
            newConfig.allow_buy = false;
            newConfig.allow_sell = false;
        }
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

  const renderModeSelectors = () => (
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
        return generalInputs.risk_management.fields.map(field => ({
          id: field.id,
          label: field.mt4_variable.replace("gInput_", "").replace(/([A-Z])/g, ' $1').trim(),
          value: (riskScoped as any)?.[field.id] ?? field.default,
          type: mapType(field.type),
          unit: (field as any).unit,
          description: field.description,
          options: (field as any).options,
          onChange: createHandler(field.id)
        }));

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
        const fields = generalInputs.global_system.fields
            .filter(f => f.id !== "allow_buy" && f.id !== "allow_sell")
            .filter(f => f.id !== "magic_number_buy" && f.id !== "magic_number_sell")
            .map(field => ({
              id: field.id,
              label: field.mt4_variable.replace("gInput_", "").replace(/([A-Z])/g, ' $1').trim(),
              value: generalConfig[field.id as keyof GeneralConfig] ?? field.default,
              type: mapType(field.type),
              unit: (field as any).unit,
              description: field.description,
              onChange: createHandler(field.id)
            }));
            
        if (generalEditScope === "Sell") {
          fields.unshift({
            id: "magic_number_sell",
            label: "Magic Number (Sell)",
            value: generalConfig.magic_number_sell,
            type: "number" as const,
            description: "Terminal-facing magic number for Buy/Sell cycles",
            onChange: createHandler("magic_number_sell"),
          });
        } else {
          fields.unshift({
            id: "magic_number_buy",
            label: "Magic Number (Buy)",
            value: generalConfig.magic_number_buy,
            type: "number" as const,
            description: "Terminal-facing magic number for Buy/Sell cycles",
            onChange: createHandler("magic_number_buy"),
          });
        }

        // Compute direction
        let direction = "Disabled";
        if (generalConfig.allow_buy && generalConfig.allow_sell) direction = "Buy Only";
        else if (generalConfig.allow_buy) direction = "Buy Only";
        else if (generalConfig.allow_sell) direction = "Sell Only";
        
        fields.unshift({
            id: "trading_direction",
            label: "Trading Direction",
            value: direction,
            type: "segmented" as any,
            description: "Control whether the EA can open Buy or Sell trades",
            options: ["Buy Only", "Sell Only", "Disabled"],
            onChange: createHandler("trading_direction")
        } as any);
        
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
        
      case "restart_policy":
        return generalInputs.restart_policies.fields.map(field => ({
          id: field.id,
          label: field.mt4_variable.replace("gInput_", "").replace(/([A-Z])/g, ' $1').trim(),
          value: generalConfig[field.id as keyof GeneralConfig] ?? field.default,
          type: mapType(field.type),
          unit: (field as any).unit,
          description: field.description,
          options: (field as any).options,
          onChange: createHandler(field.id)
        }));

      case "logs":
         return [
           { id: "enable_logs", label: "Enable Logs", value: generalConfig.enable_logs ? "ON" : "OFF", type: "toggle" as const, description: "Enable detailed logging (gInput_EnableLogs)", onChange: createHandler("enable_logs") }
         ];
         
      case "ui":
        return [
          { id: "theme", label: "Theme", value: "Dark", type: "text" as const, description: "UI Theme" },
          { id: "language", label: "Language", value: "English", type: "text" as const, description: "UI Language" }
        ];

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
                      <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Action & Restart</h4>
                      <div className="grid gap-2">
                        {session.fields.filter(f => 
                          !f.id.includes("header") && 
                          !f.id.includes("enabled") && 
                          !f.id.includes("start_") && 
                          !f.id.includes("end_") && 
                          !f.id.includes("day")
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

  const renderRiskManagement = (fields: any[]) => {
    const spreadFields = fields.filter(f => f.id.includes("spread"));
    const equityFields = fields.filter(f => f.id.includes("equity"));
    const drawdownFields = fields.filter(f => f.id.includes("drawdown"));

    const renderGroup = (title: string, groupFields: any[], icon: any, color: string) => (
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <div className={cn("w-1 h-3 rounded-full", color)} />
          <h4 className="text-xs font-medium text-foreground/80">{title}</h4>
        </div>
        <div className="grid gap-2 p-3 rounded-lg bg-black/10 border border-white/5 hover:border-white/10 transition-colors">
          {groupFields.map(f => (
            <ConfigField key={f.id} {...f} />
          ))}
        </div>
      </div>
    );

    return (
      <div className="space-y-4">
        <Card className="bg-card/40 border-border/60">
          <CardHeader className="pb-3">
             <CardTitle className="text-sm font-medium flex items-center gap-2">
               <Shield className="w-4 h-4 text-red-400" />
               Risk Management Controls
             </CardTitle>
             <CardDescription className="text-xs">
               Configure safety mechanisms to protect your account
             </CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-4">
             {renderGroup("Spread Protection", spreadFields, Shield, "bg-blue-400")}
             {renderGroup("Equity Protection", equityFields, TrendingUp, "bg-green-400")}
             {renderGroup("Drawdown Protection", drawdownFields, TrendingUp, "bg-red-400")}
          </CardContent>
        </Card>
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
                <div className="grid gap-4 md:grid-cols-2">
                   {modeFields.map(f => (
                      <ConfigField key={f.id} {...f} />
                   ))}
                </div>
             </div>
             
             <div className="p-4 rounded-lg bg-black/10 border border-white/5">
                <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Risk Parameters</h4>
                <div className="grid gap-4 md:grid-cols-2">
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
    const otherFields = fields.filter(f => !impactFields.includes(f) && !timeFields.includes(f));

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
    return (
      <div className="space-y-4">
         <Card className="bg-card/40 border-border/60">
            <CardHeader className="pb-3">
               <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-slate-400" />
                  Global System Parameters
               </CardTitle>
               <CardDescription className="text-xs">
                  Core settings affecting the entire trading operation
               </CardDescription>
            </CardHeader>
            <CardContent>
               <div className="grid md:grid-cols-2 gap-6">
                  {fields.map(f => (
                     <div key={f.id} className="p-3 rounded-lg bg-black/10 border border-white/5 hover:bg-black/20 transition-colors">
                        <ConfigField {...f} />
                     </div>
                  ))}
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
        case "ui": return renderUISettings(fields);
        case "logs": return renderLogs(fields);
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
        {renderModeSelectors()}
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

      {renderModeSelectors()}

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
