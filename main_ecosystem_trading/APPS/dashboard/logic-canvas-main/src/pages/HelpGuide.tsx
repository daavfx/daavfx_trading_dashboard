import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { 
  ArrowLeft, Search, BookOpen, Lightbulb, AlertCircle, Link2,
  Settings2, LayoutGrid, TrendingUp, Target, Cpu, BadgeDollarSign,
  ArrowLeftRight, Scissors, Shield, Zap, HelpCircle, Sparkles
} from "lucide-react";
import { HELP_CATEGORIES, HELP_ENTRIES, getHelpByCategory, searchHelp, HelpEntry, HelpCategory } from "@/data/help-docs";
import { QuickSetupWizard, ParameterValidator, QuickExport, FavoritesManager } from "@/components/help/InteractiveHelpFeatures";
import { SimpleGridDiagram, RiskIndicator, MiniCalculator, ConceptFlow, ProgressIndicator } from "@/components/help/VisualHelpComponents";
import { useOptimizedSearch, usePreloadContent, usePerformanceMonitor } from "@/hooks/useHelpOptimizations";

// Map icon names to actual Lucide components
const iconMap: Record<string, React.ElementType> = {
  Settings2, LayoutGrid, TrendingUp, Target, Cpu, BadgeDollarSign,
  ArrowLeftRight, Scissors, Shield, Zap, BookOpen, HelpCircle
};

const getCategoryIcon = (iconName: string) => {
  const Icon = iconMap[iconName] || HelpCircle;
  return <Icon className="w-5 h-5" />;
};

export default function HelpGuide() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<HelpEntry | null>(null);

// Optimized search with caching
  const searchResults = useOptimizedSearch(searchQuery);
  
  // Preload critical content
  const isPreloaded = usePreloadContent();

  // Category entries
  const categoryEntries = useMemo(() => {
    if (!selectedCategory) return [];
    return getHelpByCategory(selectedCategory);
  }, [selectedCategory]);

  // Render markdown-like content
  const renderContent = (text: string) => {
    return text.split('\n').map((line, i) => {
      // Headers
      if (line.startsWith('**') && line.endsWith('**')) {
        return <p key={i} className="font-bold text-foreground mt-3 mb-1">{line.replace(/\*\*/g, '')}</p>;
      }
      // Bold inline
      if (line.includes('**')) {
        const parts = line.split(/\*\*(.+?)\*\*/g);
        return (
          <p key={i} className="text-muted-foreground leading-relaxed">
            {parts.map((part, j) => j % 2 === 1 ? <strong key={j} className="text-foreground">{part}</strong> : part)}
          </p>
        );
      }
      // List items
      if (line.startsWith('- ')) {
        return <li key={i} className="text-muted-foreground ml-4">{line.substring(2)}</li>;
      }
      // Numbered items
      if (/^\d+\./.test(line)) {
        return <li key={i} className="text-muted-foreground ml-4 list-decimal">{line.substring(line.indexOf('.') + 2)}</li>;
      }
      // Empty lines
      if (!line.trim()) return <br key={i} />;
      // Regular text
      return <p key={i} className="text-muted-foreground leading-relaxed">{line}</p>;
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-bold flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                DAAVFX Help & Guide
              </h1>
            </div>
          </div>
          
          {/* Search */}
          <div className="mt-4 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search inputs, concepts, or trading terms..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedCategory(null);
                setSelectedEntry(null);
              }}
              className="pl-10 bg-card border-border"
            />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar - Categories */}
          <div className="col-span-3">
            <Card className="sticky top-32">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Categories</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[calc(100vh-280px)]">
                  <div className="p-2 space-y-1">
                    {HELP_CATEGORIES.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => {
                          setSelectedCategory(cat.id);
                          setSelectedEntry(null);
                          setSearchQuery("");
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-3 transition-all ${
                          selectedCategory === cat.id
                            ? "bg-primary/10 text-primary border border-primary/20 shadow-sm"
                            : "hover:bg-muted/60 text-muted-foreground hover:text-foreground border border-transparent"
                        }`}
                      >
                        <div className={`p-1.5 rounded-md ${
                          selectedCategory === cat.id 
                            ? "bg-primary/20 text-primary" 
                            : "bg-muted/50 text-muted-foreground"
                        }`}>
                          {getCategoryIcon(cat.icon)}
                        </div>
                        <span className="flex-1 font-medium">{cat.name}</span>
                        <Badge variant="secondary" className="text-[10px] tabular-nums">
                          {getHelpByCategory(cat.id).length}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="col-span-9">
            {/* Search Results */}
            {searchResults && (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  Search Results
                  <Badge variant="outline">{searchResults.length} found</Badge>
                </h2>
                {searchResults.length === 0 ? (
                  <Card className="p-8 text-center">
                    <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-muted-foreground">No results found for "{searchQuery}"</p>
                    <p className="text-sm text-muted-foreground/60 mt-1">Try different keywords or browse categories</p>
                  </Card>
                ) : (
                  <div className="grid gap-3">
                    {searchResults.map((entry) => (
                      <Card
                        key={entry.id}
                        className="cursor-pointer hover:border-primary/50 transition-colors"
                        onClick={() => {
                          setSelectedEntry(entry);
                          setSearchQuery("");
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h3 className="font-medium">{entry.title}</h3>
                              <p className="text-sm text-muted-foreground mt-1">{entry.shortDesc}</p>
                            </div>
                            <Badge variant="secondary">{HELP_CATEGORIES.find(c => c.id === entry.category)?.name}</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Category View */}
            {!searchResults && selectedCategory && !selectedEntry && (
              <div className="space-y-4">
                <div className="flex items-center gap-4 mb-6 p-4 rounded-xl bg-gradient-to-r from-primary/5 to-transparent border border-primary/10">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary">
                    {getCategoryIcon(HELP_CATEGORIES.find(c => c.id === selectedCategory)?.icon || "HelpCircle")}
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-bold text-foreground">{HELP_CATEGORIES.find(c => c.id === selectedCategory)?.name}</h2>
                    <p className="text-muted-foreground text-sm mt-0.5">{HELP_CATEGORIES.find(c => c.id === selectedCategory)?.description}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {categoryEntries.length} topics
                  </Badge>
                </div>
                
                <Accordion type="single" collapsible className="space-y-2">
                  {categoryEntries.map((entry) => (
                    <AccordionItem key={entry.id} value={entry.id} className="border rounded-lg px-4">
                      <AccordionTrigger className="hover:no-underline py-4">
                        <div className="flex items-center gap-3 text-left">
                          <div>
                            <div className="font-medium">{entry.title}</div>
                            <div className="text-sm text-muted-foreground">{entry.shortDesc}</div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-4">
                        <div className="space-y-4">
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            {renderContent(entry.fullDesc)}
                          </div>
                          
{entry.examples && entry.examples.length > 0 && (
                             <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
                               <h4 className="font-medium flex items-center gap-2 text-blue-400 mb-2">
                                 <Lightbulb className="w-4 h-4" />
                                 Examples
                               </h4>
                               <ul className="space-y-1">
                                 {entry.examples.map((ex, i) => (
                                   <li key={i} className="text-sm text-muted-foreground">• {ex}</li>
                                 ))}
                               </ul>
                             </div>
                           )}
                           
                           {/* Interactive visual for specific entries */}
                           {entry.id === 'grid' && (
                             <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-4">
                               <h4 className="font-medium flex items-center gap-2 text-purple-400 mb-2">
                                 <Target className="w-4 h-4" />
                                 Visual Example
                               </h4>
                               <SimpleGridDiagram />
                               <p className="text-xs text-muted-foreground mt-2">Watch how grid levels progress</p>
                             </div>
                           )}
                           
                           {entry.id === 'multiplier' && (
                             <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4">
                               <h4 className="font-medium flex items-center gap-2 text-green-400 mb-2">
                                 <TrendingUp className="w-4 h-4" />
                                 Progression Calculator
                               </h4>
                               <MiniCalculator type="lot" />
                               <p className="text-xs text-muted-foreground mt-2">See how lots multiply</p>
                             </div>
                           )}
                          
                          {entry.tips && entry.tips.length > 0 && (
                            <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4">
                              <h4 className="font-medium flex items-center gap-2 text-green-400 mb-2">
                                <AlertCircle className="w-4 h-4" />
                                Pro Tips
                              </h4>
                              <ul className="space-y-1">
                                {entry.tips.map((tip, i) => (
                                  <li key={i} className="text-sm text-muted-foreground">• {tip}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
                          {entry.relatedInputs && entry.relatedInputs.length > 0 && (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm text-muted-foreground flex items-center gap-1">
                                <Link2 className="w-3 h-3" /> Related:
                              </span>
                              {entry.relatedInputs.map((rel) => (
                                <Badge key={rel} variant="outline" className="cursor-pointer hover:bg-primary/10"
                                  onClick={() => {
                                    const relEntry = HELP_ENTRIES.find(e => e.id === rel);
                                    if (relEntry) setSelectedEntry(relEntry);
                                  }}>
                                  {rel}
                                </Badge>
                              ))}
                            </div>
                          )}
                          
                          {entry.mt4Variable && (
                            <div className="text-xs text-muted-foreground/60 font-mono bg-muted/30 rounded px-2 py-1 inline-block">
                              EA Variable: {entry.mt4Variable}
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            )}

            {/* Single Entry Detail View */}
            {selectedEntry && (
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-2 mb-2">
                    <Button variant="ghost" size="sm" onClick={() => {
                      setSelectedEntry(null);
                      if (!selectedCategory) {
                        setSelectedCategory(selectedEntry.category);
                      }
                    }}>
                      <ArrowLeft className="w-4 h-4 mr-1" /> Back
                    </Button>
                    <Badge variant="secondary" className="flex items-center gap-1.5">
                      <span className="w-4 h-4">
                        {getCategoryIcon(HELP_CATEGORIES.find(c => c.id === selectedEntry.category)?.icon || "HelpCircle")}
                      </span>
                      {HELP_CATEGORIES.find(c => c.id === selectedEntry.category)?.name}
                    </Badge>
                  </div>
                  <CardTitle className="text-2xl">{selectedEntry.title}</CardTitle>
                  <p className="text-muted-foreground">{selectedEntry.shortDesc}</p>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    {renderContent(selectedEntry.fullDesc)}
                  </div>
                  
                  {selectedEntry.examples && selectedEntry.examples.length > 0 && (
                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
                      <h4 className="font-medium flex items-center gap-2 text-blue-400 mb-3">
                        <Lightbulb className="w-4 h-4" />
                        Examples
                      </h4>
                      <ul className="space-y-2">
                        {selectedEntry.examples.map((ex, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-blue-400">•</span> {ex}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {selectedEntry.tips && selectedEntry.tips.length > 0 && (
                    <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4">
                      <h4 className="font-medium flex items-center gap-2 text-green-400 mb-3">
                        <AlertCircle className="w-4 h-4" />
                        Pro Tips
                      </h4>
                      <ul className="space-y-2">
                        {selectedEntry.tips.map((tip, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-green-400">•</span> {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {selectedEntry.relatedInputs && selectedEntry.relatedInputs.length > 0 && (
                    <div className="border-t pt-4">
                      <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                        <Link2 className="w-4 h-4" /> Related Inputs
                      </h4>
                      <div className="flex gap-2 flex-wrap">
                        {selectedEntry.relatedInputs.map((rel) => (
                          <Badge key={rel} variant="outline" className="cursor-pointer hover:bg-primary/10"
                            onClick={() => {
                              const relEntry = HELP_ENTRIES.find(e => e.id === rel);
                              if (relEntry) setSelectedEntry(relEntry);
                            }}>
                            {rel}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
{selectedEntry.mt4Variable && (
                     <div className="border-t pt-4">
                       <span className="text-xs text-muted-foreground">EA Variable Pattern:</span>
                       <code className="block mt-1 text-sm font-mono bg-muted/50 rounded px-3 py-2">
                         {selectedEntry.mt4Variable}
                       </code>
                     </div>
                   )}
                   
                   {/* Quick export for this entry */}
                   <div className="border-t pt-4">
                     <QuickExport 
                       content={`${selectedEntry.title}\n\n${selectedEntry.fullDesc}\n\nVariable: ${selectedEntry.mt4Variable || 'N/A'}`}
                       title={`help_${selectedEntry.id}`}
                     />
                   </div>
                </CardContent>
              </Card>
            )}

{/* Welcome View */}
            {!searchResults && !selectedCategory && !selectedEntry && (
              <div className="space-y-8">
                {/* Quick Setup Wizard */}
                <QuickSetupWizard />
                
                {/* Interactive Tools */}
                <div className="grid grid-cols-2 gap-4">
                  <ParameterValidator config={{}} />
                  <FavoritesManager />
                </div>
                
                {/* Visual Learning Aids */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-5 rounded-full bg-purple-500" />
                    <h3 className="text-lg font-bold">Visual Learning</h3>
                    <span className="text-xs text-muted-foreground">See how it works</span>
                  </div>
                  <div className="grid gap-4">
                    <Card className="p-4">
                      <h4 className="font-medium mb-3">Grid Progression</h4>
                      <SimpleGridDiagram />
                      <p className="text-xs text-muted-foreground mt-2">How positions add as price moves against you</p>
                    </Card>
                    
                    <Card className="p-4">
                      <h4 className="font-medium mb-3">Trading Flow</h4>
                      <ConceptFlow />
                      <p className="text-xs text-muted-foreground mt-2">Signal → Grid → Trail sequence</p>
                    </Card>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <Card className="p-3">
                        <h5 className="text-sm font-medium mb-2">Risk Levels</h5>
                        <div className="space-y-2">
                          <RiskIndicator level="low" />
                          <RiskIndicator level="medium" />
                          <RiskIndicator level="high" />
                        </div>
                      </Card>
                      
                      <Card className="p-3">
                        <h5 className="text-sm font-medium mb-2">Quick Calc</h5>
                        <MiniCalculator type="lot" />
                      </Card>
                      
                      <Card className="p-3">
                        <h5 className="text-sm font-medium mb-2">Progress</h5>
                        <ProgressIndicator current={3} total={7} label="Grid Levels" />
                      </Card>
                    </div>
                  </div>
                </div>
                {/* Hero Section */}
                <Card className="overflow-hidden bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20 relative">
                  <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-full blur-2xl" />
                  <CardContent className="p-8 relative">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-500 text-black shadow-lg">
                        <Sparkles className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold">DAAVFX Help & Guide</h2>
                        <p className="text-muted-foreground text-sm">Everything explained in plain language</p>
                      </div>
                    </div>
                    <p className="text-muted-foreground mb-6 max-w-2xl">
                      No jargon, no confusion. Each setting is explained like we're having a conversation. 
                      Search for anything or browse the categories below.
                    </p>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-4 bg-background/60 rounded-xl border border-white/5 backdrop-blur-sm">
                        <div className="text-3xl font-bold text-primary">{HELP_ENTRIES.length}</div>
                        <div className="text-xs text-muted-foreground mt-1">Topics Covered</div>
                      </div>
                      <div className="text-center p-4 bg-background/60 rounded-xl border border-white/5 backdrop-blur-sm">
                        <div className="text-3xl font-bold text-primary">{HELP_CATEGORIES.length}</div>
                        <div className="text-xs text-muted-foreground mt-1">Categories</div>
                      </div>
                      <div className="text-center p-4 bg-background/60 rounded-xl border border-white/5 backdrop-blur-sm">
                        <div className="text-3xl font-bold text-primary">21</div>
                        <div className="text-xs text-muted-foreground mt-1">Trading Logics</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Quick Start - Better Visual Hierarchy */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-5 rounded-full bg-primary" />
                    <h3 className="text-lg font-bold">Start Here</h3>
                    <span className="text-xs text-muted-foreground">Most important categories</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {HELP_CATEGORIES.slice(0, 6).map((cat) => (
                      <Card
                        key={cat.id}
                        className="cursor-pointer hover:border-primary/30 hover:shadow-lg hover:-translate-y-0.5 transition-all group"
                        onClick={() => setSelectedCategory(cat.id)}
                      >
                        <CardContent className="p-5 flex items-start gap-4">
                          <div className="p-2.5 rounded-xl bg-muted/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                            {getCategoryIcon(cat.icon)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors">{cat.name}</h4>
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{cat.description}</p>
                            <Badge variant="outline" className="mt-3 text-[10px]">
                              {getHelpByCategory(cat.id).length} topics
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Key Concepts - Better Cards */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1 h-5 rounded-full bg-amber-500" />
                    <h3 className="text-lg font-bold">Key Concepts</h3>
                    <span className="text-xs text-muted-foreground">Understand these first</span>
                  </div>
                  <div className="grid gap-3">
                    {["close_targets", "initial_lot", "multiplier", "grid", "trail_method"].map((id) => {
                      const entry = HELP_ENTRIES.find(e => e.id === id);
                      if (!entry) return null;
                      return (
                        <Card
                          key={id}
                          className="cursor-pointer hover:border-primary/30 hover:shadow-md transition-all group"
                          onClick={() => setSelectedEntry(entry)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors">{entry.title}</h4>
                                  <Badge variant="outline" className="text-[9px] px-1.5">
                                    {HELP_CATEGORIES.find(c => c.id === entry.category)?.name}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground mt-1.5">{entry.shortDesc}</p>
                              </div>
                              <ArrowLeft className="w-4 h-4 text-muted-foreground rotate-180 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
