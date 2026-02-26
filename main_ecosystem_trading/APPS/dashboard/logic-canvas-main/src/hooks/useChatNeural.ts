import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface IntentPrediction {
  intent: string;
  confidence: number;
  input: string;
}

interface ExtractedParameter {
  name: string;
  value: number;
  confidence: number;
  is_denoised: boolean;
}

interface DiffusionPrediction {
  intent: string;
  confidence: number;
  parameters: ExtractedParameter[];
  input: string;
}

interface CommandExtraction {
  command: string;
  is_greeting: boolean;
  confidence: number;
  greeting_type: string | null;
}

export function useChatNeural() {
  const [isTrained, setIsTrained] = useState(false);
  const [isTraining, setIsTraining] = useState(false);
  const [lastPrediction, setLastPrediction] = useState<IntentPrediction | null>(null);
  const [lastExtraction, setLastExtraction] = useState<CommandExtraction | null>(null);
  // Transformer state
  const [isTransformerTrained, setIsTransformerTrained] = useState(false);
  const [isTransformerTraining, setIsTransformerTraining] = useState(false);
  // Diffusion state
  const [isDiffusionTrained, setIsDiffusionTrained] = useState(false);
  const [isDiffusionTraining, setIsDiffusionTraining] = useState(false);
  const [lastDiffusionPrediction, setLastDiffusionPrediction] = useState<DiffusionPrediction | null>(null);

  // Check if model is trained on mount
  useEffect(() => {
    checkTrained();
    checkTransformerTrained();
  }, []);

  const checkTransformerTrained = useCallback(async () => {
    try {
      const trained = await invoke<boolean>('is_transformer_trained');
      setIsTransformerTrained(trained);
    } catch (e) {
      console.error('Failed to check transformer training status:', e);
    }
  }, []);

  const checkTrained = useCallback(async () => {
    try {
      const trained = await invoke<boolean>('is_trained');
      setIsTrained(trained);
    } catch (e) {
      console.error('Failed to check training status:', e);
    }
  }, []);

  const trainModel = useCallback(async () => {
    setIsTraining(true);
    try {
      const result = await invoke<string>('train_chat_neural');
      console.log('Training result:', result);
      setIsTrained(true);
      return result;
    } catch (e) {
      console.error('Training failed:', e);
      throw e;
    } finally {
      setIsTraining(false);
    }
  }, []);

  const predictIntent = useCallback(async (input: string): Promise<IntentPrediction> => {
    const prediction = await invoke<IntentPrediction>('predict_intent', { input });
    setLastPrediction(prediction);
    return prediction;
  }, []);

  const learnCorrection = useCallback(async (wrong: string, correct: string) => {
    try {
      await invoke('learn_correction', { wrong, correct });
      console.log(`Learned: "${wrong}" → "${correct}"`);
    } catch (e) {
      console.error('Failed to learn correction:', e);
      throw e;
    }
  }, []);

  // NEW: Preprocess input (strips greetings, slang)
  const preprocessInput = useCallback(async (input: string): Promise<CommandExtraction> => {
    const extraction = await invoke<CommandExtraction>('preprocess_command', { input });
    setLastExtraction(extraction);
    return extraction;
  }, []);

  // ============ TRANSFORMER FUNCTIONS ============
  
  const trainTransformer = useCallback(async () => {
    setIsTransformerTraining(true);
    try {
      const result = await invoke<string>('train_transformer');
      console.log('Transformer training result:', result);
      setIsTransformerTrained(true);
      return result;
    } catch (e) {
      console.error('Transformer training failed:', e);
      throw e;
    } finally {
      setIsTransformerTraining(false);
    }
  }, []);

  const predictWithTransformer = useCallback(async (input: string): Promise<IntentPrediction> => {
    const prediction = await invoke<IntentPrediction>('predict_transformer', { input });
    console.log('Transformer prediction:', prediction);
    return prediction;
  }, []);

  // ============ DIFFUSION REFINEMENT FUNCTIONS ============
  
  const trainDiffusionPipeline = useCallback(async () => {
    setIsDiffusionTraining(true);
    try {
      const result = await invoke<string>('train_diffusion_pipeline');
      console.log('Diffusion pipeline result:', result);
      setIsDiffusionTrained(true);
      return result;
    } catch (e) {
      console.error('Diffusion training failed:', e);
      throw e;
    } finally {
      setIsDiffusionTraining(false);
    }
  }, []);

  const predictWithDiffusion = useCallback(async (input: string): Promise<DiffusionPrediction> => {
    const prediction = await invoke<DiffusionPrediction>('predict_with_diffusion', { input });
    console.log('Diffusion prediction:', prediction);
    setLastDiffusionPrediction(prediction);
    return prediction;
  }, []);

  const extractParameter = useCallback(async (text: string, paramName: string): Promise<ExtractedParameter | null> => {
    const param = await invoke<ExtractedParameter | null>('extract_parameter', { text, paramName });
    return param;
  }, []);

  return {
    isTrained,
    isTraining,
    lastPrediction,
    lastExtraction,
    trainModel,
    predictIntent,
    learnCorrection,
    preprocessInput,
    checkTrained,
    // Transformer exports
    isTransformerTrained,
    isTransformerTraining,
    trainTransformer,
    predictWithTransformer,
    // Diffusion exports
    isDiffusionTrained,
    isDiffusionTraining,
    lastDiffusionPrediction,
    trainDiffusionPipeline,
    predictWithDiffusion,
    extractParameter,
  };
}
