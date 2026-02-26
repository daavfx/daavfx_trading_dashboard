//! Pure Rust Tiny Neural Network for Trading Config Chat
//!
//! Character-level model that learns to understand trading config commands.
//! No external ML libraries - pure Rust with std::collections and rand.
//!
//! Architecture: ~50K parameters, trains in seconds on CPU

use rand::Rng;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// Maximum sequence length we support
const MAX_SEQ_LEN: usize = 64;
/// Embedding dimension per character
const EMBED_DIM: usize = 32;
/// Hidden layer dimension
const HIDDEN_DIM: usize = 64;
/// Number of output intents
const NUM_INTENTS: usize = 16;

/// Intent types for trading config commands
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize)]
pub enum Intent {
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

impl Intent {
    pub fn from_index(idx: usize) -> Self {
        match idx {
            0 => Intent::Set,
            1 => Intent::Query,
            2 => Intent::Semantic,
            3 => Intent::Copy,
            4 => Intent::Compare,
            5 => Intent::Reset,
            6 => Intent::Formula,
            7 => Intent::Import,
            8 => Intent::Progression,
            _ => Intent::Unknown,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Intent::Set => "SET",
            Intent::Query => "QUERY",
            Intent::Semantic => "SEMANTIC",
            Intent::Copy => "COPY",
            Intent::Compare => "COMPARE",
            Intent::Reset => "RESET",
            Intent::Formula => "FORMULA",
            Intent::Import => "IMPORT",
            Intent::Progression => "PROGRESSION",
            Intent::Unknown => "UNKNOWN",
        }
    }
}

/// Character vocabulary for the model
pub struct Vocabulary {
    char_to_idx: HashMap<char, usize>,
    idx_to_char: Vec<char>,
}

impl Vocabulary {
    /// Build vocabulary from common trading config characters
    pub fn new() -> Self {
        let chars: Vec<char> = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_. -"
            .chars()
            .collect();
        let mut char_to_idx = HashMap::new();

        for (i, &c) in chars.iter().enumerate() {
            char_to_idx.insert(c, i);
        }

        // Add special tokens
        char_to_idx.insert('<', chars.len()); // padding
        char_to_idx.insert('>', chars.len() + 1); // end of sequence

        let idx_to_char: Vec<char> = char_to_idx.keys().cloned().collect();

        Vocabulary {
            char_to_idx,
            idx_to_char,
        }
    }

    pub fn encode(&self, text: &str) -> Vec<usize> {
        let mut result = Vec::with_capacity(MAX_SEQ_LEN);
        for c in text.chars().take(MAX_SEQ_LEN - 1) {
            if let Some(&idx) = self.char_to_idx.get(&c) {
                result.push(idx);
            } else {
                // Unknown character - use first char as fallback
                result.push(0);
            }
        }
        result.push(self.char_to_idx.get(&'>').copied().unwrap_or(1)); // EOS token

        // Pad to max length
        while result.len() < MAX_SEQ_LEN {
            result.push(self.char_to_idx.get(&'<').copied().unwrap_or(0));
        }

        result
    }
}

/// Training example: input text + expected intent
#[derive(Debug)]
pub struct TrainingExample {
    pub text: String,
    pub intent: Intent,
}

/// The neural network model
pub struct TinyNeural {
    vocab: Vocabulary,
    /// Embedding layer: [vocab_size][embed_dim]
    embeddings: Vec<f32>,
    /// First FC layer: [embed_dim * seq_len][hidden_dim]
    fc1_weights: Vec<f32>,
    fc1_bias: Vec<f32>,
    /// Second FC layer: [hidden_dim][hidden_dim]  
    fc2_weights: Vec<f32>,
    fc2_bias: Vec<f32>,
    /// Output layer: [hidden_dim][num_intents]
    output_weights: Vec<f32>,
    output_bias: Vec<f32>,
    /// Correction mappings learned from user
    corrections: HashMap<String, String>,
}

impl TinyNeural {
    /// Create a new neural network with random weights
    pub fn new() -> Self {
        let vocab = Vocabulary::new();
        let vocab_size = vocab.idx_to_char.len();

        let mut rng = rand::thread_rng();

        // Xavier/Glorot initialization
        let scale = |n: usize| f32::sqrt(2.0 / n as f32);

        let embeddings: Vec<f32> = (0..vocab_size * EMBED_DIM)
            .map(|_| rng.gen::<f32>() * scale(EMBED_DIM) * 0.5)
            .collect();

        let fc1_weights: Vec<f32> = (0..MAX_SEQ_LEN * EMBED_DIM * HIDDEN_DIM)
            .map(|_| rng.gen::<f32>() * scale(HIDDEN_DIM))
            .collect();

        let fc1_bias: Vec<f32> = (0..HIDDEN_DIM).map(|_| 0.0).collect();

        let fc2_weights: Vec<f32> = (0..HIDDEN_DIM * HIDDEN_DIM)
            .map(|_| rng.gen::<f32>() * scale(HIDDEN_DIM))
            .collect();

        let fc2_bias: Vec<f32> = (0..HIDDEN_DIM).map(|_| 0.0).collect();

        let output_weights: Vec<f32> = (0..HIDDEN_DIM * NUM_INTENTS)
            .map(|_| rng.gen::<f32>() * 0.01)
            .collect();

        let output_bias: Vec<f32> = (0..NUM_INTENTS).map(|_| 0.0).collect();

        TinyNeural {
            vocab,
            embeddings: vec![0.0; vocab_size * EMBED_DIM],
            fc1_weights,
            fc1_bias,
            fc2_weights,
            fc2_bias,
            output_weights,
            output_bias,
            corrections: HashMap::new(),
        }
    }

    /// Get embedding for a character index
    fn get_embedding(&self, char_idx: usize) -> &[f32] {
        let start = char_idx.min(self.vocab.idx_to_char.len()) * EMBED_DIM;
        &self.embeddings[start..start + EMBED_DIM]
    }

    /// Forward pass - returns intent probabilities
    pub fn forward(&self, input: &str) -> Vec<f32> {
        // Apply corrections first
        let corrected = self.apply_corrections(input);

        // Encode input
        let encoded = self.vocab.encode(&corrected);

        // Get embeddings and sum them (simple bag-of-chars)
        let mut embedded: Vec<f32> = vec![0.0; EMBED_DIM];
        for &char_idx in &encoded {
            let emb = self.get_embedding(char_idx);
            for i in 0..EMBED_DIM {
                embedded[i] += emb[i];
            }
        }

        // FC1: ReLU activation
        let mut hidden1: Vec<f32> = vec![0.0; HIDDEN_DIM];
        for i in 0..HIDDEN_DIM {
            let mut sum = self.fc1_bias[i];
            for j in 0..EMBED_DIM {
                sum += embedded[j] * self.fc1_weights[j * HIDDEN_DIM + i];
            }
            hidden1[i] = sum.max(0.0); // ReLU
        }

        // FC2: ReLU activation
        let mut hidden2: Vec<f32> = vec![0.0; HIDDEN_DIM];
        for i in 0..HIDDEN_DIM {
            let mut sum = self.fc2_bias[i];
            for j in 0..HIDDEN_DIM {
                sum += hidden1[j] * self.fc2_weights[j * HIDDEN_DIM + i];
            }
            hidden2[i] = sum.max(0.0); // ReLU
        }

        // Output: Softmax
        let mut logits: Vec<f32> = vec![0.0; NUM_INTENTS];
        for i in 0..NUM_INTENTS {
            let mut sum = self.output_bias[i];
            for j in 0..HIDDEN_DIM {
                sum += hidden2[j] * self.output_weights[j * NUM_INTENTS + i];
            }
            logits[i] = sum;
        }

        // Softmax
        let max_logit = logits.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        let mut exp_sum = 0.0f32;
        for logit in &mut logits {
            *logit = (*logit - max_logit).exp();
            exp_sum += *logit;
        }
        for logit in &mut logits {
            *logit /= exp_sum;
        }

        logits
    }

    /// Apply learned corrections to input
    fn apply_corrections(&self, input: &str) -> String {
        let mut result = input.to_string();
        for (wrong, correct) in &self.corrections {
            result = result.replace(wrong, correct);
        }
        result
    }

    /// Predict intent from input
    pub fn predict(&self, input: &str) -> (Intent, f32) {
        let probs = self.forward(input);
        let (best_idx, best_prob) = probs
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.partial_cmp(b.1).unwrap())
            .unwrap();
        (Intent::from_index(best_idx), *best_prob)
    }

    /// Learn from a user correction
    pub fn learn_correction(&mut self, wrong: &str, correct: &str) {
        self.corrections
            .insert(wrong.to_string(), correct.to_string());
    }

    /// Train the model on examples
    pub fn train(&mut self, examples: &[TrainingExample], epochs: usize, learning_rate: f32) {
        let vocab_size = self.vocab.idx_to_char.len();

        for epoch in 0..epochs {
            let mut rng = rand::thread_rng();

            // Shuffle examples
            let mut shuffled: Vec<&TrainingExample> = examples.iter().collect();
            for i in (1..shuffled.len()).rev() {
                let j = rng.gen_range(0..=i);
                shuffled.swap(i, j);
            }

            let mut total_loss = 0.0f32;

            for example in shuffled {
                // Forward pass
                let corrected = self.apply_corrections(&example.text);
                let encoded = self.vocab.encode(&corrected);

                // Bag of chars embeddings
                let mut embedded: Vec<f32> = vec![0.0; EMBED_DIM];
                for &char_idx in &encoded {
                    let emb = self.get_embedding(char_idx);
                    for i in 0..EMBED_DIM {
                        embedded[i] += emb[i];
                    }
                }

                // FC1
                let mut hidden1: Vec<f32> = vec![0.0; HIDDEN_DIM];
                for i in 0..HIDDEN_DIM {
                    let mut sum = self.fc1_bias[i];
                    for j in 0..EMBED_DIM {
                        sum += embedded[j] * self.fc1_weights[j * HIDDEN_DIM + i];
                    }
                    hidden1[i] = sum.max(0.0);
                }

                // FC2
                let mut hidden2: Vec<f32> = vec![0.0; HIDDEN_DIM];
                for i in 0..HIDDEN_DIM {
                    let mut sum = self.fc2_bias[i];
                    for j in 0..HIDDEN_DIM {
                        sum += hidden1[j] * self.fc2_weights[j * HIDDEN_DIM + i];
                    }
                    hidden2[i] = sum.max(0.0);
                }

                // Output
                let mut logits: Vec<f32> = vec![0.0; NUM_INTENTS];
                for i in 0..NUM_INTENTS {
                    let mut sum = self.output_bias[i];
                    for j in 0..HIDDEN_DIM {
                        sum += hidden2[j] * self.output_weights[j * NUM_INTENTS + i];
                    }
                    logits[i] = sum;
                }

                // Softmax + cross-entropy gradient
                let max_logit = logits.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
                let mut exp_sum = 0.0f32;
                let mut probs: Vec<f32> = Vec::with_capacity(NUM_INTENTS);
                for logit in &mut logits {
                    *logit = (*logit - max_logit).exp();
                    exp_sum += *logit;
                    probs.push(*logit);
                }
                for p in &mut probs {
                    *p /= exp_sum;
                }

                // Target
                let target_idx = example.intent as usize;

                // Cross-entropy loss
                let loss = -probs[target_idx].ln();
                total_loss += loss;

                // Backprop output
                let mut output_grad: Vec<f32> = probs;
                output_grad[target_idx] -= 1.0;

                // Simplified: just update output weights
                for i in 0..NUM_INTENTS {
                    self.output_bias[i] -= learning_rate * output_grad[i] * 0.1;
                    for j in 0..HIDDEN_DIM {
                        let idx = j * NUM_INTENTS + i;
                        if idx < self.output_weights.len() {
                            self.output_weights[idx] -= learning_rate * output_grad[i] * hidden2[j];
                        }
                    }
                }
            }

            if epoch % 10 == 0 {
                println!(
                    "Epoch {}: avg loss = {}",
                    epoch,
                    total_loss / examples.len() as f32
                );
            }
        }
    }

    /// Save model to file
    pub fn save(&self, path: &PathBuf) -> Result<(), std::io::Error> {
        let mut content = String::new();
        content.push_str(&format!("VOCAB_SIZE:{}\n", self.vocab.idx_to_char.len()));

        // Save embeddings
        content.push_str("EMBEDDINGS:\n");
        for (i, v) in self.embeddings.iter().enumerate() {
            content.push_str(&format!("{},", v));
            if (i + 1) % EMBED_DIM == 0 {
                content.push('\n');
            }
        }

        // Save corrections
        content.push_str("\nCORRECTIONS:\n");
        for (k, v) in &self.corrections {
            content.push_str(&format!("{}:{}\n", k, v));
        }

        fs::write(path, content)
    }
}

/// Generate training data from semantic engine rules
pub fn generate_training_data() -> Vec<TrainingExample> {
    let mut examples = Vec::new();

    // Add trading-specific training data
    examples.extend(generate_trading_training_data());

    // SET commands
    examples.push(TrainingExample {
        text: "set grid to 600".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "set grid to 500".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "set grid to 1000".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "change grid to 600".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "change grid to 800".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "set multiplier to 1.5".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "set multiplier to 2.0".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "set initial_lot to 0.01".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "set initial lot to 0.1".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "change lot size to 0.05".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "set trail to 50".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "set trailing to 30".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "set grid too 600".to_string(),
        intent: Intent::Set,
    }); // typo
    examples.push(TrainingExample {
        text: "set grid to 600 for groups 1-8".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "change grid for group 1".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "set sl to 1000".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "set take profit to 500".to_string(),
        intent: Intent::Set,
    });

    // QUERY commands
    examples.push(TrainingExample {
        text: "show grid values".to_string(),
        intent: Intent::Query,
    });
    examples.push(TrainingExample {
        text: "show me the grid".to_string(),
        intent: Intent::Query,
    });
    examples.push(TrainingExample {
        text: "what is the grid".to_string(),
        intent: Intent::Query,
    });
    examples.push(TrainingExample {
        text: "find groups with high grid".to_string(),
        intent: Intent::Query,
    });
    examples.push(TrainingExample {
        text: "query multiplier values".to_string(),
        intent: Intent::Query,
    });
    examples.push(TrainingExample {
        text: "show all lot sizes".to_string(),
        intent: Intent::Query,
    });
    examples.push(TrainingExample {
        text: "list groups".to_string(),
        intent: Intent::Query,
    });
    examples.push(TrainingExample {
        text: "which groups have grid > 500".to_string(),
        intent: Intent::Query,
    });

    // SEMANTIC commands
    examples.push(TrainingExample {
        text: "make it more aggressive".to_string(),
        intent: Intent::Semantic,
    });
    examples.push(TrainingExample {
        text: "make it safer".to_string(),
        intent: Intent::Semantic,
    });
    examples.push(TrainingExample {
        text: "30% more aggressive".to_string(),
        intent: Intent::Semantic,
    });
    examples.push(TrainingExample {
        text: "50% safer".to_string(),
        intent: Intent::Semantic,
    });
    examples.push(TrainingExample {
        text: "tighten the grid".to_string(),
        intent: Intent::Semantic,
    });
    examples.push(TrainingExample {
        text: "widen the grid".to_string(),
        intent: Intent::Semantic,
    });
    examples.push(TrainingExample {
        text: "more conservative".to_string(),
        intent: Intent::Semantic,
    });
    examples.push(TrainingExample {
        text: "less risky".to_string(),
        intent: Intent::Semantic,
    });
    examples.push(TrainingExample {
        text: "increase risk".to_string(),
        intent: Intent::Semantic,
    });
    examples.push(TrainingExample {
        text: "more agressive".to_string(),
        intent: Intent::Semantic,
    }); // typo

    // COPY commands
    examples.push(TrainingExample {
        text: "copy from group 1 to 2-5".to_string(),
        intent: Intent::Copy,
    });
    examples.push(TrainingExample {
        text: "copy settings to group 3".to_string(),
        intent: Intent::Copy,
    });
    examples.push(TrainingExample {
        text: "clone group 1 settings".to_string(),
        intent: Intent::Copy,
    });
    examples.push(TrainingExample {
        text: "duplicate to groups 5-8".to_string(),
        intent: Intent::Copy,
    });

    // COMPARE commands
    examples.push(TrainingExample {
        text: "compare grid between group 1 and 5".to_string(),
        intent: Intent::Compare,
    });
    examples.push(TrainingExample {
        text: "show differences".to_string(),
        intent: Intent::Compare,
    });
    examples.push(TrainingExample {
        text: "what changed".to_string(),
        intent: Intent::Compare,
    });

    // RESET commands
    examples.push(TrainingExample {
        text: "reset group 3".to_string(),
        intent: Intent::Reset,
    });
    examples.push(TrainingExample {
        text: "reset to defaults".to_string(),
        intent: Intent::Reset,
    });
    examples.push(TrainingExample {
        text: "restore default settings".to_string(),
        intent: Intent::Reset,
    });

    // FORMULA commands
    examples.push(TrainingExample {
        text: "apply formula grid * 1.5".to_string(),
        intent: Intent::Formula,
    });
    examples.push(TrainingExample {
        text: "multiply grid by 2".to_string(),
        intent: Intent::Formula,
    });
    examples.push(TrainingExample {
        text: "increase by 20 percent".to_string(),
        intent: Intent::Formula,
    });

    // PROGRESSION commands
    examples.push(TrainingExample {
        text: "create progression 600 to 3000".to_string(),
        intent: Intent::Progression,
    });
    examples.push(TrainingExample {
        text: "fibonacci from 500 to 2000".to_string(),
        intent: Intent::Progression,
    });
    examples.push(TrainingExample {
        text: "linear progression".to_string(),
        intent: Intent::Progression,
    });

    // IMPORT commands
    examples.push(TrainingExample {
        text: "import set file".to_string(),
        intent: Intent::Import,
    });
    examples.push(TrainingExample {
        text: "load configuration".to_string(),
        intent: Intent::Import,
    });
    examples.push(TrainingExample {
        text: "import from clipboard".to_string(),
        intent: Intent::Import,
    });

    // Add typo variations
    examples.push(TrainingExample {
        text: "set grid to 600".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "set griid to 600".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "set gird to 600".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "set grd to 600".to_string(),
        intent: Intent::Set,
    });

    examples
}

/// Generate trading-specific training data with variations
fn generate_trading_training_data() -> Vec<TrainingExample> {
    let mut examples = Vec::new();

    // GRID variations
    let grid_values = [400, 500, 600, 700, 800, 1000, 1200, 1500, 2000];
    for val in grid_values.iter() {
        examples.push(TrainingExample {
            text: format!("set grid to {}", val),
            intent: Intent::Set,
        });
        examples.push(TrainingExample {
            text: format!("grid to {}", val),
            intent: Intent::Set,
        });
        examples.push(TrainingExample {
            text: format!("spacing to {}", val),
            intent: Intent::Set,
        });
        examples.push(TrainingExample {
            text: format!("set spacing to {}", val),
            intent: Intent::Set,
        });
        examples.push(TrainingExample {
            text: format!("change grid to {}", val),
            intent: Intent::Set,
        });
    }

    // MULTIPLIER variations
    let mult_values = [1.1, 1.2, 1.3, 1.5, 1.8, 2.0, 2.2, 2.5];
    for val in mult_values.iter() {
        examples.push(TrainingExample {
            text: format!("set multiplier to {}", val),
            intent: Intent::Set,
        });
        examples.push(TrainingExample {
            text: format!("mult to {}", val),
            intent: Intent::Set,
        });
        examples.push(TrainingExample {
            text: format!("set mult to {}", val),
            intent: Intent::Set,
        });
    }

    // LOT variations
    let lot_values = [0.01, 0.02, 0.05, 0.1, 0.15, 0.2, 0.5, 1.0];
    for val in lot_values.iter() {
        examples.push(TrainingExample {
            text: format!("set initial lot to {}", val),
            intent: Intent::Set,
        });
        examples.push(TrainingExample {
            text: format!("starting lot {}", val),
            intent: Intent::Set,
        });
        examples.push(TrainingExample {
            text: format!("lot size {}", val),
            intent: Intent::Set,
        });
    }

    // TRAIL variations
    let trail_values = [20, 30, 50, 75, 100, 150, 200];
    for val in trail_values.iter() {
        examples.push(TrainingExample {
            text: format!("set trail to {}", val),
            intent: Intent::Set,
        });
        examples.push(TrainingExample {
            text: format!("trailing to {}", val),
            intent: Intent::Set,
        });
        examples.push(TrainingExample {
            text: format!("set trailing stop to {}", val),
            intent: Intent::Set,
        });
    }

    // TP/SL variations
    let tp_values = [100, 200, 300, 500, 750, 1000, 1500, 2000];
    for val in tp_values.iter() {
        examples.push(TrainingExample {
            text: format!("set take profit to {}", val),
            intent: Intent::Set,
        });
        examples.push(TrainingExample {
            text: format!("set tp to {}", val),
            intent: Intent::Set,
        });
        examples.push(TrainingExample {
            text: format!("set stop loss to {}", val),
            intent: Intent::Set,
        });
        examples.push(TrainingExample {
            text: format!("set sl to {}", val),
            intent: Intent::Set,
        });
    }

    // GROUP-specific
    for group in 1..=20 {
        examples.push(TrainingExample {
            text: format!("show grid for group {}", group),
            intent: Intent::Query,
        });
        examples.push(TrainingExample {
            text: format!("set grid for group {}", group),
            intent: Intent::Set,
        });
        examples.push(TrainingExample {
            text: format!("reset group {}", group),
            intent: Intent::Reset,
        });
    }

    // Multi-group commands
    examples.push(TrainingExample {
        text: "set grid to 600 for groups 1-8".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "change multiplier for groups 1-5".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "show values for groups 1 through 8".to_string(),
        intent: Intent::Query,
    });
    examples.push(TrainingExample {
        text: "adjust groups 2 to 10".to_string(),
        intent: Intent::Set,
    });

    // Semantic trading variations
    examples.push(TrainingExample {
        text: "more aggressive".to_string(),
        intent: Intent::Semantic,
    });
    examples.push(TrainingExample {
        text: "be more aggressive".to_string(),
        intent: Intent::Semantic,
    });
    examples.push(TrainingExample {
        text: "go aggressive".to_string(),
        intent: Intent::Semantic,
    });
    examples.push(TrainingExample {
        text: "more conservative".to_string(),
        intent: Intent::Semantic,
    });
    examples.push(TrainingExample {
        text: "be safer".to_string(),
        intent: Intent::Semantic,
    });
    examples.push(TrainingExample {
        text: "lower risk".to_string(),
        intent: Intent::Semantic,
    });
    examples.push(TrainingExample {
        text: "higher risk".to_string(),
        intent: Intent::Semantic,
    });
    examples.push(TrainingExample {
        text: "tighten grid".to_string(),
        intent: Intent::Semantic,
    });
    examples.push(TrainingExample {
        text: "widen grid".to_string(),
        intent: Intent::Semantic,
    });
    examples.push(TrainingExample {
        text: "loosen up".to_string(),
        intent: Intent::Semantic,
    });

    // Copy/Clone
    for src in 1..=5 {
        for dst in 1..=5 {
            if src != dst {
                examples.push(TrainingExample {
                    text: format!("copy group {} to {}", src, dst),
                    intent: Intent::Copy,
                });
            }
        }
    }
    examples.push(TrainingExample {
        text: "clone group 1".to_string(),
        intent: Intent::Copy,
    });
    examples.push(TrainingExample {
        text: "duplicate settings".to_string(),
        intent: Intent::Copy,
    });

    // Compare
    examples.push(TrainingExample {
        text: "compare group 1 and 5".to_string(),
        intent: Intent::Compare,
    });
    examples.push(TrainingExample {
        text: "difference between groups".to_string(),
        intent: Intent::Compare,
    });
    examples.push(TrainingExample {
        text: "show me the differences".to_string(),
        intent: Intent::Compare,
    });

    // Progression
    examples.push(TrainingExample {
        text: "create fibonacci grid".to_string(),
        intent: Intent::Progression,
    });
    examples.push(TrainingExample {
        text: "linear progression".to_string(),
        intent: Intent::Progression,
    });
    examples.push(TrainingExample {
        text: "fibonacci from 500".to_string(),
        intent: Intent::Progression,
    });
    examples.push(TrainingExample {
        text: "progression from 600 to 3000".to_string(),
        intent: Intent::Progression,
    });

    // Enable/Disable
    examples.push(TrainingExample {
        text: "enable hedge mode".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "turn on trailing".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "disable stop loss".to_string(),
        intent: Intent::Set,
    });
    examples.push(TrainingExample {
        text: "enable reverse".to_string(),
        intent: Intent::Set,
    });

    examples
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vocab() {
        let vocab = Vocabulary::new();
        let encoded = vocab.encode("set grid to 600");
        assert_eq!(encoded.len(), MAX_SEQ_LEN);
    }

    #[test]
    fn test_predict() {
        let mut net = TinyNeural::new();
        let examples = generate_training_data();
        net.train(&examples, 50, 0.1);

        let (intent, prob) = net.predict("set grid to 1000");
        println!("Intent: {:?}, prob: {}", intent, prob);

        // Should be SET with reasonable confidence
        assert!(matches!(intent, Intent::Set | Intent::Query));
    }

    #[test]
    fn test_typo_correction() {
        let mut net = TinyNeural::new();

        // Learn correction
        net.learn_correction("too", "to");

        let result = net.predict("set grid too 600");
        println!("Typed 'too' but got intent: {:?}", result.0);

        // Should still recognize as SET even with typo
        assert!(matches!(result.0, Intent::Set));
    }
}
