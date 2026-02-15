import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  BacktestConfig, 
  BacktestResult, 
  PerformanceMetrics, 
  Trade,
  TradeAction,
  BacktestEngineState,
  OptimizationConfig
} from '../types/backtest';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';

export function useBacktestEngine() {
  const [engineState, setEngineState] = useState<BacktestEngineState>({
    is_running: false,
    results: [],
    progress: 0
  });
  
  const [isConnected, setIsConnected] = useState(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const connectToEngine = useCallback(async () => {
    try {
      const engineId = await invoke<string>('create_backtest_engine', {
        max_workers: 16,
        enable_gpu: true
      });
      
      setIsConnected(true);
      console.log('Backtest engine connected:', engineId);
      
      const unsubscribe = await listen('backtest_progress', (event) => {
        const { type, data, progress, message } = event.payload as any;
        
        setEngineState(prev => ({
          ...prev,
          progress: progress || prev.progress,
          error: type === 'error' ? message : undefined
        }));
        
        if (type === 'result') {
          setEngineState(prev => ({
            ...prev,
            results: [...prev.results, data],
            current_test: data
          }));
        }
        
        if (type === 'complete') {
          setEngineState(prev => ({
            ...prev,
            is_running: false,
            progress: 100
          }));
        }
      });
      
      unsubscribeRef.current = unsubscribe;
      
    } catch (error) {
      console.error('Failed to connect to backtest engine:', error);
      setIsConnected(false);
    }
  }, []);

  const disconnectFromEngine = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    setIsConnected(false);
    setEngineState({
      is_running: false,
      results: [],
      progress: 0
    });
  }, []);

  const runSingleBacktest = useCallback(async (config: BacktestConfig) => {
    try {
      setEngineState(prev => ({ ...prev, is_running: true, progress: 0 }));
      
      const result = await invoke<BacktestResult>('run_single_backtest', {
        strategy_id: config.strategy_id,
        symbol: config.symbol,
        timeframe: config.timeframe,
        start_date: Math.floor(config.start_date.getTime() / 1000),
        end_date: Math.floor(config.end_date.getTime() / 1000),
        initial_balance: config.initial_balance,
        leverage: config.leverage,
        spread: config.spread,
        commission: config.commission,
        parameters: config.parameters
      });
      
      setEngineState(prev => ({
        ...prev,
        is_running: false,
        results: [...prev.results, result],
        current_test: result,
        progress: 100
      }));
      
      return result;
    } catch (error) {
      console.error('Backtest failed:', error);
      setEngineState(prev => ({
        ...prev,
        is_running: false,
        error: error instanceof Error ? error.message : 'Backtest failed'
      }));
      throw error;
    }
  }, []);

  const runParallelBacktests = useCallback(async (configs: BacktestConfig[]) => {
    try {
      setEngineState(prev => ({ ...prev, is_running: true, progress: 0 }));
      
      const results = await invoke<BacktestResult[]>('run_parallel_backtests', {
        configs: configs.map(config => ({
          ...config,
          start_date: Math.floor(config.start_date.getTime() / 1000),
          end_date: Math.floor(config.end_date.getTime() / 1000)
        }))
      });
      
      setEngineState(prev => ({
        ...prev,
        is_running: false,
        results: [...prev.results, ...results],
        progress: 100
      }));
      
      return results;
    } catch (error) {
      console.error('Parallel backtests failed:', error);
      setEngineState(prev => ({
        ...prev,
        is_running: false,
        error: error instanceof Error ? error.message : 'Parallel backtests failed'
      }));
      throw error;
    }
  }, []);

  const optimizeStrategy = useCallback(async (config: OptimizationConfig) => {
    try {
      setEngineState(prev => ({ ...prev, is_running: true, progress: 0 }));
      
      const results = await invoke<BacktestResult[]>('optimize_strategy_parameters', {
        strategy_id: config.strategy_id,
        symbol: config.symbol,
        timeframe: config.timeframe,
        start_date: Math.floor(config.start_date.getTime() / 1000),
        end_date: Math.floor(config.end_date.getTime() / 1000),
        initial_balance: config.initial_balance,
        leverage: config.leverage,
        spread: config.spread,
        commission: config.commission,
        parameter_ranges: config.parameter_ranges
      });
      
      setEngineState(prev => ({
        ...prev,
        is_running: false,
        results: [...prev.results, ...results],
        progress: 100
      }));
      
      return results;
    } catch (error) {
      console.error('Strategy optimization failed:', error);
      setEngineState(prev => ({
        ...prev,
        is_running: false,
        error: error instanceof Error ? error.message : 'Strategy optimization failed'
      }));
      throw error;
    }
  }, []);

  const clearResults = useCallback(() => {
    setEngineState(prev => ({
      ...prev,
      results: [],
      current_test: undefined,
      progress: 0
    }));
  }, []);

  useEffect(() => {
    connectToEngine();
    
    return () => {
      disconnectFromEngine();
    };
  }, [connectToEngine, disconnectFromEngine]);

  return {
    engineState,
    isConnected,
    runSingleBacktest,
    runParallelBacktests,
    optimizeStrategy,
    clearResults,
    connectToEngine,
    disconnectFromEngine
  };
}

export function usePerformanceAnalysis(results: BacktestResult[]) {
  const analysis = useMemo(() => {
    if (results.length === 0) {
      return null;
    }

    const metrics = results.map(r => r.metrics);
    
    const bestResult = results.reduce((best, current) => 
      current.metrics.sharpe_ratio > best.metrics.sharpe_ratio ? current : best
    );
    
    const worstResult = results.reduce((worst, current) => 
      current.metrics.sharpe_ratio < worst.metrics.sharpe_ratio ? current : worst
    );
    
    const avgSharpe = metrics.reduce((sum, m) => sum + m.sharpe_ratio, 0) / metrics.length;
    const avgReturn = metrics.reduce((sum, m) => sum + m.total_return, 0) / metrics.length;
    const avgDrawdown = metrics.reduce((sum, m) => sum + m.max_drawdown, 0) / metrics.length;
    const avgWinRate = metrics.reduce((sum, m) => sum + m.win_rate, 0) / metrics.length;
    
    const totalTrades = metrics.reduce((sum, m) => sum + m.total_trades, 0);
    const profitableTrades = metrics.reduce((sum, m) => sum + m.winning_trades, 0);
    const overallWinRate = totalTrades > 0 ? profitableTrades / totalTrades : 0;

    return {
      bestResult,
      worstResult,
      avgSharpe,
      avgReturn,
      avgDrawdown,
      avgWinRate,
      overallWinRate,
      totalTrades,
      profitableTrades,
      resultsCount: results.length
    };
  }, [results]);

  return analysis;
}

export function useTradeAnalysis(trades: Trade[]) {
  const analysis = useMemo(() => {
    if (trades.length === 0) {
      return null;
    }

    const winningTrades = trades.filter(t => t.profit !== undefined && t.profit > 0);
    const losingTrades = trades.filter(t => t.profit !== undefined && t.profit <= 0);
    
    const totalProfit = trades.reduce((sum, t) => sum + (t.profit || 0), 0);
    const totalPips = trades.reduce((sum, t) => sum + (t.pips || 0), 0);
    
    const avgWin = winningTrades.length > 0 
      ? winningTrades.reduce((sum, t) => sum + (t.profit || 0), 0) / winningTrades.length 
      : 0;
    
    const avgLoss = losingTrades.length > 0 
      ? losingTrades.reduce((sum, t) => sum + (t.profit || 0), 0) / losingTrades.length 
      : 0;
    
    const longTrades = trades.filter(t => t.action === TradeAction.Buy);
    const shortTrades = trades.filter(t => t.action === TradeAction.Sell);
    
    const longWinRate = longTrades.length > 0 
      ? longTrades.filter(t => t.profit !== undefined && t.profit > 0).length / longTrades.length 
      : 0;
    
    const shortWinRate = shortTrades.length > 0 
      ? shortTrades.filter(t => t.profit !== undefined && t.profit > 0).length / shortTrades.length 
      : 0;

    const avgTradeDuration = trades.length > 0
      ? trades.reduce((sum, t) => {
          if (t.exit_time && t.entry_time) {
            return sum + (t.exit_time - t.entry_time);
          }
          return sum;
        }, 0) / trades.length
      : 0;

    return {
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: trades.length > 0 ? winningTrades.length / trades.length : 0,
      totalProfit,
      totalPips,
      avgWin,
      avgLoss,
      profitFactor: avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : Infinity,
      longTrades: longTrades.length,
      shortTrades: shortTrades.length,
      longWinRate,
      shortWinRate,
      avgTradeDuration
    };
  }, [trades]);

  return analysis;
}