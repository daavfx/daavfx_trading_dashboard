// Collaboration Panel Component

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useCollaboration } from '@/hooks/useCollaboration';
import { MTConfig } from '@/types/mt-config';
import { Users, Library, MessageSquare, Workflow, UserPlus, Send, CheckCircle, XCircle, Bell } from 'lucide-react';

interface CollaborationPanelProps {
  config: MTConfig | null;
  userId: string;
}

export function CollaborationPanel({ config, userId }: CollaborationPanelProps) {
  const {
    state,
    connect,
    createLibrary,
    createSession,
    sendNotification,
    getUnreadNotifications,
    getUserLibraries,
    getUserSessions
  } = useCollaboration(config);

  const [activeTab, setActiveTab] = useState('libraries');
  const [newLibraryName, setNewLibraryName] = useState('');
  const [newLibraryDesc, setNewLibraryDesc] = useState('');
  const [newSessionName, setNewSessionName] = useState('');
  const [newSessionDesc, setNewSessionDesc] = useState('');
  const [notificationText, setNotificationText] = useState('');

  // Connect on initial load
  useState(() => {
    connect(userId);
  });

  const handleCreateLibrary = () => {
    if (!newLibraryName.trim()) return;

    createLibrary(
      newLibraryName.trim(),
      newLibraryDesc || 'A new shared parameter library',
      userId,
      config ? {...config} : {}
    );

    setNewLibraryName('');
    setNewLibraryDesc('');
  };

  const handleCreateSession = () => {
    if (!newSessionName.trim()) return;

    createSession(
      newSessionName.trim(),
      newSessionDesc || 'A new collaboration session',
      userId,
      config ? {...config} : {}
    );

    setNewSessionName('');
    setNewSessionDesc('');
  };

  const handleSendNotification = () => {
    if (!notificationText.trim()) return;

    // Find the first active session to send the notification to
    const activeSession = state.sessions.find(s => s.status === 'active');
    if (!activeSession) return;

    sendNotification({
      sessionId: activeSession.id,
      userId,
      action: 'comment_added',
      target: { engineId: 'GENERAL' },
      details: { message: notificationText }
    });

    setNotificationText('');
  };

  const unreadNotifications = getUnreadNotifications(userId);
  const userLibraries = getUserLibraries(userId);
  const userSessions = getUserSessions(userId);

  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <CardTitle>Collaboration Center</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {state.isConnected ? 'Connected' : 'Disconnected'}
            </Badge>
            <Badge variant="outline">
              {unreadNotifications.length} unread
            </Badge>
          </div>
        </div>
        <CardDescription>
          Share configurations, collaborate with team members, and manage workflows
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="libraries">Libraries</TabsTrigger>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="workflows">Workflows</TabsTrigger>
          </TabsList>

          <TabsContent value="libraries" className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="flex gap-2">
              <Input
                placeholder="Library name..."
                value={newLibraryName}
                onChange={(e) => setNewLibraryName(e.target.value)}
              />
              <Button onClick={handleCreateLibrary} disabled={!newLibraryName.trim()}>
                <Library className="h-4 w-4 mr-2" />
                Create
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {userLibraries.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center col-span-full py-4">
                    No shared libraries yet. Create your first library!
                  </p>
                ) : (
                  userLibraries.map((library) => (
                    <Card key={library.id}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium">{library.name}</h4>
                            <p className="text-sm text-muted-foreground mt-1">{library.description}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline">Owner</Badge>
                              {library.isPublic && <Badge variant="secondary">Public</Badge>}
                              <Badge variant="outline">{library.collaborators.length} collaborators</Badge>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">
                              {new Date(library.updatedAt).toLocaleDateString()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {library.tags.length > 0 && library.tags.slice(0, 2).join(', ')}
                              {library.tags.length > 2 && ` +${library.tags.length - 2} more`}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="sessions" className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="flex gap-2">
              <Input
                placeholder="Session name..."
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
              />
              <Button onClick={handleCreateSession} disabled={!newSessionName.trim()}>
                <Users className="h-4 w-4 mr-2" />
                Create
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-3">
                {userSessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No active sessions. Create a session to collaborate with others!
                  </p>
                ) : (
                  userSessions.map((session) => (
                    <Card key={session.id}>
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium">{session.name}</h4>
                            <p className="text-sm text-muted-foreground mt-1">{session.description}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline">{session.status}</Badge>
                              <Badge variant="outline">{session.activeUsers.length}/{session.participants.length} active</Badge>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">
                              Created {new Date(session.createdAt).toLocaleDateString()}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Last activity: {new Date(session.lastActivity).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 flex gap-2">
                          <Button size="sm" variant="outline">
                            <UserPlus className="h-3 w-3 mr-1" />
                            Invite
                          </Button>
                          <Button size="sm" variant="outline">
                            Join
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="notifications" className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="flex gap-2">
              <Input
                placeholder="Send a message to the team..."
                value={notificationText}
                onChange={(e) => setNotificationText(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSendNotification()}
              />
              <Button onClick={handleSendNotification} disabled={!notificationText.trim()}>
                <Send className="h-4 w-4 mr-2" />
                Send
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-3">
                {unreadNotifications.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No new notifications. All caught up!
                  </p>
                ) : (
                  unreadNotifications.map((notification) => {
                    const user = state.users.find(u => u.id === notification.userId);
                    return (
                      <Card key={notification.id} className="border-l-4 border-l-blue-500">
                        <CardContent className="p-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-medium">{user?.displayName || user?.username || 'Unknown User'}</h4>
                                <Badge variant="outline" className="text-xs">
                                  {notification.action.replace('_', ' ')}
                                </Badge>
                              </div>
                              <p className="text-sm mt-1">{notification.details.message || 'Made changes to parameters'}</p>
                              <div className="text-xs text-muted-foreground mt-1">
                                {new Date(notification.timestamp).toLocaleString()}
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline">
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline">
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="workflows" className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="p-4 border rounded-md bg-muted/30">
              <h4 className="font-medium mb-2">Approval Workflows</h4>
              <p className="text-sm text-muted-foreground">
                Set up automated approval processes for parameter changes that require team consensus.
              </p>

              <div className="mt-4 space-y-3">
                <div className="p-3 bg-background border rounded-md">
                  <h5 className="font-medium text-sm">Major Configuration Changes</h5>
                  <p className="text-xs text-muted-foreground mt-1">
                    Requires approval from 2 senior team members before applying changes to live systems
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline">Active</Badge>
                    <Badge variant="outline">2 required approvals</Badge>
                  </div>
                </div>

                <div className="p-3 bg-background border rounded-md">
                  <h5 className="font-medium text-sm">Emergency Overrides</h5>
                  <p className="text-xs text-muted-foreground mt-1">
                  Allows immediate changes during critical situations, but notifies all team members
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline">Active</Badge>
                    <Badge variant="outline">Admin only</Badge>
                  </div>
                </div>
              </div>

              <Button className="mt-4 w-full" variant="outline">
                <Workflow className="h-4 w-4 mr-2" />
                Create New Workflow
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
