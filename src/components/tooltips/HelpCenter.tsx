// Comprehensive Help Center for DAAVFX Trading System
// Shows all the legendary features we've implemented

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GitBranch,
  FolderPlus,
  Brain,
  Activity,
  RotateCcw,
  Users,
  BarChart3,
  Zap,
  Layers,
  Target,
  Network,
  Thermometer
} from "lucide-react";

export function HelpCenter() {
  return (
    <div className="w-full h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">DAAVFX Trading System Help Center</h1>
        <p className="text-muted-foreground mt-2">
          Comprehensive guide to all legendary features and functionalities
        </p>
      </div>

      <Tabs defaultValue="overview" className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="version-control">Version Control</TabsTrigger>
          <TabsTrigger value="grouping">Grouping & Tagging</TabsTrigger>
          <TabsTrigger value="memory">Memory System</TabsTrigger>
          <TabsTrigger value="canvas">Canvas Enhancements</TabsTrigger>
          <TabsTrigger value="undo">Undo/Redo</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex-1 flex flex-col gap-4 overflow-y-auto py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <FeatureCard
              icon={<GitBranch className="h-8 w-8" />}
              title="Git-like Version Control"
              description="Complete snapshot management with branching and merging capabilities"
              features={[
                "Save and restore parameter snapshots",
                "Branch management for different strategies",
                "Diff views to compare changes",
                "Auto-commit functionality"
              ]}
            />

            <FeatureCard
              icon={<FolderPlus className="h-8 w-8" />}
              title="Smart Parameter Grouping"
              description="Organize parameters by engine, group, logic, or custom criteria"
              features={[
                "Automatic grouping rules",
                "Custom tagging system",
                "Parameter categorization",
                "Visual organization"
              ]}
            />

            <FeatureCard
              icon={<Brain className="h-8 w-8" />}
              title="Advanced Memory System"
              description="AI-powered learning from your trading patterns"
              features={[
                "User preference learning",
                "Strategy pattern recognition",
                "Change impact prediction",
                "Historical performance tracking"
              ]}
            />

            <FeatureCard
              icon={<Activity className="h-8 w-8" />}
              title="Visual Canvas Enhancements"
              description="Parameter heatmaps, strategy flow charts, and change propagation visualization"
              features={[
                "Parameter heatmaps for value visualization",
                "Strategy flow charts showing relationships",
                "Distribution analysis of parameter values",
                "Change propagation visualization"
              ]}
            />

            <FeatureCard
              icon={<RotateCcw className="h-8 w-8" />}
              title="Smart Undo/Redo System"
              description="Granular operation tracking with selective rollback"
              features={[
                "Granular operation tracking",
                "Selective undo/redo capabilities",
                "Operation grouping and batching",
                "Confirmation workflows"
              ]}
            />

            <FeatureCard
              icon={<Users className="h-8 w-8" />}
              title="Collaborative Features"
              description="Shared libraries, real-time collaboration, and approval workflows"
              features={[
                "Shared parameter libraries",
                "Real-time collaboration sessions",
                "Team approval workflows",
                "Notification system"
              ]}
            />
          </div>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Getting Started</CardTitle>
              <CardDescription>
                Essential steps to make the most of your trading system
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium mb-2">Configuration Management</h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Use the Version Control panel to save snapshots of working configurations</li>
                    <li>• Create parameter groups for different strategies (e.g., "Aggressive", "Conservative")</li>
                    <li>• Tag parameters with meaningful labels for easy identification</li>
                    <li>• Use the memory system to learn from successful parameter combinations</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-medium mb-2">Risk Management</h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Monitor the Analytics panel for risk indicators</li>
                    <li>• Set up approval workflows for major configuration changes</li>
                    <li>• Use the visual canvas to identify parameter correlations</li>
                    <li>• Leverage the undo/redo system for safe experimentation</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="version-control" className="flex-1 flex flex-col gap-4 overflow-y-auto py-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <GitBranch className="h-5 w-5" />
                  <CardTitle>Version Control System</CardTitle>
                </div>
                <CardDescription>
                  Git-like functionality for your trading configurations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <h3 className="font-medium mb-2">Key Features</h3>
                <ul className="text-sm text-muted-foreground space-y-1 mb-4">
                  <li>• Create snapshots of working configurations</li>
                  <li>• Branch management for different strategies</li>
                  <li>• Commit history with authorship and tagging</li>
                  <li>• Diff views to compare parameter changes</li>
                  <li>• Auto-commit functionality</li>
                </ul>

                <h3 className="font-medium mb-2">Best Practices</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Create a snapshot before major changes</li>
                  <li>• Use descriptive commit messages</li>
                  <li>• Tag important configurations (e.g., "Profitable_2023", "Risk_Managed")</li>
                  <li>• Branch for experimental strategies</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>How to Use</CardTitle>
                <CardDescription>
                  Step-by-step guide to version control features
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal pl-5">
                  <li><strong>Save Configuration:</strong> Click "Commit" in the Version Control panel</li>
                  <li><strong>Add Message:</strong> Describe what changed and why</li>
                  <li><strong>Tag Important:</strong> Add tags like "profitable", "stable", "experimental"</li>
                  <li><strong>Compare:</strong> Use the diff view to see what changed between versions</li>
                  <li><strong>Restore:</strong> Select a previous snapshot to revert to that state</li>
                </ol>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="grouping" className="flex-1 flex flex-col gap-4 overflow-y-auto py-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Layers className="h-5 w-5" />
                  <CardTitle>Parameter Grouping & Tagging</CardTitle>
                </div>
                <CardDescription>
                  Organize parameters logically for easier management
                </CardDescription>
              </CardHeader>
              <CardContent>
                <h3 className="font-medium mb-2">Grouping Options</h3>
                <ul className="text-sm text-muted-foreground space-y-1 mb-4">
                  <li>• <strong>By Engine:</strong> Group parameters by Engine A, B, or C</li>
                  <li>• <strong>By Function:</strong> Group by grid, trail, lot, TP/SL parameters</li>
                  <li>• <strong>By Strategy:</strong> Group by aggressive, conservative, scalping strategies</li>
                  <li>• <strong>Custom:</strong> Create your own parameter groups</li>
                </ul>

                <h3 className="font-medium mb-2">Tagging System</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• <strong>Strategy Type:</strong> "Aggressive", "Conservative", "Scalping"</li>
                  <li>• <strong>Risk Level:</strong> "High", "Medium", "Low"</li>
                  <li>• <strong>Performance:</strong> "Profitable", "Needs Adjustment"</li>
                  <li>• <strong>Time Frame:</strong> "Short Term", "Long Term"</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>How to Use</CardTitle>
                <CardDescription>
                  Step-by-step guide to grouping and tagging
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal pl-5">
                  <li><strong>Create Groups:</strong> Define logical groupings in the Grouping panel</li>
                  <li><strong>Apply Tags:</strong> Assign meaningful tags to parameter groups</li>
                  <li><strong>Set Rules:</strong> Create automatic grouping rules</li>
                  <li><strong>Filter:</strong> Use groups and tags to quickly find parameters</li>
                  <li><strong>Share:</strong> Export groups for team use</li>
                </ol>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="memory" className="flex-1 flex flex-col gap-4 overflow-y-auto py-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  <CardTitle>Advanced Memory System</CardTitle>
                </div>
                <CardDescription>
                  AI-powered learning from your trading patterns
                </CardDescription>
              </CardHeader>
              <CardContent>
                <h3 className="font-medium mb-2">Learning Capabilities</h3>
                <ul className="text-sm text-muted-foreground space-y-1 mb-4">
                  <li>• <strong>User Preferences:</strong> Remembers your commonly used parameter combinations</li>
                  <li>• <strong>Strategy Patterns:</strong> Identifies successful parameter combinations</li>
                  <li>• <strong>Impact Prediction:</strong> Shows potential effects of changes before applying</li>
                  <li>• <strong>Performance Tracking:</strong> Links parameter changes to performance outcomes</li>
                </ul>

                <h3 className="font-medium mb-2">Benefits</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Faster configuration setup based on learned preferences</li>
                  <li>• Reduced risk through impact prediction</li>
                  <li>• Improved performance through pattern recognition</li>
                  <li>• Personalized recommendations</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>How to Use</CardTitle>
                <CardDescription>
                  Leveraging the memory system effectively
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal pl-5">
                  <li><strong>Use Regularly:</strong> The system learns from your interactions</li>
                  <li><strong>Accept Recommendations:</strong> Try suggested parameter combinations</li>
                  <li><strong>Review Predictions:</strong> Check impact predictions before making changes</li>
                  <li><strong>Provide Feedback:</strong> The system improves with use</li>
                  <li><strong>Monitor Performance:</strong> Track how changes affect results</li>
                </ol>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="canvas" className="flex-1 flex flex-col gap-4 overflow-y-auto py-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  <CardTitle>Visual Canvas Enhancements</CardTitle>
                </div>
                <CardDescription>
                  Visual representations of your parameter configurations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <h3 className="font-medium mb-2">Visualization Types</h3>
                <ul className="text-sm text-muted-foreground space-y-1 mb-4">
                  <li>• <strong>Parameter Heatmaps:</strong> Visual representation of parameter values</li>
                  <li>• <strong>Strategy Flow Charts:</strong> Visual representation of logic interactions</li>
                  <li>• <strong>Change Propagation:</strong> See how changes affect related parameters</li>
                  <li>• <strong>Distribution Analysis:</strong> Understand parameter value distributions</li>
                </ul>

                <h3 className="font-medium mb-2">Insights Provided</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Parameter correlation analysis</li>
                  <li>• Risk concentration visualization</li>
                  <li>• Strategy interdependency mapping</li>
                  <li>• Performance impact visualization</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>How to Use</CardTitle>
                <CardDescription>
                  Making the most of visualizations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal pl-5">
                  <li><strong>Identify Patterns:</strong> Look for clusters in heatmaps</li>
                  <li><strong>Spot Risks:</strong> Find highly correlated parameters</li>
                  <li><strong>Understand Flow:</strong> Trace strategy interactions in flow charts</li>
                  <li><strong>Monitor Changes:</strong> Use propagation views before making adjustments</li>
                  <li><strong>Validate Configurations:</strong> Check visual consistency</li>
                </ol>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="undo" className="flex-1 flex flex-col gap-4 overflow-y-auto py-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <RotateCcw className="h-5 w-5" />
                  <CardTitle>Smart Undo/Redo System</CardTitle>
                </div>
                <CardDescription>
                  Granular control over configuration changes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <h3 className="font-medium mb-2">Capabilities</h3>
                <ul className="text-sm text-muted-foreground space-y-1 mb-4">
                  <li>• <strong>Selective Undo:</strong> Undo specific parameter changes</li>
                  <li>• <strong>Granular Tracking:</strong> Track individual parameter modifications</li>
                  <li>• <strong>Operation Grouping:</strong> Group related changes together</li>
                  <li>• <strong>Confirmation Workflows:</strong> Prevent unintended changes</li>
                </ul>

                <h3 className="font-medium mb-2">Use Cases</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Revert specific parameter changes without affecting others</li>
                  <li>• Experiment with configurations safely</li>
                  <li>• Correct mistakes quickly</li>
                  <li>• Compare different configuration states</li>
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>How to Use</CardTitle>
                <CardDescription>
                  Effective undo/redo operations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="text-sm text-muted-foreground space-y-2 list-decimal pl-5">
                  <li><strong>Review Changes:</strong> Examine the change history before undoing</li>
                  <li><strong>Selective Undo:</strong> Choose specific operations to revert</li>
                  <li><strong>Batch Operations:</strong> Group related changes for easier management</li>
                  <li><strong>Confirm Actions:</strong> Verify undo operations before applying</li>
                  <li><strong>Monitor Impact:</strong> Check the effect of undo operations</li>
                </ol>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Helper component for feature cards
function FeatureCard({
  icon,
  title,
  description,
  features
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  features: string[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription className="text-sm pt-1">
              {description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2">
              <div className="mt-1 w-1.5 h-1.5 rounded-full bg-primary/50 flex-shrink-0" />
              <span className="text-sm text-muted-foreground">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
