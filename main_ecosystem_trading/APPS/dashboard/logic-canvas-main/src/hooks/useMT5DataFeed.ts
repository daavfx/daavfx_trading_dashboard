import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { 
  MT5DataFeed, 
  MT5Bar, 
  DataFeedState, 
  DataFeedUpdate,
  HistoricalDataRequest,
  RealTimeSubscription 
} from '../types/mt5_data_feed';

export function useMT5DataFeed() {
  const [dataFeedState, setDataFeedState] = useState<DataFeedState>({
    is_connected: false,
    subscribed_symbols: [],
    last_update: 0
  });
  
  const [realTimeData, setRealTimeData] = useState<Record<string, MT5DataFeed>>({});
  const [historicalData, setHistoricalData] = useState<Record<string, MT5Bar[]>>({});
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const connectDataFeed = useCallback(async (config: {
    server_address: string;
    login: number;
    password: string;
    symbols: string[];
    timeframes: string[];
    enable_real_time: boolean;
    historical_days: number;
    update_interval_ms: number;
  }) => {
    try {
      const providerId = await invoke<string>('create_mt5_data_feed', config);
      
      setDataFeedState(prev => ({
        ...prev,
        is_connected: true,
        last_update: Date.now()
      }));
      
      const unsubscribe = await listen('data_feed_update', (event) => {
        const update = event.payload as DataFeedUpdate;
        
        if (update.type === 'tick' || update.type === 'bar') {
          setRealTimeData(prev => ({
            ...prev,
            [update.symbol]: update.data as MT5DataFeed
          }));
        }
        
        if (update.type === 'connection') {
          setDataFeedState(prev => ({
            ...prev,
            ...(update.data as DataFeedState),
            last_update: Date.now()
          }));
        }
        
        if (update.type === 'error') {
          setDataFeedState(prev => ({
            ...prev,
            error: (update.data as any).message,
            last_update: Date.now()
          }));
        }
      });
      
      unsubscribeRef.current = unsubscribe;
      
      return providerId;
    } catch (error) {
      console.error('Failed to connect to MT5 data feed:', error);
      setDataFeedState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Connection failed',
        is_connected: false
      }));
      throw error;
    }
  }, []);

  const disconnectDataFeed = useCallback(async () => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    
    setDataFeedState({
      is_connected: false,
      subscribed_symbols: [],
      last_update: Date.now()
    });
    
    setRealTimeData({});
    setHistoricalData({});
  }, []);

  const getRealTimeData = useCallback(async (symbol: string) => {
    try {
      const data = await invoke<MT5DataFeed>('get_real_time_data', {
        provider_id: 'default',
        symbol
      });
      
      setRealTimeData(prev => ({
        ...prev,
        [symbol]: data
      }));
      
      return data;
    } catch (error) {
      console.error(`Failed to get real-time data for ${symbol}:`, error);
      throw error;
    }
  }, []);

  const getHistoricalData = useCallback(async (request: HistoricalDataRequest) => {
    const { symbol, timeframe, start_date, end_date, max_bars } = request;
    
    try {
      const data = await invoke<MT5Bar[]>('get_historical_data', {
        provider_id: 'default',
        symbol,
        timeframe,
        start_date: Math.floor(start_date / 1000),
        end_date: Math.floor(end_date / 1000)
      });
      
      const limitedData = max_bars ? data.slice(-max_bars) : data;
      
      const cacheKey = `${symbol}_${timeframe}`;
      setHistoricalData(prev => ({
        ...prev,
        [cacheKey]: limitedData
      }));
      
      return limitedData;
    } catch (error) {
      console.error(`Failed to get historical data for ${symbol}_${timeframe}:`, error);
      throw error;
    }
  }, []);

  const subscribeToRealTime = useCallback(async (subscription: RealTimeSubscription) => {
    if (!dataFeedState.is_connected) {
      throw new Error('Data feed not connected');
    }
    
    setDataFeedState(prev => ({
      ...prev,
      subscribed_symbols: [...new Set([...prev.subscribed_symbols, ...subscription.symbols])]
    }));
    
    // Subscribe to each symbol
    for (const symbol of subscription.symbols) {
      try {
        await getRealTimeData(symbol);
      } catch (error) {
        console.error(`Failed to subscribe to ${symbol}:`, error);
      }
    }
  }, [dataFeedState.is_connected, getRealTimeData]);

  const unsubscribeFromRealTime = useCallback(async (symbols: string[]) => {
    setDataFeedState(prev => ({
      ...prev,
      subscribed_symbols: prev.subscribed_symbols.filter(s => !symbols.includes(s))
    }));
    
    // Remove from real-time data
    setRealTimeData(prev => {
      const updated = { ...prev };
      symbols.forEach(symbol => {
        delete updated[symbol];
      });
      return updated;
    });
  }, []);

  const getLatestPrice = useCallback((symbol: string): MT5DataFeed | undefined => {
    return realTimeData[symbol];
  }, [realTimeData]);

  const getCachedHistoricalData = useCallback((symbol: string, timeframe: string): MT5Bar[] => {
    const cacheKey = `${symbol}_${timeframe}`;
    return historicalData[cacheKey] || [];
  }, [historicalData]);

  const getPriceChange = useCallback((symbol: string): { change: number; changePercent: number } => {
    const data = realTimeData[symbol];
    if (!data || !historicalData[`${symbol}_D1`]) {
      return { change: 0, changePercent: 0 };
    }
    
    const dailyData = historicalData[`${symbol}_D1`];
    if (dailyData.length < 2) {
      return { change: 0, changePercent: 0 };
    }
    
    const previousClose = dailyData[dailyData.length - 2].close;
    const currentPrice = data.last;
    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;
    
    return { change, changePercent };
  }, [realTimeData, historicalData]);

  const getMarketDepth = useCallback(async (symbol: string) => {
    // This would typically come from a Level II data feed
    const currentData = realTimeData[symbol];
    if (!currentData) {
      throw new Error(`No data available for ${symbol}`);
    }
    
    // Generate mock market depth data
    const bids = Array.from({ length: 5 }, (_, i) => ({
      price: currentData.bid - (i + 1) * 0.0001,
      volume: Math.floor(Math.random() * 1000) + 100,
      orders: Math.floor(Math.random() * 10) + 1
    }));
    
    const asks = Array.from({ length: 5 }, (_, i) => ({
      price: currentData.ask + (i + 1) * 0.0001,
      volume: Math.floor(Math.random() * 1000) + 100,
      orders: Math.floor(Math.random() * 10) + 1
    }));
    
    return {
      symbol,
      bids,
      asks,
      timestamp: Date.now()
    };
  }, [realTimeData]);

  useEffect(() => {
    return () => {
      disconnectDataFeed();
    };
  }, [disconnectDataFeed]);

  return {
    dataFeedState,
    realTimeData,
    historicalData,
    connectDataFeed,
    disconnectDataFeed,
    getRealTimeData,
    getHistoricalData,
    subscribeToRealTime,
    unsubscribeFromRealTime,
    getLatestPrice,
    getCachedHistoricalData,
    getPriceChange,
    getMarketDepth
  };
}