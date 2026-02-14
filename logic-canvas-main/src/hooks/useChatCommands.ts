// React Hook for Chat Command System
// HOTFIX: Force rebuild Dec 20 2024 11:57 AM

import { useState, useCallback, useEffect } from "react";

// MEMORY LEAK FIX: Limit message history to prevent unbounded memory growth
const MAX_CHAT_MESSAGES = 100;
import { parseCommand, getSuggestions, commandExecutor } from "@/lib/chat";
import type { ChatMessage, CommandResult } from "@/lib/chat/types";
import type { MTConfig } from "@/types/mt-config";
import { useSettings } from "@/contexts/SettingsContext";
import { withUseDirectPriceGrid } from "@/utils/unit-mode";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
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
  const { settings, updateSettingPersisted } = useSettings();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "system",
      content:
        'Welcome to Ryiuk! I can help you modify trading parameters.\n\nTry commands like:\n• "show grid for all groups"\n• "set grid to 600 for groups 1-8"\n• "create progression for grid fibonacci groups 1-8"',
      timestamp: Date.now(),
    },
  ]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");

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

        updateSettingPersisted("autoApproveTransactions", next);
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

          const configToExport = config
            ? withUseDirectPriceGrid(config, settings)
            : config;
          if (isJson) {
            await invoke("export_json_file", {
              config: configToExport,
              filePath: filePath,
            });
          } else {
            await invoke("export_set_file", {
              config: configToExport,
              filePath: filePath,
              platform: "MT4",
              includeOptimizationHints: false,
              tradeDirection: "BOTH",
              tags: null,
              comments: null,
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

          onConfigChange(newConfig);
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
      console.log(`[ChatCommand] Processing: "${trimmed}"`);
      const parsed = parseCommand(trimmed);
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
      const command =
        parsed.type !== "unknown" &&
        shouldApplyDefaultTarget &&
        targetIsEmpty &&
        defaultTarget
          ? {
              ...parsed,
              target: {
                ...parsed.target,
                engines: defaultTarget.engines?.length
                  ? defaultTarget.engines
                  : parsed.target.engines,
                groups: defaultTarget.groups?.length
                  ? defaultTarget.groups
                  : parsed.target.groups,
                logics: defaultTarget.logics?.length
                  ? defaultTarget.logics
                  : parsed.target.logics,
              },
            }
          : parsed;
      
      // DEBUG: Log parsed command details
      console.log("[ChatCommand Debug] Parsed:", {
        raw: command.raw,
        type: command.type,
        target: command.target,
        params: command.params,
      });
      
      let result: CommandResult;

      if (command.type !== "unknown") {
        result = commandExecutor.execute(command);

        // AUTO-NAVIGATION logic (Restored)
        if (
          result.success &&
          result.queryResult?.navigationTargets &&
          onNavigate
        ) {
          onNavigate(result.queryResult.navigationTargets);
        }

        if (
          result.success &&
          onNavigate &&
          (result.pendingPlan || result.changes)
        ) {
          const field =
            command.target.field ||
            result.pendingPlan?.preview?.[0]?.field ||
            result.changes?.[0]?.field;
          if (field) {
            onNavigate({
              engines: command.target.engines,
              groups: command.target.groups,
              logics: command.target.logics,
              fields: [field],
            });
          }
        }
      } else {
        // Fallback to Local AI for unknown commands
        try {
          setMessages((prev) => [
            ...prev.slice(-(MAX_CHAT_MESSAGES - 1)),
            {
              id: `thinking-${Date.now()}`,
              role: "assistant",
              content: "Thinking... (Local AI)",
              timestamp: Date.now(),
            },
          ]);

          const systemContext = `You are Ryiuk, the Daavfx Trading Assistant.
        Available Fields: grid (pips), initial_lot (0.01+), multiplier (1.1+), trail_value, sl_value, tp_value.

        If the user asks to change settings, output the EXACT command to do it.
        Command Format: "set <field> to <value> for <target>"
        Examples:
        - "set grid to 500 for all groups"
        - "set initial_lot to 0.05 for power"
        - "enable hedge_mode for groups 1-5"

        If the user asks a question, answer briefly.
        Do not hallucinate commands.`;

          console.log("[ChatCommand] Falling back to AI. Query:", trimmed);
          const currentConfigStr = config
            ? JSON.stringify(config, null, 2)
            : "{}";
          console.log(
            "[ChatCommand] AI Context (Config Length):",
            currentConfigStr.length,
          );

          const aiResponse = await invoke<string>("ask_ai", {
            userQuery: trimmed,
            currentConfig: currentConfigStr,
          });
          console.log(
            "[ChatCommand] AI Response received:",
            aiResponse.substring(0, 50) + "...",
          );

          // Remove thinking message
          setMessages((prev) =>
            prev.filter((m) => !m.id.startsWith("thinking-")),
          );

          result = {
            success: true,
            message: aiResponse,
          };
        } catch (e) {
          console.error("[ChatCommand] AI Error:", e);
          // Remove thinking message
          setMessages((prev) =>
            prev.filter((m) => !m.id.startsWith("thinking-")),
          );

          result = {
            success: false,
            message: `I didn't understand that, and the local AI is offline or busy.\nError: ${e}`,
          };
        }
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: result.success ? result.message : `❌ ${result.message}`,
        timestamp: Date.now(),
        command: command.type !== "unknown" ? command : undefined,
        result,
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
      updateSettingPersisted,
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
