// Performance optimizations for DAAVFX Help System
// Debounced search, lazy loading, caching

import { useState, useCallback, useMemo, useRef } from 'react';
import { HELP_ENTRIES, HELP_CATEGORIES } from '@/data/help-docs';

// Debounced search hook
export const useDebouncedSearch = (query: string, delay: number = 300) => {
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const timeoutRef = useRef<NodeJS.Timeout>();
  
  useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, delay);
  }, [query, delay]);
  
  return debouncedQuery;
};

// Optimized search with caching
export const useOptimizedSearch = (query: string) => {
  const debouncedQuery = useDebouncedSearch(query);
  const searchCache = useRef<Map<string, any[]>>(new Map());
  
  return useMemo(() => {
    if (!debouncedQuery.trim()) return null;
    
    // Check cache first
    if (searchCache.current.has(debouncedQuery)) {
      return searchCache.current.get(debouncedQuery);
    }
    
    // Perform search
    const q = debouncedQuery.toLowerCase();
    const results = HELP_ENTRIES.filter(entry =>
      entry.title.toLowerCase().includes(q) ||
      entry.shortDesc.toLowerCase().includes(q) ||
      entry.fullDesc.toLowerCase().includes(q) ||
      entry.id.toLowerCase().includes(q)
    );
    
    // Cache results
    searchCache.current.set(debouncedQuery, results);
    
    // Limit cache size
    if (searchCache.current.size > 50) {
      const firstKey = searchCache.current.keys().next().value;
      searchCache.current.delete(firstKey);
    }
    
    return results;
  }, [debouncedQuery]);
};

// Lazy category loading
export const useLazyCategory = (categoryId: string) => {
  const [isLoading, setIsLoading] = useState(false);
  const [entries, setEntries] = useState<any[]>([]);
  const loadedCategories = useRef<Set<string>>(new Set());
  
  const loadCategory = useCallback(async () => {
    if (loadedCategories.current.has(categoryId)) {
      return;
    }
    
    setIsLoading(true);
    
    // Simulate async loading (in real app, this could be API call)
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const categoryEntries = HELP_ENTRIES.filter(entry => entry.category === categoryId);
    setEntries(categoryEntries);
    loadedCategories.current.add(categoryId);
    setIsLoading(false);
  }, [categoryId]);
  
  return {
    entries,
    isLoading,
    loadCategory
  };
};

// Virtual scrolling for large lists
export const useVirtualScroll = (items: any[], itemHeight: number = 60, containerHeight: number = 400) => {
  const [scrollTop, setScrollTop] = useState(0);
  
  const visibleItems = useMemo(() => {
    const startIndex = Math.floor(scrollTop / itemHeight);
    const endIndex = Math.min(
      startIndex + Math.ceil(containerHeight / itemHeight) + 1,
      items.length
    );
    
    return items.slice(startIndex, endIndex).map((item, index) => ({
      ...item,
      index: startIndex + index,
      top: (startIndex + index) * itemHeight
    }));
  }, [items, scrollTop, itemHeight, containerHeight]);
  
  const totalHeight = items.length * itemHeight;
  
  return {
    visibleItems,
    totalHeight,
    onScroll: (e: React.UIEvent) => setScrollTop(e.currentTarget.scrollTop)
  };
};

// Preload critical content
export const usePreloadContent = () => {
  const [isPreloaded, setIsPreloaded] = useState(false);
  
  useMemo(() => {
    // Preload first 6 categories (most commonly used)
    const criticalCategories = HELP_CATEGORIES.slice(0, 6);
    criticalCategories.forEach(category => {
      HELP_ENTRIES.filter(entry => entry.category === category.id);
    });
    
    setIsPreloaded(true);
  }, []);
  
  return isPreloaded;
};

// Intersection Observer for lazy loading
export const useIntersectionObserver = (enabled: boolean = true) => {
  const [isVisible, setIsVisible] = useState(false);
  const elementRef = useRef<HTMLElement>(null);
  
  useMemo(() => {
    if (!enabled) return;
    
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );
    
    if (elementRef.current) {
      observer.observe(elementRef.current);
    }
    
    return () => observer.disconnect();
  }, [enabled]);
  
  return {
    isVisible,
    elementRef
  };
};

// Memory-efficient help renderer
export const useEfficientHelpRenderer = () => {
  const renderCache = useRef<Map<string, React.ReactNode>>(new Map());
  
  const cacheEntry = (id: string, content: React.ReactNode) => {
    if (!renderCache.current.has(id)) {
      renderCache.current.set(id, content);
    }
    return renderCache.current.get(id);
  };
  
  const clearCache = () => {
    renderCache.current.clear();
  };
  
  return {
    cacheEntry,
    clearCache
  };
};

// Performance monitoring
export const usePerformanceMonitor = () => {
  const metrics = useRef({
    searchTime: 0,
    renderTime: 0,
    cacheHits: 0,
    cacheMisses: 0
  });
  
  const measureSearch = (fn: () => any) => {
    const start = performance.now();
    const result = fn();
    metrics.current.searchTime = performance.now() - start;
    return result;
  };
  
  const measureRender = (fn: () => void) => {
    const start = performance.now();
    fn();
    metrics.current.renderTime = performance.now() - start;
  };
  
  const getMetrics = () => ({ ...metrics.current });
  
  return {
    measureSearch,
    measureRender,
    getMetrics
  };
};