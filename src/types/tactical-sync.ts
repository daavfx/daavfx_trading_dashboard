export interface SyncGlobalBuySell {
  allow_buy: boolean;
  allow_sell: boolean;
}

export interface SyncLogicState {
  group: number;
  logic: string;
  allow_buy: boolean;
  allow_sell: boolean;
  reverse_enabled: boolean;
  hedge_enabled: boolean;
  scale_reverse: number;
  scale_hedge: number;
}

export interface SyncAccount {
  balance: number;
  equity: number;
  currency: string;
}

export interface SyncState {
  version: string;
  timestamp: string;
  symbol: string;
  magic_number: number;
  global_buy_sell: SyncGlobalBuySell;
  logic_states: SyncLogicState[];
  account: SyncAccount;
}

export interface SyncPaths {
  state_path: string;
  commands_path: string;
  state_exists: boolean;
  state_last_modified_ms: number | null;
}

export interface SyncCommand {
  command: string;
  group?: number;
  logic?: string;
  allow_buy?: boolean;
  allow_sell?: boolean;
  param_name?: string;
  param_value?: string;
  command_id?: string;
}

