// Production-safe logger - all logs disabled in production build
const IS_DEV = import.meta.env.DEV;

export const logger = {
  log: IS_DEV ? console.log.bind(console) : () => {},
  warn: IS_DEV ? console.warn.bind(console) : () => {},
  error: console.error.bind(console), // Always log errors
  debug: IS_DEV ? console.debug.bind(console) : () => {},
  info: IS_DEV ? console.info.bind(console) : () => {},
};

// For critical errors that should always be logged
export const logError = (context: string, error: any) => {
  console.error(`[${context}]`, error);
  // In production, you could send this to a monitoring service
};

// For development debugging
export const logDebug = IS_DEV 
  ? (context: string, ...args: any[]) => console.log(`[${context}]`, ...args)
  : () => {};
