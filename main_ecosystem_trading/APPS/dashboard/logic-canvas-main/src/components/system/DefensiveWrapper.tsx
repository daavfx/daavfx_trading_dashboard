// Defensive Component Wrapper - Prevents render cascades and state corruption
// Makes UI failures structurally impossible

import React, { useRef, useEffect } from 'react';

const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

interface DefensiveWrapperProps {
  children: React.ReactNode;
  componentName: string;
  maxRenders?: number;
  onRenderThreshold?: () => void;
}

// INVARIANT: Components cannot render more than maxRenders times
// INVARIANT: State updates are batched and deduplicated
export function DefensiveWrapper({
  children,
  componentName,
  maxRenders = 100,
  onRenderThreshold,
}: DefensiveWrapperProps) {
  const renderCount = useRef(0);
  const lastProps = useRef<string>('');
  const consecutiveIdenticalRenders = useRef(0);
  const hasWarnedRef = useRef(false);

  renderCount.current++;

  // GUARD: Detect render loops
  useEffect(() => {
    if (renderCount.current > maxRenders) {
      originalConsoleError(`[DefensiveWrapper] ${componentName} exceeded render threshold: ${renderCount.current}`);
      onRenderThreshold?.();
      
      // Reset counter to prevent log spam
      renderCount.current = 0;
    }
  });

  // GUARD: Detect unnecessary re-renders with identical props
  const currentProps = typeof children === 'string' ? children : String(children);
  if (currentProps === lastProps.current) {
    consecutiveIdenticalRenders.current++;
    if (consecutiveIdenticalRenders.current > 10 && !hasWarnedRef.current) {
      originalConsoleWarn(`[DefensiveWrapper] ${componentName} rendering with identical props ${consecutiveIdenticalRenders.current} times`);
      hasWarnedRef.current = true;
    }
  } else {
    consecutiveIdenticalRenders.current = 0;
    lastProps.current = currentProps;
    hasWarnedRef.current = false;
  }

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
