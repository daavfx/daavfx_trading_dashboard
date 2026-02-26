//! Tauri commands for the chat neural network

use crate::chat_neural::{generate_training_data, TinyNeural};
use std::sync::Mutex;
use tauri::State;

/// Neural network state - persists across commands
pub struct ChatNeuralState {
    pub network: Mutex<TinyNeural>,
    pub trained: Mutex<bool>,
}

impl Default for ChatNeuralState {
    fn default() -> Self {
        ChatNeuralState {
            network: Mutex::new(TinyNeural::new()),
            trained: Mutex::new(false),
        }
    }
}

/// Train the neural network on trading config commands
#[tauri::command]
pub fn train_chat_neural(state: State<'_, ChatNeuralState>) -> Result<String, String> {
    let mut net = state.network.lock().map_err(|e| e.to_string())?;

    let examples = generate_training_data();
    println!("Training on {} examples...", examples.len());

    net.train(&examples, 100, 0.1);

    *state.trained.lock().map_err(|e| e.to_string())? = true;

    Ok(format!("Trained on {} examples!", examples.len()))
}

/// Predict intent from a chat command
#[tauri::command]
pub fn predict_intent(
    state: State<'_, ChatNeuralState>,
    input: String,
) -> Result<IntentPrediction, String> {
    let net = state.network.lock().map_err(|e| e.to_string())?;

    let (intent, prob) = net.predict(&input);

    Ok(IntentPrediction {
        intent: intent.as_str().to_string(),
        confidence: prob,
        input,
    })
}

/// Learn from a user correction
#[tauri::command]
pub fn learn_correction(
    state: State<'_, ChatNeuralState>,
    wrong: String,
    correct: String,
) -> Result<(), String> {
    let mut net = state.network.lock().map_err(|e| e.to_string())?;
    net.learn_correction(&wrong, &correct);
    Ok(())
}

/// Check if model is trained
#[tauri::command]
pub fn is_trained(state: State<'_, ChatNeuralState>) -> Result<bool, String> {
    let trained = state.trained.lock().map_err(|e| e.to_string())?;
    Ok(*trained)
}

/// Result of intent prediction
#[derive(serde::Serialize)]
pub struct IntentPrediction {
    pub intent: String,
    pub confidence: f32,
    pub input: String,
}

// ============================================
// TRANSFORMER COMMANDS - Pure Rust Transformer
// ============================================

use crate::diffusion_refine::{DiffusionDenoiser, ExtractedParameter, TransformerWithDiffusion};
use crate::trading_transformer::{
    generate_training_data as gen_transformer_data, TradingTransformer, TransformerIntent,
};

/// Transformer state
pub struct TransformerState {
    pub transformer: Mutex<TradingTransformer>,
    pub trained: Mutex<bool>,
}

impl Default for TransformerState {
    fn default() -> Self {
        TransformerState {
            transformer: Mutex::new(TradingTransformer::new()),
            trained: Mutex::new(false),
        }
    }
}

/// Train the transformer
#[tauri::command]
pub fn train_transformer(state: State<'_, TransformerState>) -> Result<String, String> {
    let mut tf = state.transformer.lock().map_err(|e| e.to_string())?;

    let examples = gen_transformer_data();
    println!("Training Transformer on {} examples...", examples.len());

    tf.train(&examples, 50, 0.05);

    *state.trained.lock().map_err(|e| e.to_string())? = true;

    Ok(format!(
        "Transformer trained on {} examples!",
        examples.len()
    ))
}

/// Predict with transformer
#[tauri::command]
pub fn predict_transformer(
    state: State<'_, TransformerState>,
    input: String,
) -> Result<IntentPrediction, String> {
    let tf = state.transformer.lock().map_err(|e| e.to_string())?;

    let (intent, prob) = tf.predict(&input);

    Ok(IntentPrediction {
        intent: intent.as_str().to_string(),
        confidence: prob,
        input,
    })
}

/// Check if transformer is trained
#[tauri::command]
pub fn is_transformer_trained(state: State<'_, TransformerState>) -> Result<bool, String> {
    let trained = state.trained.lock().map_err(|e| e.to_string())?;
    Ok(*trained)
}

// ============================================
// DIFFUSION REFINEMENT COMMANDS
// ============================================

/// Diffusion refinement state
pub struct DiffusionState {
    pub denoiser: Mutex<DiffusionDenoiser>,
    pub pipeline: Mutex<TransformerWithDiffusion>,
    pub trained: Mutex<bool>,
}

impl Default for DiffusionState {
    fn default() -> Self {
        DiffusionState {
            denoiser: Mutex::new(DiffusionDenoiser::new()),
            pipeline: Mutex::new(TransformerWithDiffusion::new()),
            trained: Mutex::new(false),
        }
    }
}

/// Train the full pipeline (transformer + diffusion)
#[tauri::command]
pub fn train_diffusion_pipeline(state: State<'_, DiffusionState>) -> Result<String, String> {
    let mut pipeline = state.pipeline.lock().map_err(|e| e.to_string())?;

    let examples = gen_transformer_data();
    println!(
        "Training diffusion pipeline on {} examples...",
        examples.len()
    );

    pipeline.train(&examples, 50);

    *state.trained.lock().map_err(|e| e.to_string())? = true;

    Ok(format!(
        "Diffusion pipeline trained on {} examples!",
        examples.len()
    ))
}

/// Predict with diffusion refinement - returns intent + extracted parameters
#[tauri::command]
pub fn predict_with_diffusion(
    state: State<'_, DiffusionState>,
    input: String,
) -> Result<DiffusionPrediction, String> {
    let pipeline = state.pipeline.lock().map_err(|e| e.to_string())?;

    let (intent, confidence, params) = pipeline.predict_with_params(&input);

    Ok(DiffusionPrediction {
        intent,
        confidence,
        parameters: params,
        input,
    })
}

/// Result of diffusion-enhanced prediction
#[derive(serde::Serialize)]
pub struct DiffusionPrediction {
    pub intent: String,
    pub confidence: f32,
    pub parameters: Vec<ExtractedParameter>,
    pub input: String,
}

/// Extract a specific parameter with diffusion denoising
#[tauri::command]
pub fn extract_parameter(
    denoiser: State<'_, DiffusionState>,
    text: String,
    param_name: String,
) -> Result<Option<ExtractedParameter>, String> {
    let denoiser = denoiser.denoiser.lock().map_err(|e| e.to_string())?;
    Ok(denoiser.extract_parameter(&text, &param_name))
}
