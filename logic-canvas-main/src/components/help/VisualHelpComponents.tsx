// Lightweight visual components for DAAVFX Help System
// Fast, CSS-based, no external images

import { useState } from "react";
import { Input } from "@/components/ui/input";

export const SimpleGridDiagram = () => (
  <div className="flex items-center gap-2 p-3 bg-muted/30 rounded-lg">
    <div className="w-3 h-3 rounded-full bg-green-500" />
    <div className="w-8 h-0.5 bg-border" />
    <div className="w-3 h-3 rounded-full bg-yellow-500" />
    <div className="w-8 h-0.5 bg-border" />
    <div className="w-3 h-3 rounded-full bg-red-500" />
    <div className="w-8 h-0.5 bg-border" />
    <div className="w-3 h-3 rounded-full bg-red-600" />
    <span className="text-xs text-muted-foreground ml-2">Grid progression</span>
  </div>
);

export const RiskIndicator = ({ level }: { level: 'low' | 'medium' | 'high' }) => {
  const colors = {
    low: 'bg-green-500',
    medium: 'bg-yellow-500', 
    high: 'bg-red-500'
  };
  
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${colors[level]}`} />
      <span className="text-xs capitalize">{level} risk</span>
    </div>
  );
};

export const MiniCalculator = ({ type }: { type: 'lot' | 'pip' | 'risk' }) => {
  const [value, setValue] = useState('');
  
  const calculate = () => {
    // Simple calculation logic
    switch(type) {
      case 'lot':
        return `$${parseFloat(value || '0') * 10} per pip`;
      case 'pip':
        return `${parseFloat(value || '0') * 10} points`;
      case 'risk':
        return `${parseFloat(value || '0') * 2}% risk`;
      default:
        return '';
    }
  };
  
  return (
    <div className="p-3 bg-card border rounded-lg">
      <div className="flex gap-2">
        <Input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1"
          placeholder="Enter value"
        />
        <div className="text-sm text-muted-foreground py-1">
          {calculate()}
        </div>
      </div>
    </div>
  );
};

export const ConceptFlow = () => (
  <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-lg border">
    <div className="text-center">
      <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-medium">Signal</div>
    </div>
    <div className="w-0.5 h-8 bg-border" />
    <div className="text-center">
      <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center text-xs font-medium">Grid</div>
    </div>
    <div className="w-0.5 h-8 bg-border" />
    <div className="text-center">
      <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center text-xs font-medium">Trail</div>
    </div>
  </div>
);

export const ProgressIndicator = ({ current, total, label }: { current: number; total: number; label: string }) => (
  <div className="space-y-2">
    <div className="flex justify-between text-xs">
      <span>{label}</span>
      <span>{current}/{total}</span>
    </div>
    <div className="w-full bg-muted rounded-full h-2">
      <div 
        className="bg-primary h-2 rounded-full transition-all duration-300"
        style={{ width: `${(current / total) * 100}%` }}
      />
    </div>
  </div>
);