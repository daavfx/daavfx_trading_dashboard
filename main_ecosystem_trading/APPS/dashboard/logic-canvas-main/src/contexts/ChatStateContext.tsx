import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { TransactionPlan, ChangePreview, ChatMessage } from '@/lib/chat/types';

interface ChatState {
  // Messages
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  
  // Pending plan (awaiting approval)
  pendingPlan: TransactionPlan | null;
  setPendingPlan: React.Dispatch<React.SetStateAction<TransactionPlan | null>>;
  
  // Last applied changes preview
  lastAppliedPreview: ChangePreview[] | null;
  setLastAppliedPreview: React.Dispatch<React.SetStateAction<ChangePreview[] | null>>;
  
  // Input state
  inputValue: string;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  
  // Clear all state
  clearAll: () => void;
  
  // Add message helper
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
}

const ChatStateContext = createContext<ChatState | null>(null);

export function ChatStateProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content: 'Welcome to Ryiuk! I can help you modify trading parameters.\n\nTry commands like:\n• "show grid for all groups"\n• "set grid to 600 for groups 1-8"\n• "create progression for grid fibonacci groups 1-8"',
      timestamp: Date.now(),
    },
  ]);
  
  const [pendingPlan, setPendingPlan] = useState<TransactionPlan | null>(null);
  const [lastAppliedPreview, setLastAppliedPreview] = useState<ChangePreview[] | null>(null);
  const [inputValue, setInputValue] = useState('');
  
  const clearAll = useCallback(() => {
    setMessages([
      {
        id: 'welcome',
        role: 'system',
        content: 'Welcome to Ryiuk! I can help you modify trading parameters.\n\nTry commands like:\n• "show grid for all groups"\n• "set grid to 600 for groups 1-8"\n• "create progression for grid fibonacci groups 1-8"',
        timestamp: Date.now(),
      },
    ]);
    setPendingPlan(null);
    setLastAppliedPreview(null);
    setInputValue('');
  }, []);
  
  const addMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: `${message.role}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev.slice(-99), newMessage]); // Keep last 100 messages
  }, []);
  
  return (
    <ChatStateContext.Provider
      value={{
        messages,
        setMessages,
        pendingPlan,
        setPendingPlan,
        lastAppliedPreview,
        setLastAppliedPreview,
        inputValue,
        setInputValue,
        clearAll,
        addMessage,
      }}
    >
      {children}
    </ChatStateContext.Provider>
  );
}

export function useChatState() {
  const context = useContext(ChatStateContext);
  if (!context) {
    throw new Error('useChatState must be used within a ChatStateProvider');
  }
  return context;
}
