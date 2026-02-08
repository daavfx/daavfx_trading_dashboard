// Git-like version control system for trading parameters
// Implements snapshot, branch, and diff functionality

import { v4 as uuidv4 } from 'uuid';
import { MTConfig } from '@/types/mt-config';
import {
  VersionControlState,
  Snapshot,
  Branch,
  ChangeRecord,
  SnapshotMetadata,
  VersionControlConfig,
  DiffResult
} from './types';

const STORAGE_KEY = 'daavfx_version_control';

export class VersionControlManager {
  private state: VersionControlState;
  private onChangeCallbacks: Array<(state: VersionControlState) => void> = [];

  constructor(config?: VersionControlConfig) {
    // Try to load from localStorage first
    const saved = this.loadFromStorage();
    
    if (saved) {
      this.state = saved;
    } else {
      this.state = {
        snapshots: [],
        branches: [],
        currentBranch: 'main',
        activeSnapshotId: null,
        config: {
          maxSnapshots: config?.maxSnapshots || 50,
          autoCommitTimeout: config?.autoCommitTimeout || 300, // 5 minutes
          enabled: config?.enabled ?? true,
        },
        isRecording: false,
        lastAutoCommit: Date.now(),
      };

      // Initialize with a default branch
      this.createBranch('main');
    }
  }

  // Persist to localStorage
  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn('[VersionControl] Failed to save to storage:', e);
    }
  }

  // Load from localStorage
  private loadFromStorage(): VersionControlState | null {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('[VersionControl] Failed to load from storage:', e);
    }
    return null;
  }

  // Clear all snapshots and history
  clearAll(): void {
    this.state.snapshots = [];
    this.state.activeSnapshotId = null;
    // Keep branches but reset heads
    this.state.branches = this.state.branches.map(b => ({
      ...b,
      headSnapshotId: null
    }));
    this.saveToStorage();
    this.notifyChange();
  }

  // Subscribe to state changes
  subscribe(callback: (state: VersionControlState) => void): () => void {
    this.onChangeCallbacks.push(callback);
    return () => {
      const index = this.onChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.onChangeCallbacks.splice(index, 1);
      }
    };
  }

  private notifyChange(): void {
    this.saveToStorage();
    this.onChangeCallbacks.forEach(callback => callback(this.getState()));
  }

  getState(): VersionControlState {
    return { ...this.state };
  }

  getConfig(): VersionControlConfig {
    return { ...this.state.config };
  }

  updateConfig(config: Partial<VersionControlConfig>): void {
    this.state.config = { ...this.state.config, ...config };
    this.notifyChange();
  }

  // Create a new branch
  createBranch(branchName: string): Branch {
    const existingBranch = this.state.branches.find(b => b.name === branchName);
    if (existingBranch) {
      throw new Error(`Branch '${branchName}' already exists`);
    }

    const newBranch: Branch = {
      name: branchName,
      headSnapshotId: this.state.activeSnapshotId || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isActive: false,
    };

    this.state.branches.push(newBranch);
    this.notifyChange();
    return newBranch;
  }

  // Switch to a branch
  switchBranch(branchName: string): Branch | null {
    const branch = this.state.branches.find(b => b.name === branchName);
    if (!branch) {
      return null;
    }

    // Update all branches to inactive
    this.state.branches = this.state.branches.map(b => ({
      ...b,
      isActive: b.name === branchName
    }));

    this.state.currentBranch = branchName;
    this.notifyChange();
    return branch;
  }

  // Get current active branch
  getCurrentBranch(): Branch | undefined {
    return this.state.branches.find(b => b.isActive) ||
           this.state.branches.find(b => b.name === this.state.currentBranch);
  }

  // Create a snapshot of the current configuration
  createSnapshot(
    config: MTConfig,
    message: string,
    author: string = 'system',
    tags: string[] = []
  ): Snapshot {
    if (!this.state.config.enabled) {
      throw new Error('Version control is disabled');
    }

    // Calculate changes since last snapshot
    const changes: ChangeRecord[] = [];
    const lastSnapshot = this.getLastSnapshot();

    if (lastSnapshot) {
      changes.push(...this.calculateChanges(lastSnapshot.config, config));
    }

    const snapshotId = uuidv4();
    const metadata: SnapshotMetadata = {
      id: snapshotId,
      timestamp: Date.now(),
      author,
      message,
      tags,
      parentSnapshotId: lastSnapshot?.id,
      changeCount: changes.length,
      affectedEngines: [...new Set(changes.map(c => c.engineId))],
      affectedGroups: [...new Set(changes.map(c => c.groupId))],
      affectedLogics: [...new Set(changes.map(c => c.logicName))],
    };

    const snapshot: Snapshot = {
      id: snapshotId,
      config: JSON.parse(JSON.stringify(config)), // Deep clone
      metadata,
      changes,
      createdAt: Date.now(),
    };

    // Add to snapshots
    this.state.snapshots.push(snapshot);

    // Maintain max snapshot limit
    if (this.state.snapshots.length > this.state.config.maxSnapshots!) {
      this.state.snapshots = this.state.snapshots.slice(-this.state.config.maxSnapshots!);
    }

    // Update current branch head
    const currentBranch = this.getCurrentBranch();
    if (currentBranch) {
      currentBranch.headSnapshotId = snapshotId;
      currentBranch.updatedAt = Date.now();
    }

    this.state.activeSnapshotId = snapshotId;
    this.state.lastAutoCommit = Date.now();

    this.notifyChange();
    return snapshot;
  }

  // Get all snapshots
  getSnapshots(): Snapshot[] {
    return [...this.state.snapshots];
  }

  // Get last snapshot
  getLastSnapshot(): Snapshot | undefined {
    return this.state.snapshots[this.state.snapshots.length - 1];
  }

  // Get snapshot by ID
  getSnapshotById(id: string): Snapshot | undefined {
    return this.state.snapshots.find(s => s.id === id);
  }

  // Restore configuration from a snapshot
  restoreFromSnapshot(snapshotId: string): Snapshot | null {
    const snapshot = this.getSnapshotById(snapshotId);
    if (!snapshot) {
      return null;
    }

    this.state.activeSnapshotId = snapshotId;
    this.notifyChange();
    return snapshot;
  }

  // Compare two snapshots
  compareSnapshots(fromId: string, toId: string): DiffResult {
    const fromSnapshot = this.getSnapshotById(fromId);
    const toSnapshot = this.getSnapshotById(toId);

    if (!fromSnapshot || !toSnapshot) {
      throw new Error('One or both snapshots not found');
    }

    return this.calculateDiff(fromSnapshot.config, toSnapshot.config);
  }

  // Calculate changes between two configurations
  private calculateChanges(fromConfig: any, toConfig: any): ChangeRecord[] {
    const changes: ChangeRecord[] = [];

    // Compare engines
    if (fromConfig.engines && toConfig.engines) {
      for (let i = 0; i < Math.max(fromConfig.engines.length, toConfig.engines.length); i++) {
        const fromEngine = fromConfig.engines[i];
        const toEngine = toConfig.engines[i];

        if (fromEngine && toEngine) {
          // Compare groups
          if (fromEngine.groups && toEngine.groups) {
            for (let j = 0; j < Math.max(fromEngine.groups.length, toEngine.groups.length); j++) {
              const fromGroup = fromEngine.groups[j];
              const toGroup = toEngine.groups[j];

              if (fromGroup && toGroup) {
                // Compare logics
                if (fromGroup.logics && toGroup.logics) {
                  for (let k = 0; k < Math.max(fromGroup.logics.length, toGroup.logics.length); k++) {
                    const fromLogic = fromGroup.logics[k];
                    const toLogic = toGroup.logics[k];

                    if (fromLogic && toLogic) {
                      // Compare all fields in the logic
                      const allKeys = new Set([
                        ...Object.keys(fromLogic || {}),
                        ...Object.keys(toLogic || {})
                      ]);

                      for (const key of allKeys) {
                        const fromValue = fromLogic[key];
                        const toValue = toLogic[key];

                        if (JSON.stringify(fromValue) !== JSON.stringify(toValue)) {
                          changes.push({
                            field: key,
                            oldValue: fromValue,
                            newValue: toValue,
                            engineId: fromEngine.engine_id,
                            groupId: fromGroup.group_number,
                            logicName: fromLogic.logic_name,
                            timestamp: Date.now(),
                          });
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    // Compare general config
    if (fromConfig.general && toConfig.general) {
      const allGeneralKeys = new Set([
        ...Object.keys(fromConfig.general || {}),
        ...Object.keys(toConfig.general || {})
      ]);

      for (const key of allGeneralKeys) {
        const fromValue = fromConfig.general[key];
        const toValue = toConfig.general[key];

        if (JSON.stringify(fromValue) !== JSON.stringify(toValue)) {
          changes.push({
            field: key,
            oldValue: fromValue,
            newValue: toValue,
            engineId: 'GENERAL',
            groupId: 0,
            logicName: 'GENERAL',
            timestamp: Date.now(),
          });
        }
      }
    }

    return changes;
  }

  // Calculate diff between two configurations
  private calculateDiff(fromConfig: any, toConfig: any): DiffResult {
    const changes = this.calculateChanges(fromConfig, toConfig);

    return {
      added: changes.filter(c => c.oldValue === undefined),
      modified: changes.filter(c => c.oldValue !== undefined && c.newValue !== undefined),
      removed: changes.filter(c => c.newValue === undefined),
      unchanged: [], // This would require comparing all possible fields
    };
  }

  // Get history of snapshots for current branch
  getBranchHistory(branchName?: string): Snapshot[] {
    const branch = this.state.branches.find(b =>
      b.name === (branchName || this.state.currentBranch)
    );

    if (!branch) {
      return [];
    }

    // Get all snapshots in chronological order
    const orderedSnapshots = [...this.state.snapshots].sort((a, b) => a.createdAt - b.createdAt);

    // If branch has a head, only return snapshots up to that point
    if (branch.headSnapshotId) {
      const headIndex = orderedSnapshots.findIndex(s => s.id === branch.headSnapshotId);
      if (headIndex !== -1) {
        return orderedSnapshots.slice(0, headIndex + 1);
      }
    }

    return orderedSnapshots;
  }

  // Get branches
  getBranches(): Branch[] {
    return [...this.state.branches];
  }

  // Delete a snapshot
  deleteSnapshot(snapshotId: string): boolean {
    const initialLength = this.state.snapshots.length;
    this.state.snapshots = this.state.snapshots.filter(s => s.id !== snapshotId);

    if (this.state.snapshots.length === initialLength) {
      return false; // Not found
    }

    // Update branch heads if needed
    this.state.branches = this.state.branches.map(branch => {
      if (branch.headSnapshotId === snapshotId) {
        // Find the previous snapshot in the branch history
        const remainingSnapshots = this.getBranchHistory(branch.name);
        const newHead = remainingSnapshots[remainingSnapshots.length - 1];
        return {
          ...branch,
          headSnapshotId: newHead?.id || null,
        };
      }
      return branch;
    });

    if (this.state.activeSnapshotId === snapshotId) {
      this.state.activeSnapshotId = null;
    }

    this.notifyChange();
    return true;
  }

  // Check if auto-commit is needed
  checkAutoCommit(currentConfig: MTConfig): void {
    if (!this.state.isRecording) {
      return;
    }

    const timeSinceLastCommit = Date.now() - this.state.lastAutoCommit;
    if (timeSinceLastCommit > this.state.config.autoCommitTimeout! * 1000) {
      this.createSnapshot(
        currentConfig,
        `Auto-commit after ${Math.floor(timeSinceLastCommit / 1000)}s`,
        'system'
      );
    }
  }

  // Start recording changes
  startRecording(): void {
    this.state.isRecording = true;
    this.notifyChange();
  }

  // Stop recording changes
  stopRecording(): void {
    this.state.isRecording = false;
    this.notifyChange();
  }

  // Reset the entire version control system
  reset(): void {
    this.state.snapshots = [];
    this.state.branches = [];
    this.state.activeSnapshotId = null;
    this.state.currentBranch = 'main';
    this.state.isRecording = false;
    this.state.lastAutoCommit = Date.now();

    this.createBranch('main');
    this.notifyChange();
  }
}

// Singleton instance
let versionControlManager: VersionControlManager | null = null;

export function getVersionControlManager(config?: VersionControlConfig): VersionControlManager {
  if (!versionControlManager) {
    versionControlManager = new VersionControlManager(config);
  }
  return versionControlManager;
}
