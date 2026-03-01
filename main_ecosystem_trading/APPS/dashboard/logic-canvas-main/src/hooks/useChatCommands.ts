// React Hook for Chat Command System
// HOTFIX: Force rebuild Dec 20 2024 11:57 AM

import { useState, useCallback, useEffect } from "react";

// MEMORY LEAK FIX: Limit message history to prevent unbounded memory growth
const MAX_CHAT_MESSAGES = 100;
import { parseCommand, getSuggestions, commandExecutor } from "@/lib/chat";
import type { ChatMessage, CommandResult } from "@/lib/chat/types";
import type { RoutingResponse } from "@/lib/chat/routing";
import type { MTConfig } from "@/types/mt-config";
import { useSettings } from "@/contexts/SettingsContext";
import { useChatState } from "@/contexts/ChatStateContext";
import { canonicalizeConfigForBackend, normalizeConfigForExport } from "@/utils/unit-mode";
import { save, open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

interface UseChatCommandsOptions {
  config: MTConfig | null;
  onConfigChange: (config: MTConfig) => void;
  onNavigate?: (target: {
    engines?: string[];
    groups?: number[];
    logics?: string[];
    fields?: string[];
  }) => void;
  onClearSelection?: () => void;
  defaultTarget?: { engines?: string[]; groups?: number[]; logics?: string[] };
}

export function useChatCommands({
  config,
  onConfigChange,
  onNavigate,
  onClearSelection,
  defaultTarget,
}: UseChatCommandsOptions) {
  const { settings, updateSetting, saveSettings } = useSettings();
  
  // Use ChatStateContext for persistent state across tab switches
  let chatState: ReturnType<typeof useChatState> | null = null;
  try {
    chatState = useChatState();
  } catch {
    // Context not available, use local state
  }
  
  // Local fallback state if context is not available
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "system",
      content:
        "Ryiuk: Type commands like 'set grid to 500 for G1', 'add 30% to lot for POWER', 'show grid for all'. Only factual commands accepted - no vague language.",
      timestamp: Date.now(),
    },
  ]);
  const [localInputValue, setLocalInputValue] = useState("");
  
  // Use context state if available, otherwise local state
  const messages = chatState?.messages ?? localMessages;
  const setMessages = chatState?.setMessages ?? setLocalMessages;
  const inputValue = chatState?.inputValue ?? localInputValue;
  const setInputValue = chatState?.setInputValue ?? setLocalInputValue;
  
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Sync config to executor
  useEffect(() => {
    commandExecutor.setConfig(config);
    commandExecutor.setOnConfigChange(onConfigChange);
    commandExecutor.setOnClearSelection(onClearSelection || (() => {}));
    commandExecutor.setAutoApprove(settings.autoApproveTransactions);
  }, [
    config,
    onConfigChange,
    onClearSelection,
    settings.autoApproveTransactions,
  ]);

  // Update suggestions as user types
  useEffect(() => {
    if (inputValue.length > 2) {
      setSuggestions(getSuggestions(inputValue));
    } else {
      setSuggestions([]);
    }
  }, [inputValue]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      const trimmed = text.trim();
      const lower = trimmed.toLowerCase();

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: Date.now(),
      };

      // Add user message immediately (limit to last 100 messages to prevent memory leaks)
      setMessages((prev) => [...prev.slice(-99), userMessage]);
      setInputValue("");
      setSuggestions([]);

      // Handle quick action results (internal messages)
      if (lower.startsWith("/quick-action-result:")) {
        const msg = trimmed.replace("/quick-action-result:", "").trim();
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: msg,
          timestamp: Date.now(),
        };
        setMessages((prev) => [
          ...prev.slice(-(MAX_CHAT_MESSAGES - 1)),
          assistantMessage,
        ]);
        setInputValue("");
        setSuggestions([]);
        return;
      }

      if (lower.startsWith("/fast") || lower.startsWith("#fast")) {
        const arg = trimmed
          .replace(/^[/#]fast/i, "")
          .trim()
          .toLowerCase();
        let next: boolean | null = null;

        if (!arg || arg === "toggle") {
          next = !settings.autoApproveTransactions;
        } else if (["on", "true", "1", "yes"].includes(arg)) {
          next = true;
        } else if (["off", "false", "0", "no"].includes(arg)) {
          next = false;
        }

        if (next === null) {
          const assistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: "❌ Usage: /fast on | /fast off | /fast (toggle)",
            timestamp: Date.now(),
          };
          setMessages((prev) => [
            ...prev.slice(-(MAX_CHAT_MESSAGES - 1)),
            assistantMessage,
          ]);
          return;
        }

        updateSetting("autoApproveTransactions", next);
        saveSettings();
        commandExecutor.setAutoApprove(next);
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: `✅ Fast mode ${next ? "ON" : "OFF"} (auto-approve ${next ? "enabled" : "disabled"})`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [
          ...prev.slice(-(MAX_CHAT_MESSAGES - 1)),
          assistantMessage,
        ]);
        return;
      }

      // Handle chat-level meta commands: /export, /load
      if (lower.startsWith("/export") || lower.startsWith("#export")) {
        if (!config) {
          const msg = "No configuration in memory to export";
          const assistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: `❌ ${msg}`,
            timestamp: Date.now(),
          };
          setMessages((prev) => [
            ...prev.slice(-(MAX_CHAT_MESSAGES - 2)),
            userMessage,
            assistantMessage,
          ]);
          setInputValue("");
          setSuggestions([]);
          return;
        }

        const isJson = lower.includes("json");
        const formatLabel = isJson ? "JSON" : ".set";

        try {
          const extension = isJson ? "json" : "set";
          const defaultName = `DAAVFX_Config.${extension}`;

          const filePath = await save({
            defaultPath: defaultName,
            filters: isJson
              ? [{ name: "JSON", extensions: ["json"] }]
              : [{ name: "Set File", extensions: ["set"] }],
          });

          if (!filePath) {
            const assistantMessage: ChatMessage = {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              content: "❌ Export cancelled",
              timestamp: Date.now(),
            };
            setMessages((prev) => [
              ...prev.slice(-(MAX_CHAT_MESSAGES - 2)),
              userMessage,
              assistantMessage,
            ]);
            setInputValue("");
            setSuggestions([]);
            return;
          }

          const configToExport = config ? canonicalizeConfigForBackend(config) : config;
          if (isJson) {
            await invoke("export_json_file", {
              config: normalizeConfigForExport(configToExport),
              filePath: filePath,
            });
          } else {
            await invoke("export_massive_v19_setfile", {
              config: normalizeConfigForExport(configToExport),
              filePath: filePath,
              platform: "MT4",
            });
          }

          const assistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: `✅ Exported ${formatLabel} file to ${String(filePath)}`,
            timestamp: Date.now(),
          };
          toast.success(`Exported ${formatLabel} file successfully`);
          setMessages((prev) => [
            ...prev.slice(-(MAX_CHAT_MESSAGES - 2)),
            userMessage,
            assistantMessage,
          ]);
        } catch (err) {
          const msg = `Export failed: ${err}`;
          const assistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: `❌ ${msg}`,
            timestamp: Date.now(),
          };
          toast.error(msg);
          setMessages((prev) => [
            ...prev.slice(-(MAX_CHAT_MESSAGES - 2)),
            userMessage,
            assistantMessage,
          ]);
        }

        setInputValue("");
        setSuggestions([]);
        return;
      }

      if (lower.startsWith("/load") || lower.startsWith("#load")) {
        const isJson = lower.includes("json");
        const formatLabel = isJson ? "JSON" : ".set";

        try {
          const filePath = await open({
            filters: isJson
              ? [{ name: "JSON", extensions: ["json"] }]
              : [{ name: "Set File", extensions: ["set"] }],
            multiple: false,
          });

          if (!filePath) {
            const assistantMessage: ChatMessage = {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              content: "❌ Load cancelled",
              timestamp: Date.now(),
            };
            setMessages((prev) => [
              ...prev.slice(-(MAX_CHAT_MESSAGES - 2)),
              userMessage,
              assistantMessage,
            ]);
            setInputValue("");
            setSuggestions([]);
            return;
          }

          let newConfig: MTConfig;
          if (isJson) {
            newConfig = await invoke<MTConfig>("import_json_file", {
              filePath: filePath,
            });
          } else {
            newConfig = await invoke<MTConfig>("import_set_file", {
              filePath: filePath,
            });
          }

          const name = Array.isArray(filePath)
            ? String(filePath[0])
                .split(/[/\\\\]/)
                .pop() || String(filePath[0])
            : String(filePath)
                .split(/[/\\\\]/)
                .pop() || String(filePath);
          newConfig = {
            ...newConfig,
            current_set_name: name,
          };

          onConfigChange(canonicalizeConfigForBackend(newConfig));
          const assistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: `✅ Loaded ${formatLabel} file (${newConfig.total_inputs} inputs)`,
            timestamp: Date.now(),
          };
          toast.success(`Loaded ${formatLabel} file successfully`);
          setMessages((prev) => [
            ...prev.slice(-(MAX_CHAT_MESSAGES - 2)),
            userMessage,
            assistantMessage,
          ]);
        } catch (err) {
          const msg = `Load failed: ${err}`;
          const assistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: `❌ ${msg}`,
            timestamp: Date.now(),
          };
          toast.error(msg);
          setMessages((prev) => [
            ...prev.slice(-(MAX_CHAT_MESSAGES - 2)),
            userMessage,
            assistantMessage,
          ]);
        }

        setInputValue("");
        setSuggestions([]);
        return;
      }

      // Parse and Execute
      // TinyLLM Routing - call backend FIRST - this is the source of truth
      let routingResponse: RoutingResponse | null = null;
      let useRustParsing = false;
      
      try {
        routingResponse = await invoke<RoutingResponse>('process_command', { input: trimmed });
        
        // If Rust parsed successfully, use that result
        const isUnknownCommand = routingResponse?.output?.toLowerCase().includes('unknown command') ?? false;
        const isLearnedPattern = routingResponse?.output?.toLowerCase().includes('learned pattern') ?? false;
        
        if (!isUnknownCommand && routingResponse) {
          useRustParsing = true;
          
          // If learned suggestion, show it but don't execute yet
          if (routingResponse.learned_suggestion && !isLearnedPattern) {
            const assistantMessage: ChatMessage = {
              id: `assistant-${Date.now()}`,
              role: "assistant",
              content: `Did you mean: ${routingResponse.learned_suggestion}?`,
              timestamp: Date.now(),
            };
            setMessages((prev) => [
              ...prev.slice(-(MAX_CHAT_MESSAGES - 1)),
              assistantMessage,
            ]);
            return;
          }
        }
        
        if (isUnknownCommand) {
          // Return the format hint from Rust
          const assistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: routingResponse?.output ?? "Unknown command. Try: 'set grid to 500 for G1'",
            timestamp: Date.now(),
          };
          setMessages((prev) => [
            ...prev.slice(-(MAX_CHAT_MESSAGES - 1)),
            assistantMessage,
          ]);
          return;
        }
      } catch (e) {
        console.warn('TinyLLM routing unavailable, using fallback:', e);
      }

      // If Rust parsing succeeded and it's a direct command, execute it; otherwise use local parser
      let parsed = useRustParsing 
        ? { type: "unknown" as const, target: { engines: [], groups: [], logics: [] }, changes: [] }
        : parseCommand(trimmed);
        
      const showPendingBanner = routingResponse?.pending_inference === true;

      const normalizeLogicToken = (token: string): { engine: string | null; name: string } => {
        const trimmedToken = String(token).trim();
        const m = trimmedToken.match(/^([A-Z])\s*[:/\\-]\s*(.+)$/i);
        if (m) return { engine: m[1].toUpperCase(), name: String(m[2]).trim().toUpperCase() };
        return { engine: null, name: trimmedToken.toUpperCase() };
      };

      const applyScope = <T,>(
        parsedTarget: T[] | undefined,
        scopeTarget: T[] | undefined,
        eq: (a: T, b: T) => boolean,
      ): { next: T[] | undefined; overlapped: boolean } => {
        const scope = scopeTarget && scopeTarget.length ? scopeTarget : undefined;
        const target = parsedTarget && parsedTarget.length ? parsedTarget : undefined;
        if (!scope) return { next: target, overlapped: true };
        if (!target) return { next: scope, overlapped: scope.length > 0 };
        const next = target.filter((t) => scope.some((s) => eq(t, s)));
        return { next, overlapped: next.length > 0 };
      };
      const targetIsEmpty =
        (!parsed.target.engines || parsed.target.engines.length === 0) &&
        (!parsed.target.groups || parsed.target.groups.length === 0) &&
        (!parsed.target.logics || parsed.target.logics.length === 0);
      const shouldApplyDefaultTarget =
        parsed.type === "set" ||
        parsed.type === "progression" ||
        parsed.type === "copy" ||
        parsed.type === "formula" ||
        parsed.type === "reset";

      let command = parsed;
      if (parsed.type !== "unknown" && shouldApplyDefaultTarget && defaultTarget) {
        const enginesScoped = applyScope(
          parsed.target.engines,
          defaultTarget.engines,
          (a, b) => String(a).toUpperCase() === String(b).toUpperCase(),
        );

        const groupsScoped = applyScope(
          parsed.target.groups,
          defaultTarget.groups,
          (a, b) => Number(a) === Number(b),
        );

        const scopeLogicTokens = (defaultTarget.logics || []).map(normalizeLogicToken);
        const parsedLogicTokens = (parsed.target.logics || []).map(normalizeLogicToken);
        const scopeHasLogics = scopeLogicTokens.length > 0;
        const parsedHasLogics = parsedLogicTokens.length > 0;

        let logicsNext: string[] | undefined;
        let logicsOverlapped = true;

        if (!scopeHasLogics) {
          logicsNext = parsed.target.logics;
        } else if (!parsedHasLogics) {
          logicsNext = (defaultTarget.logics || []).slice();
          logicsOverlapped = logicsNext.length > 0;
        } else {
          const nextTokens = scopeLogicTokens.filter((scopeTok) =>
            parsedLogicTokens.some((parsedTok) => {
              if (parsedTok.engine && scopeTok.engine) {
                return parsedTok.engine === scopeTok.engine && parsedTok.name === scopeTok.name;
              }
              if (parsedTok.engine && !scopeTok.engine) {
                return parsedTok.name === scopeTok.name;
              }
              if (!parsedTok.engine && scopeTok.engine) {
                return parsedTok.name === scopeTok.name;
              }
              return parsedTok.name === scopeTok.name;
            }),
          );

          logicsNext = nextTokens.map((t) => (t.engine ? `${t.engine}:${t.name}` : t.name));
          logicsOverlapped = logicsNext.length > 0;
        }

        if (!enginesScoped.overlapped || !groupsScoped.overlapped || !logicsOverlapped) {
          const assistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: "❌ Scope excludes all targets. Adjust Scope or command.",
            timestamp: Date.now(),
          };
          setMessages((prev) => [
            ...prev.slice(-(MAX_CHAT_MESSAGES - 1)),
            assistantMessage,
          ]);
          return;
        }

        command = {
          ...parsed,
          target: {
            ...parsed.target,
            engines: enginesScoped.next,
            groups: groupsScoped.next,
            logics: logicsNext,
          },
        };

        if (targetIsEmpty) {
          command = {
            ...command,
            target: {
              ...command.target,
              engines: command.target.engines,
              groups: command.target.groups,
              logics: command.target.logics,
            },
          };
        }
      }
      
      // DEBUG: Log parsed command details
      console.log("[ChatCommand Debug] Parsed:", {
        raw: command.raw,
        type: command.type,
        target: command.target,
        params: command.params,
      });
      
      const result: CommandResult = commandExecutor.execute(command);

      // AUTO-NAVIGATION DISABLED - Stay in Chat view
      // Navigation now only updates selection state without switching views
      // This allows users to see changes in the chat interface
      // if (result.success && result.queryResult?.navigationTargets && onNavigate) {
      //   onNavigate(result.queryResult.navigationTargets);
      // }

      // if (result.success && onNavigate && (result.pendingPlan || result.changes)) {
      //   const field =
      //     command.target.field ||
      //     result.pendingPlan?.preview?.[0]?.field ||
      //     result.changes?.[0]?.field;
      //   if (field) {
      //     onNavigate({
      //       engines: command.target.engines,
      //       groups: command.target.groups,
      //       logics: command.target.logics,
      //       fields: [field],
      //     });
      //   }
      // }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: result.success ? result.message : `❌ ${result.message}`,
        timestamp: Date.now(),
        command: command.type !== "unknown" ? command : undefined,
        result,
        // Show pending inference banner if route is Hybrid or Escalate
        pendingInference: showPendingBanner,
        pendingMessage: showPendingBanner ? (routingResponse?.message ?? "Full inference pending") : null,
      };

      setMessages((prev) => [
        ...prev.slice(-(MAX_CHAT_MESSAGES - 1)),
        assistantMessage,
      ]);
    },
    [
      config,
      onConfigChange,
      onNavigate,
      defaultTarget,
      settings,
      updateSetting,
      saveSettings,
    ],
  );

  const applySuggestion = useCallback((suggestion: string) => {
    setInputValue(suggestion);
    setSuggestions([]);
  }, []);

  const clearHistory = useCallback(() => {
    setMessages([
      {
        id: "welcome",
        role: "system",
        content: "Chat cleared. Ready for new commands.",
        timestamp: Date.now(),
      },
    ]);
  }, []);

  return {
    messages,
    suggestions,
    inputValue,
    setInputValue,
    sendMessage,
    applySuggestion,
    clearHistory,
  };
}

function formatResult(result: CommandResult): string {
  if (!result.success) {
    return `❌ ${result.message}`;
  }

  let output = `✅ ${result.message}`;

  if (result.queryResult) {
    output += `\n\n${result.queryResult.summary}`;
  }

  if (result.changes && result.changes.length > 0) {
    const preview = result.changes.slice(0, 5);
    output += "\n\nChanges:";
    for (const change of preview) {
      output += `\n• ${change.logic} G${change.group}: ${change.field} ${change.oldValue} → ${change.newValue}`;
    }
    if (result.changes.length > 5) {
      output += `\n• ... and ${result.changes.length - 5} more`;
    }
  }

  return output;
}
