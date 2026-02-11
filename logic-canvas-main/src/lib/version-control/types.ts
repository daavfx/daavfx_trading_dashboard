// Types for the Git-like version control system

export interface VersionControlConfig {
  // Maximum number of snapshots to keep in memory
  maxSnapshots?: number;
  // Auto-commit changes after this many seconds of inactivity
  autoCommitTimeout?: number;
  // Enable version control
  enabled?: boolean;
}

export interface SnapshotMetadata {
  id: string;
  timestamp: number;
  author: string;
  message: string;
  tags: string[];
  parentSnapshotId?: string;
  changeCount: number;
  affectedEngines: string[];
  affectedGroups: number[];
  affectedLogics: string[];
}

export interface ChangeRecord {
  field: string;
  oldValue: any;
  newValue: any;
  engineId: string;
  groupId: number;
  logicName: string;
  timestamp: number;
}

export interface Snapshot {
  id: string;
  config: any;
  metadata: SnapshotMetadata;
  changes: ChangeRecord[];
  createdAt: number;
}

export interface Branch {
  name: string;
  headSnapshotId: string;
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
}

export interface DiffResult {
  added: ChangeRecord[];
  modified: ChangeRecord[];
  removed: ChangeRecord[];
  unchanged: ChangeRecord[];
}

export interface VersionControlState {
  snapshots: Snapshot[];
  branches: Branch[];
  currentBranch: string;
  activeSnapshotId: string | null;
  config: VersionControlConfig;
  isRecording: boolean;
  lastAutoCommit: number;
}
