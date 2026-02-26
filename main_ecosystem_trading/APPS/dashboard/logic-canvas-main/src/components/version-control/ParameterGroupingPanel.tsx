// Parameter Grouping & Tagging Panel Component

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useParameterGrouping } from '@/hooks/useParameterGrouping';
import { MTConfig } from '@/types/mt-config';
import { Tag, FolderPlus, Settings, Plus, Trash2, Edit3, Hash, Layers, Filter } from 'lucide-react';

interface ParameterGroupingPanelProps {
  config: MTConfig | null;
}

export function ParameterGroupingPanel({ config }: ParameterGroupingPanelProps) {
  const {
    state,
    createTag,
    createGroup,
    createRule,
    getParameterTags,
    getParameterGroups
  } = useParameterGrouping(config);

  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3B82F6');
  const [newTagDescription, setNewTagDescription] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [newGroupType, setNewGroupType] = useState<'engine' | 'group' | 'logic' | 'function' | 'custom'>('custom');
  const [showTagDialog, setShowTagDialog] = useState(false);
  const [showGroupDialog, setShowGroupDialog] = useState(false);

  const handleCreateTag = () => {
    if (!newTagName.trim()) return;

    createTag(newTagName.trim(), newTagColor, newTagDescription || newTagName);
    setNewTagName('');
    setNewTagDescription('');
    setShowTagDialog(false);
  };

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;

    // For now, create with empty criteria
    createGroup(newGroupName.trim(), newGroupDescription, newGroupType, {});
    setNewGroupName('');
    setNewGroupDescription('');
    setShowGroupDialog(false);
  };

  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            <CardTitle>Parameter Grouping & Tagging</CardTitle>
          </div>
        </div>
        <CardDescription>
          Organize parameters by logic, function, or custom criteria
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-4 overflow-hidden">
        <Tabs defaultValue="tags" className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="tags">Tags</TabsTrigger>
            <TabsTrigger value="groups">Groups</TabsTrigger>
            <TabsTrigger value="rules">Rules</TabsTrigger>
          </TabsList>

          <TabsContent value="tags" className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="flex justify-end">
              <Dialog open={showTagDialog} onOpenChange={setShowTagDialog}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Tag className="h-4 w-4 mr-2" />
                    New Tag
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Tag</DialogTitle>
                    <DialogDescription>
                      Add a new tag to categorize your parameters
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="tagName">Tag Name</Label>
                      <Input
                        id="tagName"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        placeholder="e.g., Aggressive, Conservative, Scalping..."
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tagColor">Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id="tagColor"
                          type="color"
                          value={newTagColor}
                          onChange={(e) => setNewTagColor(e.target.value)}
                          className="w-12"
                        />
                        <Input
                          value={newTagColor}
                          onChange={(e) => setNewTagColor(e.target.value)}
                          placeholder="#3B82F6"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tagDescription">Description</Label>
                      <Input
                        id="tagDescription"
                        value={newTagDescription}
                        onChange={(e) => setNewTagDescription(e.target.value)}
                        placeholder="What does this tag represent?"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setShowTagDialog(false)}>Cancel</Button>
                    <Button onClick={handleCreateTag}>Create Tag</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <ScrollArea className="flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {state.tags.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center col-span-full py-4">
                    No tags created yet. Create your first tag!
                  </p>
                ) : (
                  state.tags.map((tag) => (
                    <Card key={tag.id} className="overflow-hidden">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: tag.color }}
                            />
                            <div>
                              <h4 className="font-medium">{tag.name}</h4>
                              <p className="text-xs text-muted-foreground">{tag.description}</p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm">
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Created {new Date(tag.createdAt).toLocaleDateString()} by {tag.createdBy}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="groups" className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="flex justify-end">
              <Dialog open={showGroupDialog} onOpenChange={setShowGroupDialog}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <FolderPlus className="h-4 w-4 mr-2" />
                    New Group
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create New Group</DialogTitle>
                    <DialogDescription>
                      Define a group of parameters based on criteria
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="groupName">Group Name</Label>
                        <Input
                          id="groupName"
                          value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)}
                          placeholder="e.g., Power Parameters, Trail Settings..."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="groupType">Group Type</Label>
                        <Select value={newGroupType} onValueChange={(v: any) => setNewGroupType(v)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="engine">Engine</SelectItem>
                            <SelectItem value="group">Group</SelectItem>
                            <SelectItem value="logic">Logic</SelectItem>
                            <SelectItem value="function">Function</SelectItem>
                            <SelectItem value="custom">Custom</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="groupDescription">Description</Label>
                      <Input
                        id="groupDescription"
                        value={newGroupDescription}
                        onChange={(e) => setNewGroupDescription(e.target.value)}
                        placeholder="What parameters does this group contain?"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Criteria</Label>
                      <div className="text-sm text-muted-foreground">
                        Define which parameters belong to this group (coming soon...)
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setShowGroupDialog(false)}>Cancel</Button>
                    <Button onClick={handleCreateGroup}>Create Group</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <ScrollArea className="flex-1">
              <div className="grid grid-cols-1 gap-3">
                {state.groups.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center col-span-full py-4">
                    No groups created yet. Create your first group!
                  </p>
                ) : (
                  state.groups.map((group) => (
                    <Card key={group.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{group.name}</h4>
                              <Badge variant="outline">{group.type}</Badge>
                              {!group.isActive && <Badge variant="secondary">Inactive</Badge>}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{group.description}</p>

                            {group.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-2">
                                {group.tags.map(tagId => {
                                  const tag = state.tags.find(t => t.id === tagId);
                                  return tag ? (
                                    <Badge key={tagId} style={{ backgroundColor: `${tag.color}20`, color: tag.color }}>
                                      <Hash className="h-3 w-3 mr-1" />
                                      {tag.name}
                                    </Badge>
                                  ) : null;
                                })}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm">
                              <Edit3 className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">
                          Created {new Date(group.createdAt).toLocaleDateString()} by {group.createdBy}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="rules" className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="flex justify-end">
              <Button size="sm">
                <Filter className="h-4 w-4 mr-2" />
                New Rule
              </Button>
            </div>

            <ScrollArea className="flex-1">
              <div className="text-sm text-muted-foreground p-4 text-center">
                Define automatic rules to tag and group parameters based on conditions (coming soon...)
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
