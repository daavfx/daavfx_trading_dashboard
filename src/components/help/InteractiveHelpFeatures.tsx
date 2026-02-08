// Interactive help features for DAAVFX Dashboard
// Lightweight, fast, user-friendly

import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, Info, Copy, Bookmark } from 'lucide-react';

// Quick Setup Wizard
export const QuickSetupWizard = () => {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  
  const steps = [
    {
      title: "Account Size",
      question: "What's your account balance?",
      field: "account_size",
      placeholder: "10000",
      tips: ["Be honest about risk tolerance", "Consider demo first"]
    },
    {
      title: "Trading Style", 
      question: "Choose your trading style",
      field: "style",
      placeholder: "conservative/moderate/aggressive",
      tips: ["Conservative = Lower risk, slower gains", "Aggressive = Higher risk, faster recovery"]
    },
    {
      title: "Main Pair",
      question: "Primary currency pair?",
      field: "pair",
      placeholder: "EURUSD/GBPUSD/AUDUSD",
      tips: ["Start with major pairs", "Lower spreads = better for grid"]
    }
  ];
  
  const generateRecommendations = () => {
    const account = parseFloat(answers.account_size || '10000');
    const style = answers.style || 'moderate';
    
    const recommendations = {
      initial_lot: account >= 10000 ? '0.02' : '0.01',
      multiplier: style === 'conservative' ? '1.2' : style === 'aggressive' ? '1.8' : '1.5',
      grid: style === 'conservative' ? '500' : '300'
    };
    
    return recommendations;
  };
  
  if (step === steps.length) {
    const recs = generateRecommendations();
    return (
      <Card className="bg-gradient-to-br from-green-500/10 to-transparent border-green-500/20">
        <CardContent className="p-6">
          <h3 className="font-bold text-green-400 mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            Recommended Settings
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-background/50 rounded">
              <span>Initial Lot</span>
              <Badge variant="outline">{recs.initial_lot}</Badge>
            </div>
            <div className="flex justify-between items-center p-3 bg-background/50 rounded">
              <span>Multiplier</span>
              <Badge variant="outline">{recs.multiplier}</Badge>
            </div>
            <div className="flex justify-between items-center p-3 bg-background/50 rounded">
              <span>Grid Spacing</span>
              <Badge variant="outline">{recs.grid} points</Badge>
            </div>
          </div>
          <Button className="w-full mt-4" onClick={() => setStep(0)}>
            Start Over
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold">Step {step + 1}/{steps.length}</h3>
          <Badge variant="outline">{steps[step].title}</Badge>
        </div>
        
        <p className="text-muted-foreground mb-4">{steps[step].question}</p>
        
        <Input
          placeholder={steps[step].placeholder}
          value={answers[steps[step].field] || ''}
          onChange={(e) => setAnswers({...answers, [steps[step].field]: e.target.value})}
          className="mb-4"
        />
        
        <div className="space-y-1 mb-4">
          {steps[step].tips.map((tip, i) => (
            <div key={i} className="text-xs text-muted-foreground flex items-start gap-2">
              <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
              {tip}
            </div>
          ))}
        </div>
        
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          )}
          <Button 
            className="flex-1" 
            onClick={() => setStep(step + 1)}
            disabled={!answers[steps[step].field]}
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Parameter Validator
export const ParameterValidator = ({ config }: { config: any }) => {
  const [issues, setIssues] = useState<Array<{
    type: 'warning' | 'error' | 'info';
    message: string;
    field?: string;
  }>>([]);
  
  const validateConfig = useCallback(() => {
    const newIssues = [];
    
    // Check for common risky combinations
    if (config.multiplier > 2.0) {
      newIssues.push({
        type: 'error',
        message: 'Multiplier above 2.0 is extremely risky',
        field: 'multiplier'
      });
    }
    
    if (config.initial_lot > 0.1 && (config.account_size || 10000) < 50000) {
      newIssues.push({
        type: 'warning',
        message: 'Large lot size for account balance',
        field: 'initial_lot'
      });
    }
    
    if (config.grid < 200 && config.multiplier > 1.5) {
      newIssues.push({
        type: 'error',
        message: 'Tight grid + high multiplier = very high risk',
        field: 'grid'
      });
    }
    
    setIssues(newIssues);
  }, [config]);
  
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4" />
          <h4 className="font-semibold">Configuration Check</h4>
        </div>
        
        {issues.length === 0 ? (
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle className="w-4 h-4" />
            <span className="text-sm">No issues found</span>
          </div>
        ) : (
          <div className="space-y-2">
            {issues.map((issue, i) => (
              <div key={i} className={`flex items-start gap-2 p-2 rounded ${
                issue.type === 'error' ? 'bg-red-500/10 border border-red-500/20' :
                issue.type === 'warning' ? 'bg-yellow-500/10 border border-yellow-500/20' :
                'bg-blue-500/10 border border-blue-500/20'
              }`}>
                {issue.type === 'error' && <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5" />}
                {issue.type === 'warning' && <Info className="w-3 h-3 text-yellow-400 mt-0.5" />}
                <span className="text-xs">{issue.message}</span>
              </div>
            ))}
          </div>
        )}
        
        <Button size="sm" className="mt-3" onClick={validateConfig}>
          Revalidate
        </Button>
      </CardContent>
    </Card>
  );
};

// Quick Export
export const QuickExport = ({ content, title }: { content: string; title: string }) => {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(content);
  };
  
  const exportAsText = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Copy className="w-4 h-4" />
          <h4 className="font-semibold">Quick Export</h4>
        </div>
        
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={copyToClipboard}>
            Copy to Clipboard
          </Button>
          <Button size="sm" variant="outline" onClick={exportAsText}>
            Download as .txt
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Favorites Manager
export const FavoritesManager = () => {
  const [favorites, setFavorites] = useState<string[]>([]);
  
  const toggleFavorite = (entryId: string) => {
    setFavorites(prev => 
      prev.includes(entryId) 
        ? prev.filter(id => id !== entryId)
        : [...prev, entryId]
    );
  };
  
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bookmark className="w-4 h-4" />
          <h4 className="font-semibold">Favorite Topics</h4>
          <Badge variant="outline">{favorites.length}</Badge>
        </div>
        
        {favorites.length === 0 ? (
          <p className="text-xs text-muted-foreground">No favorites yet</p>
        ) : (
          <div className="space-y-1">
            {favorites.map(id => (
              <div key={id} className="text-xs p-2 bg-muted/30 rounded">
                {id}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};