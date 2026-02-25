// React hook for version control system integration

import { useState, useEffect, useCallback, useRef } from 'react';
import { MTConfig } from '@/types/mt-config';
import { getVersionControlManager, VersionControlManager } from '@/lib/version-control/manager';
import { VersionControlState, Snapshot, Branch } from '@/lib/version-control/types';

export function useVersionControl(initialConfig?: MTConfig) {
  const [vcManager] = useState<VersionControlManager>(() => getVersionControlManager());
  const [state, setState] = useState<VersionControlState>(vcManager.getState());
  const [isLoading, setIsLoading] = useState(false);
  const configRef = useRef<MTConfig | null>(initialConfig || null);

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = vcManager.subscribe(setState);
    return unsubscribe;
  }, [vcManager]);

  // Update config reference when it changes
  useEffect(() => {
    if (initialConfig) {
      configRef.current = initialConfig;
    }
  }, [initialConfig]);

  const createSnapshot = useCallback(async (
    config: MTConfig,
    message: string,
    author: string = 'user',
    tags: string[] = []
  ): Promise<Snapshot | null> => {
    if (!config) return null;

    setIsLoading(true);
    try {
      const snapshot = vcManager.createSnapshot(config, message, author, tags);
      return snapshot;
    } catch (error) {
      console.error('Failed to create snapshot:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [vcManager]);

  const restoreFromSnapshot = useCallback(async (snapshotId: string): Promise<MTConfig | null> => {
    setIsLoading(true);
    try {
      const snapshot = vcManager.restoreFromSnapshot(snapshotId);
      return snapshot?.config || null;
    } catch (error) {
      console.error('Failed to restore from snapshot:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [vcManager]);

  const createBranch = useCallback(async (branchName: string): Promise<Branch | null> => {
    setIsLoading(true);
    try {
      const branch = vcManager.createBranch(branchName);
      return branch;
    } catch (error) {
      console.error('Failed to create branch:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [vcManager]);

  const switchBranch = useCallback(async (branchName: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const result = vcManager.switchBranch(branchName);
      return !!result;
    } catch (error) {
      console.error('Failed to switch branch:', error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [vcManager]);

  const autoCommitIfNeeded = useCallback((config: MTConfig) => {
    vcManager.checkAutoCommit(config);
  }, [vcManager]);

  const startRecording = useCallback(() => {
    vcManager.startRecording();
  }, [vcManager]);

  const stopRecording = useCallback(() => {
    vcManager.stopRecording();
  }, [vcManager]);

  const getSnapshots = useCallback((): Snapshot[] => {
    return vcManager.getSnapshots();
  }, [vcManager]);

  const getBranches = useCallback((): Branch[] => {
    return vcManager.getBranches();
  }, [vcManager]);

  const getCurrentBranch = useCallback((): Branch | undefined => {
    return vcManager.getCurrentBranch();
  }, [vcManager]);

  const getBranchHistory = useCallback((branchName?: string): Snapshot[] => {
    return vcManager.getBranchHistory(branchName);
  }, [vcManager]);

  const compareSnapshots = useCallback((fromId: string, toId: string) => {
    return vcManager.compareSnapshots(fromId, toId);
  }, [vcManager]);

  const updateConfig = useCallback((config: MTConfig) => {
    configRef.current = config;
  }, []);

  return {
    // State
    state,
    isLoading,

    // Actions
    createSnapshot,
    restoreFromSnapshot,
    createBranch,
    switchBranch,
    autoCommitIfNeeded,
    startRecording,
    stopRecording,

    // Queries
    getSnapshots,
    getBranches,
    getCurrentBranch,
    getBranchHistory,
    compareSnapshots,

    // Utils
    updateConfig,
  };
}
