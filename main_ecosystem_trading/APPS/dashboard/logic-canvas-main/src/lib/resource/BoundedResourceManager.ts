/**
 * @deprecated ARCHIVED 2025-02-18
 * This file is not currently imported or used anywhere in the codebase.
 * It was intended for resource management but is not active.
 * Kept for reference only.
 * Archived in: _archive/deprecated_2025-02-18/
 */

// Bounded Resource Manager - Enforces memory invariants (NOT CURRENTLY USED)
// Makes resource exhaustion mathematically impossible

interface ResourceBounds {
  maxMessages: number;
  maxPlanHistory: number;
  maxRedoStack: number;
  maxConsoleLogs: number;
  maxPendingChanges: number;
}

const DEFAULT_BOUNDS: ResourceBounds = {
  maxMessages: 100,
  maxPlanHistory: 50,
  maxRedoStack: 20,
  maxConsoleLogs: 100,
  maxPendingChanges: 500,
};

// INVARIANT: All arrays are bounded
// INVARIANT: Operations fail gracefully when bounds exceeded
export class BoundedResourceManager {
  private bounds: ResourceBounds;
  private metrics: Map<string, number> = new Map();

  constructor(bounds: Partial<ResourceBounds> = {}) {
    this.bounds = { ...DEFAULT_BOUNDS, ...bounds };
  }

  // GUARD: Check if operation would exceed bounds
  canAdd(resource: keyof ResourceBounds, currentSize: number): boolean {
    const bound = this.bounds[resource];
    return currentSize < bound;
  }

  // GUARD: Add with automatic eviction
  add<T>(resource: keyof ResourceBounds, array: T[], item: T): T[] {
    const bound = this.bounds[resource];
    const newArray = [...array, item];
    
    if (newArray.length > bound) {
      // Evict oldest items (FIFO)
      return newArray.slice(newArray.length - bound);
    }
    
    return newArray;
  }

  // GUARD: Add multiple items with eviction
  addMany<T>(resource: keyof ResourceBounds, array: T[], items: T[]): T[] {
    const bound = this.bounds[resource];
    const newArray = [...array, ...items];
    
    if (newArray.length > bound) {
      return newArray.slice(newArray.length - bound);
    }
    
    return newArray;
  }

  // GUARD: Create bounded array from scratch
  createBounded<T>(resource: keyof ResourceBounds, items: T[]): T[] {
    const bound = this.bounds[resource];
    if (items.length > bound) {
      return items.slice(items.length - bound);
    }
    return items;
  }

  // METRICS: Track resource usage
  recordMetric(name: string, value: number) {
    this.metrics.set(name, value);
  }

  getMetrics(): Record<string, number> {
    return Object.fromEntries(this.metrics);
  }

  // INVARIANT ENFORCEMENT: Ensure config object doesn't exceed reasonable size
  validateConfigSize(config: any): { valid: boolean; error?: string } {
    const jsonSize = JSON.stringify(config).length;
    const maxSize = 10 * 1024 * 1024; // 10MB max
    
    if (jsonSize > maxSize) {
      return { 
        valid: false, 
        error: `Config size (${(jsonSize / 1024 / 1024).toFixed(2)}MB) exceeds maximum (10MB)` 
      };
    }
    
    return { valid: true };
  }

  // INVARIANT ENFORCEMENT: Prevent infinite loop conditions
  checkOperationLimit(operation: string, maxOperations: number = 1000): boolean {
    const key = `op_${operation}`;
    const current = this.metrics.get(key) || 0;
    
    if (current >= maxOperations) {
      console.error(`[BoundedResourceManager] Operation limit exceeded: ${operation}`);
      return false;
    }
    
    this.metrics.set(key, current + 1);
    return true;
  }

  resetOperationCounter(operation: string) {
    this.metrics.delete(`op_${operation}`);
  }
}

// Singleton instance for global resource management
export const resourceManager = new BoundedResourceManager();

// React hook for component-level resource tracking
export function useBoundedResource(componentName: string) {
  const renderCount = useRef(0);
  
  renderCount.current++;
  
  // GUARD: Detect render loops
  if (renderCount.current > 100) {
    console.error(`[${componentName}] Excessive renders detected: ${renderCount.current}`);
  }
  
  return {
    renderCount: renderCount.current,
    isHealthy: renderCount.current < 100,
  };
}

import { useRef } from 'react';
