// React hook for collaboration system integration

import { useState, useEffect } from 'react';
import { MTConfig } from '@/types/mt-config';
import { getCollaborationManager, CollaborationManager } from '@/lib/collaboration/manager';
import {
  CollaborationState,
  UserProfile,
  SharedParameterLibrary,
  CollaborationSession,
  ChangeNotification,
  ApprovalWorkflow
} from './types';

export function useCollaboration(initialConfig?: MTConfig) {
  const [colManager] = useState<CollaborationManager>(() => getCollaborationManager());
  const [state, setState] = useState<CollaborationState>(colManager.getState());

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = colManager.subscribe(setState);
    return unsubscribe;
  }, [colManager]);

  const connect = (userId: string) => {
    colManager.connect(userId);
  };

  const disconnect = () => {
    colManager.disconnect();
  };

  const addUser = (user: Omit<UserProfile, 'joinDate' | 'id'>) => {
    return colManager.addUser(user);
  };

  const createLibrary = (
    name: string,
    description: string,
    ownerId: string,
    parameters: Record<string, any>,
    isPublic: boolean = false,
    tags: string[] = []
  ) => {
    return colManager.createLibrary(name, description, ownerId, parameters, isPublic, tags);
  };

  const addLibraryCollaborator = (libraryId: string, userId: string, permission: 'read' | 'write' | 'admin') => {
    return colManager.addLibraryCollaborator(libraryId, userId, permission);
  };

  const createSession = (
    name: string,
    description: string,
    creatorId: string,
    sharedConfig: any,
    isPublic: boolean = false
  ) => {
    return colManager.createSession(name, description, creatorId, sharedConfig, isPublic);
  };

  const joinSession = (sessionId: string, userId: string) => {
    return colManager.joinSession(sessionId, userId);
  };

  const leaveSession = (sessionId: string, userId: string) => {
    return colManager.leaveSession(sessionId, userId);
  };

  const sendNotification = (notification: Omit<ChangeNotification, 'id' | 'timestamp' | 'readBy'>) => {
    return colManager.sendNotification(notification);
  };

  const markNotificationAsRead = (notificationId: string, userId: string) => {
    return colManager.markNotificationAsRead(notificationId, userId);
  };

  const createWorkflow = (
    name: string,
    description: string,
    triggerCondition: string,
    requiredApprovals: number,
    approvers: string[]
  ) => {
    return colManager.createWorkflow(name, description, triggerCondition, requiredApprovals, approvers);
  };

  const approveNotification = (notificationId: string, userId: string) => {
    return colManager.approveNotification(notificationId, userId);
  };

  const rejectNotification = (notificationId: string, userId: string) => {
    return colManager.rejectNotification(notificationId, userId);
  };

  const getUserLibraries = (userId: string) => {
    return colManager.getUserLibraries(userId);
  };

  const getUserSessions = (userId: string) => {
    return colManager.getUserSessions(userId);
  };

  const getUnreadNotifications = (userId: string) => {
    return colManager.getUnreadNotifications(userId);
  };

  const updateUserActivity = (userId: string) => {
    colManager.updateUserActivity(userId);
  };

  return {
    // State
    state,

    // Connection
    connect,
    disconnect,

    // User operations
    addUser,

    // Library operations
    createLibrary,
    addLibraryCollaborator,
    getUserLibraries,

    // Session operations
    createSession,
    joinSession,
    leaveSession,
    getUserSessions,

    // Notification operations
    sendNotification,
    markNotificationAsRead,
    getUnreadNotifications,

    // Workflow operations
    createWorkflow,
    approveNotification,
    rejectNotification,

    // Utilities
    updateUserActivity,
  };
}
