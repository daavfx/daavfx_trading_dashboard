// Collaborative Features System for Trading Parameters
// Enables team collaboration, shared libraries, and approval workflows

import { v4 as uuidv4 } from 'uuid';
import { MTConfig } from '@/types/mt-config';
import {
  CollaborationState,
  UserProfile,
  SharedParameterLibrary,
  CollaborationSession,
  ChangeNotification,
  ApprovalWorkflow,
  CollaborationConfig
} from './types';

export class CollaborationManager {
  private state: CollaborationState;
  private onChangeCallbacks: Array<(state: CollaborationState) => void> = [];
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(config?: CollaborationConfig) {
    this.state = {
      users: [],
      libraries: [],
      sessions: [],
      notifications: [],
      workflows: [],
      config: {
        enableRealtimeSync: config?.enableRealtimeSync ?? true,
        maxCollaborators: config?.maxCollaborators || 10,
        notificationTimeout: config?.notificationTimeout || 300000, // 5 minutes
        enableWorkflows: config?.enableWorkflows ?? true,
        defaultPermissions: config?.defaultPermissions || 'read',
      },
      isConnected: false,
      syncStatus: 'idle',
    };
  }

  // Subscribe to state changes
  subscribe(callback: (state: CollaborationState) => void): () => void {
    this.onChangeCallbacks.push(callback);
    return () => {
      const index = this.onChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.onChangeCallbacks.splice(index, 1);
      }
    };
  }

  private notifyChange(): void {
    this.onChangeCallbacks.forEach(callback => callback(this.getState()));
  }

  getState(): CollaborationState {
    return { ...this.state };
  }

  getConfig(): CollaborationConfig {
    return { ...this.state.config };
  }

  updateConfig(config: Partial<CollaborationConfig>): void {
    this.state.config = { ...this.state.config, ...config };
    this.notifyChange();
  }

  // Connect to collaboration service
  connect(userId: string): void {
    this.state.currentUser = userId;
    this.state.isConnected = true;

    // Start sync interval if enabled
    if (this.state.config.enableRealtimeSync && !this.syncInterval) {
      this.syncInterval = setInterval(() => {
        this.syncWithServer();
      }, 5000); // Sync every 5 seconds
    }

    this.notifyChange();
  }

  // Disconnect from collaboration service
  disconnect(): void {
    this.state.isConnected = false;
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.notifyChange();
  }

  // Add a user to the system
  addUser(user: Omit<UserProfile, 'joinDate' | 'id'>): UserProfile {
    const existingUser = this.state.users.find(u => u.email === user.email);
    if (existingUser) {
      throw new Error(`User with email ${user.email} already exists`);
    }

    const newUser: UserProfile = {
      ...user,
      id: uuidv4(),
      joinDate: Date.now(),
      lastActive: Date.now(),
    };

    this.state.users.push(newUser);
    this.notifyChange();
    return newUser;
  }

  // Create a shared parameter library
  createLibrary(
    name: string,
    description: string,
    ownerId: string,
    parameters: Record<string, any>,
    isPublic: boolean = false,
    tags: string[] = []
  ): SharedParameterLibrary {
    const owner = this.state.users.find(u => u.id === ownerId);
    if (!owner) {
      throw new Error(`Owner with ID ${ownerId} does not exist`);
    }

    const newLibrary: SharedParameterLibrary = {
      id: uuidv4(),
      name,
      description,
      owner: ownerId,
      collaborators: [ownerId],
      parameters,
      tags,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPublic,
      permissions: {
        [ownerId]: 'admin'
      }
    };

    this.state.libraries.push(newLibrary);
    this.notifyChange();
    return newLibrary;
  }

  // Add collaborator to a library
  addLibraryCollaborator(libraryId: string, userId: string, permission: 'read' | 'write' | 'admin'): boolean {
    const library = this.state.libraries.find(l => l.id === libraryId);
    if (!library) return false;

    const user = this.state.users.find(u => u.id === userId);
    if (!user) return false;

    // Check if user is already a collaborator
    if (library.collaborators.includes(userId)) {
      library.permissions[userId] = permission;
    } else {
      library.collaborators.push(userId);
      library.permissions[userId] = permission;
    }

    library.updatedAt = Date.now();
    this.notifyChange();
    return true;
  }

  // Create a collaboration session
  createSession(
    name: string,
    description: string,
    creatorId: string,
    sharedConfig: any,
    isPublic: boolean = false
  ): CollaborationSession {
    const creator = this.state.users.find(u => u.id === creatorId);
    if (!creator) {
      throw new Error(`Creator with ID ${creatorId} does not exist`);
    }

    const newSession: CollaborationSession = {
      id: uuidv4(),
      name,
      description,
      participants: [creatorId],
      activeUsers: [creatorId], // Initially only the creator is active
      sharedConfig,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      status: 'active',
      permissions: {
        [creatorId]: 'admin'
      }
    };

    this.state.sessions.push(newSession);
    this.notifyChange();
    return newSession;
  }

  // Join a session
  joinSession(sessionId: string, userId: string): boolean {
    const session = this.state.sessions.find(s => s.id === sessionId);
    if (!session || session.status !== 'active') return false;

    const user = this.state.users.find(u => u.id === userId);
    if (!user) return false;

    // Add user to participants if not already there
    if (!session.participants.includes(userId)) {
      if (session.participants.length >= this.state.config.maxCollaborators!) {
        return false; // Max collaborators reached
      }
      session.participants.push(userId);
    }

    // Add user to active users if not already there
    if (!session.activeUsers.includes(userId)) {
      session.activeUsers.push(userId);
    }

    session.lastActivity = Date.now();
    this.notifyChange();
    return true;
  }

  // Leave a session
  leaveSession(sessionId: string, userId: string): boolean {
    const session = this.state.sessions.find(s => s.id === sessionId);
    if (!session) return false;

    // Remove user from active users
    session.activeUsers = session.activeUsers.filter(id => id !== userId);

    // Don't remove from participants - they remain as a participant but not active
    session.lastActivity = Date.now();
    this.notifyChange();
    return true;
  }

  // Send a change notification to a session
  sendNotification(notification: Omit<ChangeNotification, 'id' | 'timestamp' | 'readBy'>): ChangeNotification {
    const session = this.state.sessions.find(s => s.id === notification.sessionId);
    if (!session) {
      throw new Error(`Session with ID ${notification.sessionId} does not exist`);
    }

    const user = this.state.users.find(u => u.id === notification.userId);
    if (!user) {
      throw new Error(`User with ID ${notification.userId} does not exist`);
    }

    const newNotification: ChangeNotification = {
      ...notification,
      id: uuidv4(),
      timestamp: Date.now(),
      readBy: [notification.userId], // Sender marks as read initially
    };

    this.state.notifications.push(newNotification);

    // Limit notifications to prevent memory issues
    if (this.state.notifications.length > 1000) {
      this.state.notifications = this.state.notifications.slice(-1000);
    }

    this.notifyChange();
    return newNotification;
  }

  // Mark notification as read by a user
  markNotificationAsRead(notificationId: string, userId: string): boolean {
    const notification = this.state.notifications.find(n => n.id === notificationId);
    if (!notification) return false;

    if (!notification.readBy.includes(userId)) {
      notification.readBy.push(userId);
      this.notifyChange();
    }

    return true;
  }

  // Create an approval workflow
  createWorkflow(
    name: string,
    description: string,
    triggerCondition: string,
    requiredApprovals: number,
    approvers: string[]
  ): ApprovalWorkflow {
    // Validate that all approvers exist
    for (const approverId of approvers) {
      const user = this.state.users.find(u => u.id === approverId);
      if (!user) {
        throw new Error(`Approver with ID ${approverId} does not exist`);
      }
    }

    const newWorkflow: ApprovalWorkflow = {
      id: uuidv4(),
      name,
      description,
      triggerCondition,
      requiredApprovals,
      approvers,
      createdAt: Date.now(),
      isActive: true,
    };

    this.state.workflows.push(newWorkflow);
    this.notifyChange();
    return newWorkflow;
  }

  // Approve a notification
  approveNotification(notificationId: string, userId: string): boolean {
    const notification = this.state.notifications.find(n => n.id === notificationId);
    if (!notification) return false;

    if (!notification.approvedBy) {
      notification.approvedBy = [];
    }

    if (!notification.approvedBy.includes(userId)) {
      notification.approvedBy.push(userId);
      this.notifyChange();
    }

    return true;
  }

  // Reject a notification
  rejectNotification(notificationId: string, userId: string): boolean {
    const notification = this.state.notifications.find(n => n.id === notificationId);
    if (!notification) return false;

    if (!notification.rejectedBy) {
      notification.rejectedBy = [];
    }

    if (!notification.rejectedBy.includes(userId)) {
      notification.rejectedBy.push(userId);
      this.notifyChange();
    }

    return true;
  }

  // Get user's libraries
  getUserLibraries(userId: string): SharedParameterLibrary[] {
    return this.state.libraries.filter(lib =>
      lib.owner === userId || lib.collaborators.includes(userId)
    );
  }

  // Get user's sessions
  getUserSessions(userId: string): CollaborationSession[] {
    return this.state.sessions.filter(session =>
      session.participants.includes(userId)
    );
  }

  // Get unread notifications for a user
  getUnreadNotifications(userId: string): ChangeNotification[] {
    return this.state.notifications.filter(n =>
      n.sessionId &&
      this.getSessionParticipants(n.sessionId).includes(userId) &&
      !n.readBy.includes(userId)
    );
  }

  // Get session participants
  private getSessionParticipants(sessionId: string): string[] {
    const session = this.state.sessions.find(s => s.id === sessionId);
    return session ? session.participants : [];
  }

  // Sync with server (simulated)
  private syncWithServer(): void {
    if (!this.state.isConnected) return;

    this.state.syncStatus = 'syncing';
    this.notifyChange();

    // Simulate network delay
    setTimeout(() => {
      this.state.syncStatus = 'idle';
      this.notifyChange();
    }, 100);
  }

  // Update user activity
  updateUserActivity(userId: string): void {
    const user = this.state.users.find(u => u.id === userId);
    if (user) {
      user.lastActive = Date.now();
      this.notifyChange();
    }
  }

  // Reset the collaboration system
  reset(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    this.state = {
      users: [],
      libraries: [],
      sessions: [],
      notifications: [],
      workflows: [],
      config: this.state.config,
      isConnected: false,
      syncStatus: 'idle',
    };
    this.notifyChange();
  }
}

// Singleton instance
let collaborationManager: CollaborationManager | null = null;

export function getCollaborationManager(config?: CollaborationConfig): CollaborationManager {
  if (!collaborationManager) {
    collaborationManager = new CollaborationManager(config);
  }
  return collaborationManager;
}
