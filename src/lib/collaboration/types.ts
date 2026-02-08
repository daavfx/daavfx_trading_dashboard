// Types for Collaborative Features System

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: 'admin' | 'editor' | 'viewer' | 'contributor';
  joinDate: number;
  lastActive: number;
}

export interface SharedParameterLibrary {
  id: string;
  name: string;
  description: string;
  owner: string; // User ID
  collaborators: string[]; // User IDs
  parameters: Record<string, any>; // Parameter configurations
  tags: string[];
  createdAt: number;
  updatedAt: number;
  isPublic: boolean;
  permissions: Record<string, 'read' | 'write' | 'admin'>; // Per-user permissions
}

export interface CollaborationSession {
  id: string;
  name: string;
  description: string;
  participants: string[]; // User IDs
  activeUsers: string[]; // Currently online users
  sharedConfig: any; // Shared configuration
  createdAt: number;
  lastActivity: number;
  status: 'active' | 'archived' | 'closed';
  permissions: Record<string, 'read' | 'write' | 'admin'>;
}

export interface ChangeNotification {
  id: string;
  sessionId: string;
  userId: string; // Who made the change
  action: 'parameter_change' | 'config_update' | 'comment_added' | 'approval_requested';
  target: {
    engineId: string;
    groupId?: number;
    logicName?: string;
    parameter?: string;
  };
  details: any; // Specific details about the change
  timestamp: number;
  readBy: string[]; // User IDs who have read this notification
  requiresApproval?: boolean;
  approvedBy?: string[]; // User IDs who approved
  rejectedBy?: string[]; // User IDs who rejected
}

export interface ApprovalWorkflow {
  id: string;
  name: string;
  description: string;
  triggerCondition: string; // Condition that triggers the workflow
  requiredApprovals: number; // Number of approvals needed
  approvers: string[]; // User IDs who can approve
  createdAt: number;
  isActive: boolean;
}

export interface CollaborationConfig {
  enableRealtimeSync?: boolean;
  maxCollaborators?: number;
  notificationTimeout?: number; // Time to wait for approvals
  enableWorkflows?: boolean;
  defaultPermissions?: 'read' | 'write';
}

export interface CollaborationState {
  users: UserProfile[];
  libraries: SharedParameterLibrary[];
  sessions: CollaborationSession[];
  notifications: ChangeNotification[];
  workflows: ApprovalWorkflow[];
  currentUser?: string; // Current user ID
  config: CollaborationConfig;
  isConnected: boolean;
  syncStatus: 'idle' | 'syncing' | 'error';
}
