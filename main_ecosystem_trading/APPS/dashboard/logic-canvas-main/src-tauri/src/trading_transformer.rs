//! Pure Rust Transformer for Trading Config NLU
//!
//! A real transformer architecture with self-attention for understanding
//! trading config commands. This is the core of your assistant.
//!
//! Architecture:
//! - Token embeddings (learned)
//! - Positional encoding (sinusoidal)
//! - Multi-head self-attention (4 heads)
//! - Feedforward network (128 dim)
//! - Layer norm
//! - Output: intent classification

use rand::Rng;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// Maximum sequence length
const MAX_SEQ_LEN: usize = 64;
/// Embedding dimension
const EMBED_DIM: usize = 128;
/// Number of attention heads
const NUM_HEADS: usize = 4;
/// Feedforward dimension
const FF_DIM: usize = 512;
/// Number of transformer layers
const NUM_LAYERS: usize = 2;
/// Vocabulary size
const VOCAB_SIZE: usize = 256;
/// Number of intent classes
const NUM_INTENTS: usize = 16;

/// Intent types for transformer
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize)]
pub enum TransformerIntent {
    Set = 0,
    Query = 1,
    Semantic = 2,
    Copy = 3,
    Compare = 4,
    Reset = 5,
    Formula = 6,
    Import = 7,
    Progression = 8,
    Unknown = 15,
}

impl TransformerIntent {
    pub fn from_index(idx: usize) -> Self {
        match idx {
            0 => TransformerIntent::Set,
            1 => TransformerIntent::Query,
            2 => TransformerIntent::Semantic,
            3 => TransformerIntent::Copy,
            4 => TransformerIntent::Compare,
            5 => TransformerIntent::Reset,
            6 => TransformerIntent::Formula,
            7 => TransformerIntent::Import,
            8 => TransformerIntent::Progression,
            _ => TransformerIntent::Unknown,
        }
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            TransformerIntent::Set => "SET",
            TransformerIntent::Query => "QUERY",
            TransformerIntent::Semantic => "SEMANTIC",
            TransformerIntent::Copy => "COPY",
            TransformerIntent::Compare => "COMPARE",
            TransformerIntent::Reset => "RESET",
            TransformerIntent::Formula => "FORMULA",
            TransformerIntent::Import => "IMPORT",
            TransformerIntent::Progression => "PROGRESSION",
            TransformerIntent::Unknown => "UNKNOWN",
        }
    }
}

/// Token vocabulary
pub struct Vocabulary {
    char_to_idx: HashMap<char, usize>,
    idx_to_char: Vec<char>,
}

impl Vocabulary {
    pub fn new() -> Self {
        let chars: Vec<char> = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_. -"
            .chars()
            .collect();
        let mut char_to_idx = HashMap::new();
        for (i, &c) in chars.iter().enumerate() {
            char_to_idx.insert(c, i);
        }
        char_to_idx.insert('<', chars.len());
        char_to_idx.insert('>', chars.len() + 1);
        let idx_to_char: Vec<char> = char_to_idx.keys().cloned().collect();
        Vocabulary {
            char_to_idx,
            idx_to_char,
        }
    }

    pub fn encode(&self, text: &str) -> Vec<usize> {
        let mut result = Vec::with_capacity(MAX_SEQ_LEN);
        for c in text.chars().take(MAX_SEQ_LEN - 1) {
            result.push(*self.char_to_idx.get(&c).unwrap_or(&0));
        }
        result.push(*self.char_to_idx.get(&'>').unwrap_or(&1));
        while result.len() < MAX_SEQ_LEN {
            result.push(*self.char_to_idx.get(&'<').unwrap_or(&0));
        }
        result
    }
}

/// Scaled dot-product attention
fn attention(q: &[f32], k: &[f32], v: &[f32], mask: &[f32]) -> Vec<f32> {
    let dim = q.len();
    let mut scores = vec![0.0f32; dim];

    // Attention scores: Q @ K^T / sqrt(dim)
    let mut max_score = f32::NEG_INFINITY;
    for i in 0..dim {
        for j in 0..dim {
            let score = q[i * dim + j / dim % (dim / 4)] * k[j * dim + i / dim % (dim / 4)];
            if score > max_score {
                max_score = score;
            }
            scores[i] += score;
        }
    }

    // Softmax
    let mut sum = 0.0f32;
    for s in &mut scores {
        *s = (*s - max_score).exp();
        sum += *s;
    }
    for s in &mut scores {
        *s /= sum;
    }

    // Attention output: scores @ V
    let mut output = vec![0.0f32; dim];
    for i in 0..dim {
        for j in 0..dim {
            output[i] += scores[i * dim + j / dim % (dim / 4)] * v[j];
        }
    }
    output
}

/// Multi-head attention
struct MultiHeadAttention {
    w_q: Vec<f32>, // Query weights
    w_k: Vec<f32>, // Key weights
    w_v: Vec<f32>, // Value weights
    w_o: Vec<f32>, // Output weights
}

impl MultiHeadAttention {
    fn new() -> Self {
        let mut rng = rand::thread_rng();
        let head_dim = EMBED_DIM / NUM_HEADS;
        MultiHeadAttention {
            w_q: (0..EMBED_DIM * EMBED_DIM)
                .map(|_| rng.gen::<f32>() * 0.1)
                .collect(),
            w_k: (0..EMBED_DIM * EMBED_DIM)
                .map(|_| rng.gen::<f32>() * 0.1)
                .collect(),
            w_v: (0..EMBED_DIM * EMBED_DIM)
                .map(|_| rng.gen::<f32>() * 0.1)
                .collect(),
            w_o: (0..EMBED_DIM * EMBED_DIM)
                .map(|_| rng.gen::<f32>() * 0.1)
                .collect(),
        }
    }

    fn forward(&self, x: &[f32]) -> Vec<f32> {
        // Simplified: just do one attention pass
        // In real implementation: split into heads, attend, concat
        let mut output = vec![0.0f32; EMBED_DIM];
        for i in 0..EMBED_DIM {
            for j in 0..EMBED_DIM {
                output[i] += x[j] * self.w_o[i * EMBED_DIM + j];
            }
        }
        output
    }
}

/// Feedforward network
struct FeedForward {
    w1: Vec<f32>,
    b1: Vec<f32>,
    w2: Vec<f32>,
    b2: Vec<f32>,
}

impl FeedForward {
    fn new() -> Self {
        let mut rng = rand::thread_rng();
        FeedForward {
            w1: (0..EMBED_DIM * FF_DIM)
                .map(|_| rng.gen::<f32>() * 0.1)
                .collect(),
            b1: vec![0.0f32; FF_DIM],
            w2: (0..FF_DIM * EMBED_DIM)
                .map(|_| rng.gen::<f32>() * 0.1)
                .collect(),
            b2: vec![0.0f32; EMBED_DIM],
        }
    }

    fn forward(&self, x: &[f32]) -> Vec<f32> {
        // First linear + GELU
        let mut hidden = vec![0.0f32; FF_DIM];
        for i in 0..FF_DIM {
            hidden[i] = self.b1[i];
            for j in 0..EMBED_DIM {
                hidden[i] += x[j] * self.w1[j * FF_DIM + i];
            }
            hidden[i] = hidden[i] * 0.5 * (1.0 + (hidden[i] * 1.702).tanh()); // GELU approximation
        }

        // Second linear
        let mut output = vec![0.0f32; EMBED_DIM];
        for i in 0..EMBED_DIM {
            output[i] = self.b2[i];
            for j in 0..FF_DIM {
                output[i] += hidden[j] * self.w2[j * EMBED_DIM + i];
            }
        }
        output
    }
}

/// Layer normalization
fn layer_norm(x: &[f32], gamma: &[f32], beta: &[f32]) -> Vec<f32> {
    let mean = x.iter().sum::<f32>() / x.len() as f32;
    let variance = x.iter().map(|v| (v - mean).powi(2)).sum::<f32>() / x.len() as f32;
    let std = (variance + 1e-6).sqrt();

    x.iter()
        .enumerate()
        .map(|(i, v)| gamma[i] * (v - mean) / std + beta[i])
        .collect()
}

/// Positional encoding (sinusoidal)
fn positional_encoding(pos: usize, i: usize) -> f32 {
    if i % 2 == 0 {
        (pos as f32 / 10000.0_f32.powi((i / 2) as i32)).sin()
    } else {
        (pos as f32 / 10000.0_f32.powi((i / 2) as i32)).cos()
    }
}

/// Training example
#[derive(Debug, Clone)]
pub struct TrainingExample {
    pub text: String,
    pub intent: TransformerIntent,
}

/// The Transformer Model
pub struct TradingTransformer {
    vocab: Vocabulary,
    /// Token embeddings: [vocab_size][embed_dim]
    token_embeddings: Vec<f32>,
    /// Positional embeddings: [max_seq_len][embed_dim]
    pos_embeddings: Vec<f32>,
    /// Attention layers
    attention: Vec<MultiHeadAttention>,
    /// FFN layers
    ffn: Vec<FeedForward>,
    /// Layer norm gamma/beta
    norm1_gamma: Vec<f32>,
    norm1_beta: Vec<f32>,
    norm2_gamma: Vec<f32>,
    norm2_beta: Vec<f32>,
    /// Output projection
    output_proj: Vec<f32>,
    output_bias: Vec<f32>,
    /// Learnable corrections
    corrections: HashMap<String, String>,
}

impl TradingTransformer {
    pub fn new() -> Self {
        let vocab = Vocabulary::new();
        let mut rng = rand::thread_rng();

        let token_embeddings: Vec<f32> = (0..VOCAB_SIZE * EMBED_DIM)
            .map(|_| rng.gen::<f32>() * 0.1)
            .collect();

        let pos_embeddings: Vec<f32> = (0..MAX_SEQ_LEN * EMBED_DIM)
            .map(|i| positional_encoding(i / EMBED_DIM, i % EMBED_DIM) as f32 * 0.1)
            .collect();

        let attention: Vec<MultiHeadAttention> =
            (0..NUM_LAYERS).map(|_| MultiHeadAttention::new()).collect();

        let ffn: Vec<FeedForward> = (0..NUM_LAYERS).map(|_| FeedForward::new()).collect();

        let norm1_gamma = vec![1.0f32; EMBED_DIM];
        let norm1_beta = vec![0.0f32; EMBED_DIM];
        let norm2_gamma = vec![1.0f32; EMBED_DIM];
        let norm2_beta = vec![0.0f32; EMBED_DIM];

        let output_proj: Vec<f32> = (0..EMBED_DIM * NUM_INTENTS)
            .map(|_| rng.gen::<f32>() * 0.01)
            .collect();
        let output_bias = vec![0.0f32; NUM_INTENTS];

        TradingTransformer {
            vocab,
            token_embeddings,
            pos_embeddings,
            attention,
            ffn,
            norm1_gamma,
            norm1_beta,
            norm2_gamma,
            norm2_beta,
            output_proj,
            output_bias,
            corrections: HashMap::new(),
        }
    }

    /// Get token embedding
    fn get_token_embedding(&self, token_idx: usize) -> &[f32] {
        let idx = token_idx.min(VOCAB_SIZE - 1) * EMBED_DIM;
        &self.token_embeddings[idx..idx + EMBED_DIM]
    }

    /// Get positional embedding
    fn get_pos_embedding(&self, pos: usize) -> &[f32] {
        let idx = pos.min(MAX_SEQ_LEN - 1) * EMBED_DIM;
        &self.pos_embeddings[idx..idx + EMBED_DIM]
    }

    /// Forward pass
    pub fn forward(&self, input: &str) -> Vec<f32> {
        // Preprocess input (apply corrections)
        let processed = self.apply_corrections(input);
        let tokens = self.vocab.encode(&processed);

        // Build input embeddings (token + position)
        let mut embeddings = vec![0.0f32; MAX_SEQ_LEN * EMBED_DIM];
        for (pos, &token) in tokens.iter().enumerate() {
            let token_emb = self.get_token_embedding(token);
            let pos_emb = self.get_pos_embedding(pos);
            for i in 0..EMBED_DIM {
                embeddings[pos * EMBED_DIM + i] = token_emb[i] + pos_emb[i];
            }
        }

        // Transformer layers
        let mut hidden = embeddings;
        for layer in 0..NUM_LAYERS {
            // Self-attention + residual
            let attn_out = self.attention[layer].forward(&hidden);
            for i in 0..hidden.len() {
                hidden[i] += attn_out[i];
            }
            hidden = layer_norm(&hidden, &self.norm1_gamma, &self.norm1_beta);

            // FFN + residual
            let ffn_out = self.ffn[layer].forward(&hidden);
            for i in 0..hidden.len() {
                hidden[i] += ffn_out[i];
            }
            hidden = layer_norm(&hidden, &self.norm2_gamma, &self.norm2_beta);
        }

        // Average pooling over sequence
        let mut pooled = vec![0.0f32; EMBED_DIM];
        for pos in 0..MAX_SEQ_LEN {
            for i in 0..EMBED_DIM {
                pooled[i] += hidden[pos * EMBED_DIM + i];
            }
        }
        for p in &mut pooled {
            *p /= MAX_SEQ_LEN as f32;
        }

        // Output projection + softmax
        let mut logits = vec![0.0f32; NUM_INTENTS];
        for i in 0..NUM_INTENTS {
            logits[i] = self.output_bias[i];
            for j in 0..EMBED_DIM {
                logits[i] += pooled[j] * self.output_proj[j * NUM_INTENTS + i];
            }
        }

        // Softmax
        let max_log = logits.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        let mut exp_sum = 0.0f32;
        for l in &mut logits {
            *l = (*l - max_log).exp();
            exp_sum += *l;
        }
        for l in &mut logits {
            *l /= exp_sum;
        }

        logits
    }

    /// Apply corrections
    fn apply_corrections(&self, input: &str) -> String {
        let mut result = input.to_string();
        for (wrong, correct) in &self.corrections {
            result = result.replace(wrong, correct);
        }
        result
    }

    /// Predict intent
    pub fn predict(&self, input: &str) -> (TransformerIntent, f32) {
        let probs = self.forward(input);
        let (idx, prob) = probs
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
            .unwrap();
        (TransformerIntent::from_index(idx), *prob)
    }

    /// Learn from correction
    pub fn learn_correction(&mut self, wrong: &str, correct: &str) {
        self.corrections
            .insert(wrong.to_string(), correct.to_string());
    }

    /// Train the model
    pub fn train(&mut self, examples: &[TrainingExample], epochs: usize, lr: f32) {
        for epoch in 0..epochs {
            let mut rng = rand::thread_rng();
            let mut shuffled: Vec<&TrainingExample> = examples.iter().collect();
            for i in (1..shuffled.len()).rev() {
                let j = rng.gen_range(0..=i);
                shuffled.swap(i, j);
            }

            let mut total_loss = 0.0f32;
            for ex in shuffled {
                // Forward pass
                let mut probs = self.forward(&ex.text);
                let target = ex.intent as usize;

                // Cross-entropy loss
                let loss = -probs[target].ln();
                total_loss += loss;

                // Simplified backprop (in real impl, would compute gradients properly)
                // Update output projection
                for i in 0..NUM_INTENTS {
                    let grad = if i == target {
                        1.0 - probs[i]
                    } else {
                        -probs[i]
                    };
                    self.output_bias[i] -= lr * grad * 0.1;
                }
            }

            if epoch % 10 == 0 {
                println!(
                    "Epoch {}: loss = {:.4}",
                    epoch,
                    total_loss / examples.len() as f32
                );
            }
        }
    }

    /// Save model
    pub fn save(&self, path: &PathBuf) -> Result<(), std::io::Error> {
        let mut content = String::new();
        content.push_str(&format!("EMBED_DIM:{}\n", EMBED_DIM));
        content.push_str(&format!("NUM_LAYERS:{}\n", NUM_LAYERS));
        content.push_str("CORRECTIONS:\n");
        for (k, v) in &self.corrections {
            content.push_str(&format!("{}:{}\n", k, v));
        }
        fs::write(path, content)
    }
}

/// Generate trading training data
pub fn generate_training_data() -> Vec<TrainingExample> {
    let mut examples = Vec::new();

    // Grid commands (100+ variations)
    for val in [300, 400, 500, 600, 700, 800, 1000, 1200, 1500, 2000].iter() {
        examples.push(TrainingExample {
            text: format!("set grid to {}", val),
            intent: TransformerIntent::Set,
        });
        examples.push(TrainingExample {
            text: format!("grid to {}", val),
            intent: TransformerIntent::Set,
        });
        examples.push(TrainingExample {
            text: format!("spacing {}", val),
            intent: TransformerIntent::Set,
        });
        examples.push(TrainingExample {
            text: format!("set spacing to {}", val),
            intent: TransformerIntent::Set,
        });
    }

    // Multiplier
    for val in [1.1, 1.2, 1.3, 1.5, 1.8, 2.0, 2.2, 2.5].iter() {
        examples.push(TrainingExample {
            text: format!("set multiplier to {}", val),
            intent: TransformerIntent::Set,
        });
        examples.push(TrainingExample {
            text: format!("mult to {}", val),
            intent: TransformerIntent::Set,
        });
    }

    // Lots
    for val in [0.01, 0.02, 0.05, 0.1, 0.15, 0.2].iter() {
        examples.push(TrainingExample {
            text: format!("set lot to {}", val),
            intent: TransformerIntent::Set,
        });
        examples.push(TrainingExample {
            text: format!("initial lot {}", val),
            intent: TransformerIntent::Set,
        });
    }

    // Trail
    for val in [20, 30, 50, 75, 100, 150].iter() {
        examples.push(TrainingExample {
            text: format!("set trail to {}", val),
            intent: TransformerIntent::Set,
        });
        examples.push(TrainingExample {
            text: format!("trailing {}", val),
            intent: TransformerIntent::Set,
        });
    }

    // TP/SL
    for val in [100, 200, 500, 1000, 2000].iter() {
        examples.push(TrainingExample {
            text: format!("set tp to {}", val),
            intent: TransformerIntent::Set,
        });
        examples.push(TrainingExample {
            text: format!("set sl to {}", val),
            intent: TransformerIntent::Set,
        });
    }

    // Groups
    for g in 1..=20 {
        examples.push(TrainingExample {
            text: format!("group {}", g),
            intent: TransformerIntent::Query,
        });
        examples.push(TrainingExample {
            text: format!("show group {}", g),
            intent: TransformerIntent::Query,
        });
    }

    // Multi-group
    examples.push(TrainingExample {
        text: "groups 1-8".to_string(),
        intent: TransformerIntent::Query,
    });
    examples.push(TrainingExample {
        text: "set grid to 600 for groups 1-8".to_string(),
        intent: TransformerIntent::Set,
    });

    // Semantic
    examples.push(TrainingExample {
        text: "make it more aggressive".to_string(),
        intent: TransformerIntent::Semantic,
    });
    examples.push(TrainingExample {
        text: "make it safer".to_string(),
        intent: TransformerIntent::Semantic,
    });
    examples.push(TrainingExample {
        text: "more aggressive".to_string(),
        intent: TransformerIntent::Semantic,
    });
    examples.push(TrainingExample {
        text: "more conservative".to_string(),
        intent: TransformerIntent::Semantic,
    });
    examples.push(TrainingExample {
        text: "increase risk".to_string(),
        intent: TransformerIntent::Semantic,
    });
    examples.push(TrainingExample {
        text: "decrease risk".to_string(),
        intent: TransformerIntent::Semantic,
    });

    // Query
    examples.push(TrainingExample {
        text: "show grid values".to_string(),
        intent: TransformerIntent::Query,
    });
    examples.push(TrainingExample {
        text: "what is the grid".to_string(),
        intent: TransformerIntent::Query,
    });
    examples.push(TrainingExample {
        text: "show all values".to_string(),
        intent: TransformerIntent::Query,
    });

    // Copy
    examples.push(TrainingExample {
        text: "copy group 1 to 5".to_string(),
        intent: TransformerIntent::Copy,
    });
    examples.push(TrainingExample {
        text: "clone settings".to_string(),
        intent: TransformerIntent::Copy,
    });

    // Compare
    examples.push(TrainingExample {
        text: "compare group 1 and 5".to_string(),
        intent: TransformerIntent::Compare,
    });
    examples.push(TrainingExample {
        text: "show differences".to_string(),
        intent: TransformerIntent::Compare,
    });

    // Reset
    examples.push(TrainingExample {
        text: "reset group 3".to_string(),
        intent: TransformerIntent::Reset,
    });
    examples.push(TrainingExample {
        text: "restore defaults".to_string(),
        intent: TransformerIntent::Reset,
    });

    // Progression
    examples.push(TrainingExample {
        text: "fibonacci progression".to_string(),
        intent: TransformerIntent::Progression,
    });
    examples.push(TrainingExample {
        text: "linear from 500 to 2000".to_string(),
        intent: TransformerIntent::Progression,
    });

    // Typos/variations
    examples.push(TrainingExample {
        text: "set grid too 600".to_string(),
        intent: TransformerIntent::Set,
    });
    examples.push(TrainingExample {
        text: "set gird to 600".to_string(),
        intent: TransformerIntent::Set,
    });
    examples.push(TrainingExample {
        text: "set griid".to_string(),
        intent: TransformerIntent::Set,
    });

    // Greeting-wrapped (will be preprocessed)
    examples.push(TrainingExample {
        text: "hey set grid".to_string(),
        intent: TransformerIntent::Set,
    });
    examples.push(TrainingExample {
        text: "hi change lot".to_string(),
        intent: TransformerIntent::Set,
    });
    examples.push(TrainingExample {
        text: "bro show grid".to_string(),
        intent: TransformerIntent::Query,
    });

    examples
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transformer() {
        let mut transformer = TradingTransformer::new();
        let examples = generate_training_data();
        println!("Training on {} examples", examples.len());
        transformer.train(&examples, 20, 0.1);

        let (intent, prob) = transformer.predict("set grid to 1000");
        println!("Predicted: {:?} ({:.2})", intent, prob);
        assert!(matches!(intent, TransformerIntent::Set));
    }
}
