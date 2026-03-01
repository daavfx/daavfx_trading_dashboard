// Chat Command System Types

import type { SemanticCommand } from "./semanticEngine";

export type CommandType =
  | "query"       // "show grid for groups 1-5"
  | "set"         // "set grid to 600 for groups 1-8"
  | "progression" // "create progression from 600 to 3000 fibonacci"
  | "copy"        // "copy settings from group 1 to groups 2-5"
  | "compare"     // "compare grid between group 1 and group 5"
  | "reset"       // "reset group 3 to defaults"
  | "formula"     // "apply formula grid * 1.5 to groups 2-8"
  | "import"      // "import .set content"
  | "unknown";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskAssessment {
  level: RiskLevel;
  score: number; // 0-100
  reasons: string[];
}

export interface TransactionPlan {
  id: string;
  type: "set" | "progression" | "copy" | "formula" | "reset" | "import";
  description: string;
  preview: ChangePreview[];
  changes?: any[]; // Added to support legacy/flexible usage
  validation: ValidationResult;
  risk: RiskAssessment;
  createdAt: number;
  appliedAt?: number;
  status: "pending" | "approved" | "rejected" | "applied";
}

export interface ChangePreview {
  engine: string;
  group: number;
  logic: string;
  field: string;
  currentValue: any;
  newValue: any;
  delta?: number;
  deltaPercent?: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  mtCompatibility: {
    mt4: boolean;
    mt5: boolean;
    issues: string[];
  };
}

export interface ParsedCommand {
  type: CommandType;
  target: CommandTarget;
  params: Record<string, any>;
  raw: string;
  semantic?: SemanticCommand; // For semantic commands - rule-based NL operations
}

export interface CommandTarget {
  engines?: string[];      // ["A", "B", "C"]
  groups?: number[];       // [1, 2, 3, 4, 5]
  logics?: string[];       // ["POWER", "REPOWER"]
  field?: string;          // "grid", "initial_lot", "trail_value"
}

export interface CommandResult {
  success: boolean;
  message: string;
  changes?: FieldChange[];
  queryResult?: QueryResult;
  pendingPlan?: TransactionPlan;
  isGreeting?: boolean;  // Flag for conversational responses
  showPanel?: string;    // Panel to show: "help", "commands", "history"
}

// User feedback for online learning - captures corrections and approvals
export interface UserFeedback {
  id: string;
  messageId: string;
  originalInput: string;
  predictedIntent: string;
  correctIntent: string;
  timestamp: number;
  feedbackType: "correction" | "approval" | "rejection";
}

export interface FieldChange {
  engine: string;
  group: number;
  logic: string;
  field: string;
  oldValue: any;
  newValue: any;
}

export interface QueryResult {
  matches: QueryMatch[];
  summary: string;
  // Navigation metadata for hybrid mode
  navigationTargets?: {
    engines?: string[];
    groups?: number[];
    logics?: string[];
    fields?: string[];
  };
  isSnapshot?: boolean;
  fieldExplanation?: string;
}
export interface QueryMatch {
  engine: string;
  group: number;
  logic: string;
  field: string;
  value: any;
}

// Progression types
export type ProgressionType = "linear" | "fibonacci" | "exponential" | "custom";

export interface ProgressionParams {
  type: ProgressionType;
  startValue: number;
  endValue?: number;
  steps: number;
  factor?: number;        // For exponential/custom
  customFormula?: string; // For custom: "prev * 1.5 + 100"
}

// Chat message types
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  command?: ParsedCommand;
  result?: CommandResult;
  showPanel?: string; // Panel to display: "help", "history", etc.
  // TinyLLM routing
  pendingInference?: boolean;
  pendingMessage?: string | null;
}
