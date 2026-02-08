// Version Control Panel Component

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useVersionControl } from '@/hooks/useVersionControl';
import { MTConfig } from '@/types/mt-config';
import { Clock, GitBranch, GitCommit, GitCompare, RotateCcw, Plus, Play, Square, Tag } from 'lucide-react';

interface VersionControlPanelProps {
  config: MTConfig | null;
  onConfigChange: (config: MTConfig) => void;
}

export function VersionControlPanel({ config, onConfigChange }: VersionControlPanelProps) {
  const {
    state,
    createSnapshot,
    restoreFromSnapshot,
    createBranch,
    switchBranch,
    getSnapshots,
    getBranches,
    getCurrentBranch,
    getBranchHistory,
    compareSnapshots,
    startRecording,
    stopRecording,
    autoCommitIfNeeded
  } = useVersionControl(config);

  const [commitMessage, setCommitMessage] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null);
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  // Auto-commit if needed
  useEffect(() => {
    if (config) {
      autoCommitIfNeeded(config);
    }
  }, [config, autoCommitIfNeeded]);

  const handleCreateSnapshot = async () => {
    if (!config || !commitMessage.trim()) return;

    setIsCommitting(true);
    try {
      await createSnapshot(config, commitMessage.trim());
      setCommitMessage('');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleRestoreSnapshot = async (snapshotId: string) => {
    const success = await restoreFromSnapshot(snapshotId);
    if (success && config) {
      // Get the restored config from the version control manager
      const snapshot = getSnapshots().find(s => s.id === snapshotId);
      if (snapshot) {
        onConfigChange(snapshot.config);
      }
    }
  };

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return;

    const branch = await createBranch(newBranchName.trim());
    if (branch) {
      setNewBranchName('');
      setIsCreatingBranch(false);
    }
  };

  const handleSwitchBranch = async (branchName: string) => {
    await switchBranch(branchName);
  };

  const snapshots = getSnapshots();
  const branches = getBranches();
  const currentBranch = getCurrentBranch();
  const branchHistory = getBranchHistory();

  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            <CardTitle>Version Control</CardTitle>
          </div>
          <div className="flex gap-2">
            <Button
              variant={state.isRecording ? "destructive" : "outline"}
              size="sm"
              onClick={state.isRecording ? stopRecording : startRecording}
            >
              {state.isRecording ? <Square className="h-4 w-4 mr-1" /> : <Play className="h-4 w-4 mr-1" />}
              {state.isRecording ? 'Stop Recording' : 'Start Recording'}
            </Button>
          </div>
        </div>
        <CardDescription>
          Manage configuration snapshots and branches
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
        <Tabs defaultValue="snapshots" className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="snapshots">Snapshots</TabsTrigger>
            <TabsTrigger value="branches">Branches</TabsTrigger>
            <TabsTrigger value="compare">Compare</TabsTrigger>
          </TabsList>

          <TabsContent value="snapshots" className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="flex gap-2">
              <Input
                placeholder="Commit message..."
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleCreateSnapshot()}
              />
              <Button
                onClick={handleCreateSnapshot}
                disabled={!config || !commitMessage.trim() || isCommitting}
              >
                <GitCommit className="h-4 w-4 mr-2" />
                {isCommitting ? 'Committing...' : 'Commit'}
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-3">
                {snapshots.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No snapshots yet. Create your first commit!
                  </p>
                ) : (
                  branchHistory.map((snapshot) => (
                    <Card
                      key={snapshot.id}
                      className={`cursor-pointer transition-all ${
                        selectedSnapshot === snapshot.id ? 'ring-2 ring-primary' : ''
                      }`}
                      onClick={() => setSelectedSnapshot(snapshot.id)}
                    >
                      <CardContent className="pt-4">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {new Date(snapshot.metadata.timestamp).toLocaleString()}
                              </span>
                              {snapshot.id === state.activeSnapshotId && (
                                <Badge variant="secondary" className="ml-1">Current</Badge>
                              )}
                            </div>
                            <p className="font-medium truncate">{snapshot.metadata.message}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <Badge variant="outline" className="text-xs">
                                {snapshot.metadata.author}
                              </Badge>
                              {snapshot.metadata.tags.length > 0 && (
                                <div className="flex gap-1">
                                  {snapshot.metadata.tags.map(tag => (
                                    <Badge key={tag} variant="outline" className="text-xs">
                                      <Tag className="h-3 w-3 mr-1" />
                                      {tag}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-2">
                              {snapshot.metadata.changeCount} changes •
                              {snapshot.metadata.affectedEngines.length} engines •
                              {snapshot.metadata.affectedGroups.length} groups
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRestoreSnapshot(snapshot.id);
                            }}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="branches" className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="flex gap-2">
              {isCreatingBranch ? (
                <>
                  <Input
                    placeholder="New branch name..."
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleCreateBranch()}
                  />
                  <Button onClick={handleCreateBranch}>Create</Button>
                  <Button variant="outline" onClick={() => setIsCreatingBranch(false)}>Cancel</Button>
                </>
              ) : (
                <Button onClick={() => setIsCreatingBranch(true)} className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Branch
                </Button>
              )}
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-2">
                {branches.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No branches yet. Create your first branch!
                  </p>
                ) : (
                  branches.map((branch) => (
                    <div
                      key={branch.name}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        branch.isActive ? 'bg-accent border-primary' : 'hover:bg-accent/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-4 w-4" />
                        <span className={branch.isActive ? 'font-bold' : ''}>{branch.name}</span>
                        {branch.isActive && <Badge variant="secondary">Active</Badge>}
                      </div>
                      <div className="flex gap-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(branch.updatedAt).toLocaleDateString()}
                        </span>
                        {!branch.isActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSwitchBranch(branch.name)}
                          >
                            Switch
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="compare" className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>From Snapshot</Label>
                <select className="w-full mt-1 p-2 border rounded">
                  <option value="">Select snapshot...</option>
                  {snapshots.map(snapshot => (
                    <option key={snapshot.id} value={snapshot.id}>
                      {snapshot.metadata.message} ({new Date(snapshot.metadata.timestamp).toLocaleTimeString()})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>To Snapshot</Label>
                <select className="w-full mt-1 p-2 border rounded">
                  <option value="">Select snapshot...</option>
                  {snapshots.map(snapshot => (
                    <option key={snapshot.id} value={snapshot.id}>
                      {snapshot.metadata.message} ({new Date(snapshot.metadata.timestamp).toLocaleTimeString()})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Button disabled>
              <GitCompare className="h-4 w-4 mr-2" />
              Compare Snapshots
            </Button>

            <ScrollArea className="flex-1">
              <div className="text-sm text-muted-foreground p-4">
                Select two snapshots to compare their differences
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
