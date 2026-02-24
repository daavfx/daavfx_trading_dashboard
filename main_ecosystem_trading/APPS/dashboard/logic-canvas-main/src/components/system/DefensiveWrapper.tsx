// Defensive Component Wrapper - Prevents render cascades and state corruption
// DISABLED in production for performance

import React, { useRef, useEffect } from 'react';

const IS_DEV = import.meta.env.DEV;

interface DefensiveWrapperProps {
  children: React.ReactNode;
  componentName: string;
  maxRenders?: number;
  onRenderThreshold?: () => void;
  renderThreshold?: number;
  identicalPropsThreshold?: number;
}

// In production: just pass through children with no overhead
// In dev: track renders but only warn on extreme cases
export function DefensiveWrapper({
  children,
  componentName,
  maxRenders = 100,
  onRenderThreshold,
  renderThreshold,
  identicalPropsThreshold,
}: DefensiveWrapperProps) {
  const renderCount = useRef(0);
  const hasWarnedRef = useRef(false);

  if (IS_DEV) {
    renderCount.current++;
  }

  // Only warn once per component per session at 100+ renders
  useEffect(() => {
    if (!IS_DEV) return;

    const threshold = renderThreshold ?? maxRenders;
    if (renderCount.current > threshold && !hasWarnedRef.current) {
      console.warn(
        `[DefensiveWrapper] ${componentName} high render count: ${renderCount.current}`,
      );
      hasWarnedRef.current = true;
      onRenderThreshold?.();
    }
  }, [componentName, maxRenders, onRenderThreshold, renderThreshold]);

  return <>{children}</>;
}

// Error Boundary that catches and logs component failures
interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class DefensiveErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    originalConsoleError('[DefensiveErrorBoundary] Component error:', error);
    originalConsoleError('[DefensiveErrorBoundary] Error info:', errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="p-4 border border-red-500/30 bg-red-500/10 rounded text-red-600 text-sm">
          <p className="font-medium">Component Error</p>
          <p className="text-xs mt-1">{this.state.error?.message}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

// Memoized component factory - prevents unnecessary re-renders
export function createDefensiveComponent<P extends object>(
  name: string,
  Component: React.ComponentType<P>,
  propsAreEqual?: (prevProps: P, nextProps: P) => boolean
): React.NamedExoticComponent<P> {
  return React.memo(Component, propsAreEqual);
}

// Hook for defensive state updates
export function useDefensiveState<T>(
  initialValue: T,
  validator?: (value: T) => boolean
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = React.useState<T>(initialValue);
  const updateCount = useRef(0);

  const defensiveSetState = React.useCallback((value: T | ((prev: T) => T)) => {
    updateCount.current++;
    
    // GUARD: Detect excessive state updates
    if (updateCount.current > 100) {
      originalConsoleWarn('[useDefensiveState] Excessive state updates detected');
      updateCount.current = 0;
    }

    setState(prev => {
      const newValue = typeof value === 'function' 
        ? (value as (prev: T) => T)(prev) 
        : value;
      
      // GUARD: Validate state changes
      if (validator && !validator(newValue)) {
        originalConsoleError('[useDefensiveState] State validation failed');
        return prev;
      }

      return newValue;
    });
  }, [validator]);

  return [state, defensiveSetState];
}
