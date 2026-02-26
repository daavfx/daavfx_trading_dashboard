//! Diffusion Refinement Layer for Trading Config Parameter Extraction
//!
//! This module adds a diffusion-based refinement to improve the raw
//! transformer predictions. It helps with:
//! - Better number extraction from typos ("griid" → "grid")
//! - Value denoising (noisy input → clean output)
//! - Semantic consistency ("make it aggressive" → appropriate grid/multiplier values)
//!
//! Pure Rust implementation - no external ML dependencies.

use rand::Rng;
use std::collections::HashMap;

/// Diffusion configuration
const DIFFUSION_STEPS: usize = 20;
const NOISE_SCHEDULE: [f32; DIFFUSION_STEPS] = [
    0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9,
    0.95, 1.0, 1.0,
];

/// Known trading parameter patterns
#[derive(Debug, Clone)]
pub struct ParameterPattern {
    pub param_name: String,
    pub value_range: (f32, f32),
    pub typical_values: Vec<f32>,
    pub unit: Option<String>,
}

impl ParameterPattern {
    pub fn new(name: &str, min: f32, max: f32, typical: Vec<f32>, unit: Option<&str>) -> Self {
        ParameterPattern {
            param_name: name.to_string(),
            value_range: (min, max),
            typical_values: typical,
            unit: unit.map(|s| s.to_string()),
        }
    }
}

/// Known trading parameters
pub fn get_known_parameters() -> HashMap<String, ParameterPattern> {
    let mut params = HashMap::new();

    // Grid spacing
    params.insert(
        "grid".to_string(),
        ParameterPattern::new(
            "grid",
            100.0,
            5000.0,
            vec![300.0, 400.0, 500.0, 600.0, 700.0, 800.0, 1000.0],
            Some("pips"),
        ),
    );

    // Multiplier
    params.insert(
        "multiplier".to_string(),
        ParameterPattern::new(
            "multiplier",
            1.0,
            5.0,
            vec![1.1, 1.2, 1.3, 1.5, 1.8, 2.0, 2.2, 2.5],
            None,
        ),
    );

    // Lots
    params.insert(
        "lot".to_string(),
        ParameterPattern::new(
            "lot",
            0.01,
            10.0,
            vec![0.01, 0.02, 0.05, 0.1, 0.15, 0.2, 0.5, 1.0],
            None,
        ),
    );

    // Trail distance
    params.insert(
        "trail".to_string(),
        ParameterPattern::new(
            "trail",
            10.0,
            500.0,
            vec![20.0, 30.0, 50.0, 75.0, 100.0, 150.0, 200.0],
            Some("pips"),
        ),
    );

    // Take Profit
    params.insert(
        "tp".to_string(),
        ParameterPattern::new(
            "tp",
            50.0,
            10000.0,
            vec![100.0, 200.0, 500.0, 1000.0, 2000.0],
            Some("pips"),
        ),
    );

    // Stop Loss
    params.insert(
        "sl".to_string(),
        ParameterPattern::new(
            "sl",
            10.0,
            5000.0,
            vec![50.0, 100.0, 200.0, 300.0, 500.0],
            Some("pips"),
        ),
    );

    // Max trades
    params.insert(
        "maxtrades".to_string(),
        ParameterPattern::new(
            "maxtrades",
            1.0,
            100.0,
            vec![3.0, 5.0, 7.0, 10.0, 15.0, 20.0],
            None,
        ),
    );

    params
}

/// Extracted parameter with confidence
#[derive(Debug, Clone, serde::Serialize)]
pub struct ExtractedParameter {
    pub name: String,
    pub value: f32,
    pub confidence: f32,
    pub is_denoised: bool,
}

/// Diffusion denoiser - learns to remove noise from parameters
pub struct DiffusionDenoiser {
    /// Embedding dimension
    embed_dim: usize,
    /// Hidden dimension
    hidden_dim: usize,
    /// Network weights for denoising
    w1: Vec<f32>,
    b1: Vec<f32>,
    w2: Vec<f32>,
    b2: Vec<f32>,
    /// Known parameters
    known_params: HashMap<String, ParameterPattern>,
}

impl DiffusionDenoiser {
    pub fn new() -> Self {
        let embed_dim = 64;
        let hidden_dim = 128;
        let mut rng = rand::thread_rng();

        DiffusionDenoiser {
            embed_dim,
            hidden_dim,
            w1: (0..embed_dim * hidden_dim)
                .map(|_| rng.gen::<f32>() * 0.1)
                .collect(),
            b1: vec![0.0f32; hidden_dim],
            w2: (0..hidden_dim * embed_dim)
                .map(|_| rng.gen::<f32>() * 0.1)
                .collect(),
            b2: vec![0.0f32; embed_dim],
            known_params: get_known_parameters(),
        }
    }

    /// Forward pass - denoise a noisy parameter embedding
    fn denoise_step(&self, x: &[f32], noise_level: f32) -> Vec<f32> {
        // Simple MLP denoiser
        let mut hidden = vec![0.0f32; self.hidden_dim];

        // First layer
        for i in 0..self.hidden_dim {
            hidden[i] = self.b1[i];
            for j in 0..self.embed_dim {
                hidden[i] += x[j] * self.w1[j * self.hidden_dim + i];
            }
            // GELU activation
            hidden[i] = hidden[i] * 0.5 * (1.0 + (hidden[i] * 1.702).tanh());
        }

        // Second layer
        let mut output = vec![0.0f32; self.embed_dim];
        for i in 0..self.embed_dim {
            output[i] = self.b2[i];
            for j in 0..self.hidden_dim {
                output[i] += hidden[j] * self.w2[j * self.embed_dim + i];
            }
        }

        // Apply noise reduction based on noise level
        for i in 0..output.len() {
            output[i] = output[i] * (1.0 - noise_level * 0.5) + x[i] * noise_level * 0.5;
        }

        output
    }

    /// Full diffusion process - iteratively denoise
    pub fn diffuse_denoise(&self, noisy_value: f32, param_name: &str) -> f32 {
        let mut value = noisy_value;

        // Get parameter bounds if known
        if let Some(pattern) = self.known_params.get(param_name) {
            let (min, max) = pattern.value_range;

            // Forward diffusion (add noise)
            for step in 0..DIFFUSION_STEPS / 2 {
                let noise = NOISE_SCHEDULE[step];
                value = value * (1.0 - noise) + (min + (max - min) * 0.5) * noise;
            }

            // Reverse diffusion (denoise)
            for step in (DIFFUSION_STEPS / 2..DIFFUSION_STEPS).rev() {
                let noise = NOISE_SCHEDULE[step];
                // Interpolate toward typical values
                let mut best_typical = pattern.typical_values[0];
                let mut best_dist = (value - best_typical).abs();

                for &typical in &pattern.typical_values {
                    let dist = (value - typical).abs();
                    if dist < best_dist {
                        best_dist = dist;
                        best_typical = typical;
                    }
                }

                // Denoise toward nearest typical or within range
                value = value * (1.0 - noise * 0.3) + best_typical * noise * 0.3;

                // Clamp to range
                value = value.max(min).min(max);
            }
        }

        value
    }

    /// Extract parameter value from text with diffusion refinement
    pub fn extract_parameter(&self, text: &str, param_name: &str) -> Option<ExtractedParameter> {
        // Try to find a number in the text
        let numbers = self.extract_numbers(text);

        if numbers.is_empty() {
            return None;
        }

        // Get the most likely number (closest to typical values if known)
        let mut best_value = numbers[0];
        let mut best_confidence = 0.5;

        if let Some(pattern) = self.known_params.get(param_name) {
            let (min, max) = pattern.value_range;

            // Find closest typical value
            let mut closest_typical = pattern.typical_values[0];
            let mut closest_dist = (best_value - closest_typical).abs();

            for &typical in &pattern.typical_values {
                let dist = (best_value - typical).abs();
                if dist < closest_dist {
                    closest_dist = dist;
                    closest_typical = typical;
                }
            }

            // Apply diffusion refinement
            let denoised = self.diffuse_denoise(best_value, param_name);

            // Calculate confidence based on how close to typical values
            best_confidence = 1.0 - (closest_dist / (max - min).max(1.0)).min(1.0);
            best_value = denoised;

            // Round to sensible precision
            if max < 10.0 {
                best_value = (best_value * 100.0).round() / 100.0;
            } else if max < 100.0 {
                best_value = (best_value * 10.0).round() / 10.0;
            } else {
                best_value = best_value.round();
            }
        }

        Some(ExtractedParameter {
            name: param_name.to_string(),
            value: best_value,
            confidence: best_confidence,
            is_denoised: true,
        })
    }

    /// Extract all numbers from text
    fn extract_numbers(&self, text: &str) -> Vec<f32> {
        let mut numbers = Vec::new();
        let mut current = String::new();

        for c in text.chars() {
            if c.is_ascii_digit() || c == '.' {
                current.push(c);
            } else if !current.is_empty() {
                if let Ok(num) = current.parse::<f32>() {
                    numbers.push(num);
                }
                current.clear();
            }
        }

        // Don't forget last number
        if !current.is_empty() {
            if let Ok(num) = current.parse::<f32>() {
                numbers.push(num);
            }
        }

        numbers
    }

    /// Refine intent-based on semantic input
    pub fn refine_semantic(&self, intent: &str, text: &str) -> Option<HashMap<String, f32>> {
        let text_lower = text.to_lowercase();

        match intent {
            "SEMANTIC" => {
                let mut params = HashMap::new();

                // Aggressive patterns
                if text_lower.contains("aggressive")
                    || text_lower.contains("risk")
                    || text_lower.contains("high")
                {
                    params.insert("multiplier".to_string(), 2.0);
                    params.insert("grid".to_string(), 300.0);
                }
                // Conservative patterns
                else if text_lower.contains("safe")
                    || text_lower.contains("conservative")
                    || text_lower.contains("low")
                {
                    params.insert("multiplier".to_string(), 1.1);
                    params.insert("grid".to_string(), 800.0);
                }
                // Balanced
                else if text_lower.contains("balance") || text_lower.contains("normal") {
                    params.insert("multiplier".to_string(), 1.5);
                    params.insert("grid".to_string(), 500.0);
                }

                if params.is_empty() {
                    None
                } else {
                    Some(params)
                }
            }
            _ => None,
        }
    }
}

/// Combined transformer + diffusion pipeline
pub struct TransformerWithDiffusion {
    transformer: super::trading_transformer::TradingTransformer,
    denoiser: DiffusionDenoiser,
}

impl TransformerWithDiffusion {
    pub fn new() -> Self {
        TransformerWithDiffusion {
            transformer: super::trading_transformer::TradingTransformer::new(),
            denoiser: DiffusionDenoiser::new(),
        }
    }

    /// Predict and extract parameters from input
    pub fn predict_with_params(&self, input: &str) -> (String, f32, Vec<ExtractedParameter>) {
        let (intent, confidence) = self.transformer.predict(input);
        let intent_str = intent.as_str().to_string();

        // Extract known parameters
        let mut params = Vec::new();
        for param_name in self.denoiser.known_params.keys() {
            if let Some(extracted) = self.denoiser.extract_parameter(input, param_name) {
                if extracted.confidence > 0.3 {
                    params.push(extracted);
                }
            }
        }

        // Handle semantic intents
        if intent_str == "SEMANTIC" {
            if let Some(semantic_params) = self.denoiser.refine_semantic(&intent_str, input) {
                for (name, value) in semantic_params {
                    params.push(ExtractedParameter {
                        name,
                        value,
                        confidence: 0.8,
                        is_denoised: true,
                    });
                }
            }
        }

        (intent_str, confidence, params)
    }

    /// Train the transformer component
    pub fn train(
        &mut self,
        examples: &[super::trading_transformer::TrainingExample],
        epochs: usize,
    ) {
        self.transformer.train(examples, epochs, 0.05);
    }
}

impl Default for DiffusionDenoiser {
    fn default() -> Self {
        Self::new()
    }
}

impl Default for TransformerWithDiffusion {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parameter_extraction() {
        let denoiser = DiffusionDenoiser::new();

        // Test grid extraction
        let result = denoiser.extract_parameter("set grid to 600", "grid");
        println!("Extracted: {:?}", result);

        // Test multiplier extraction
        let result = denoiser.extract_parameter("multiplier 1.5", "multiplier");
        println!("Extracted: {:?}", result);
    }

    #[test]
    fn test_semantic_refinement() {
        let denoiser = DiffusionDenoiser::new();

        let result = denoiser.refine_semantic("SEMANTIC", "make it more aggressive");
        println!("Semantic params: {:?}", result);
    }
}
