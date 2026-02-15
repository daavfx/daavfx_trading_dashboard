// MQL Rust Compiler - Advanced pre-compilation validation and error detection
// Provides faster feedback than MetaEditor with intelligent error resolution
// Integrated with DAAVFX Dashboard for real-time validation

use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use regex::Regex;
use serde::{Deserialize, Serialize};
use notify::{Watcher, RecursiveMode, Event};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MQLProject {
    pub root_path: PathBuf,
    pub main_files: Vec<PathBuf>,
    pub include_paths: Vec<PathBuf>,
    pub dependencies: HashMap<String, Vec<String>>,
}

#[derive(Debug, Clone)]
pub struct MQLSymbol {
    pub name: String,
    pub symbol_type: SymbolType,
    pub file: String,
    pub line: usize,
    pub scope: String,
}

#[derive(Debug, Clone)]
pub enum SymbolType {
    Variable,
    Function,
    Macro,
    Enum,
    Struct,
    Include,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompilationError {
    pub error_type: String,
    pub message: String,
    pub file: String,
    pub line: usize,
    pub column: usize,
    pub severity: ErrorSeverity,
    pub suggested_fix: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ErrorSeverity {
    Error,
    Warning,
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationReport {
    pub timestamp: u64,
    pub total_errors: usize,
    pub critical_errors: usize,
    pub warnings: usize,
    pub analysis_time_ms: u64,
    pub error_by_type: HashMap<String, usize>,
    pub error_by_file: HashMap<String, usize>,
    pub errors: Vec<CompilationError>,
    pub suggestions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DependencyIssue {
    pub issue_type: String,
    pub file: String,
    pub dependency: String,
    pub severity: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceWarning {
    pub warning_type: String,
    pub file: String,
    pub line: usize,
    pub description: String,
    pub impact: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrecompilationResult {
    pub validation_report: ValidationReport,
    pub dependency_issues: Vec<DependencyIssue>,
    pub performance_warnings: Vec<PerformanceWarning>,
    pub auto_fixes: HashMap<String, String>,
    pub pipeline_success: bool,
    pub recommendations: Vec<String>,
}

#[derive(Debug)]
pub struct MQLRustCompiler {
    pub project: MQLProject,
    symbol_table: HashMap<String, MQLSymbol>,
    include_cache: HashMap<String, String>,
    error_patterns: Vec<ErrorPattern>,
    file_watchers: HashMap<String, Arc<Mutex<Option<notify::RecommendedWatcher>>>>,
    last_validation: Arc<Mutex<Option<SystemTime>>>,
    validation_cache: Arc<Mutex<HashMap<String, Vec<CompilationError>>>>,
}

#[derive(Debug, Clone)]
pub struct ErrorPattern {
    pub pattern: Regex,
    pub error_type: String,
    pub fix_template: Option<String>,
}

impl MQLRustCompiler {
    pub fn new(project_root: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let project = Self::discover_project(project_root)?;
        let mut compiler = Self {
            project,
            symbol_table: HashMap::new(),
            include_cache: HashMap::new(),
            error_patterns: Vec::new(),
            file_watchers: HashMap::new(),
            last_validation: Arc::new(Mutex::new(None)),
            validation_cache: Arc::new(Mutex::new(HashMap::new())),
        };
        
        compiler.initialize_error_patterns();
        Ok(compiler)
    }

    /// Create a new compiler instance for dashboard integration
    pub fn new_for_dashboard(mt4_path: &str, mt5_path: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let mut project = MQLProject {
            root_path: PathBuf::from("."),
            main_files: Vec::new(),
            include_paths: Vec::new(),
            dependencies: HashMap::new(),
        };

        // Add MT4 files if path exists
        if !mt4_path.is_empty() && Path::new(mt4_path).exists() {
            let mt4_main = PathBuf::from(mt4_path).join("V4 DAAVILEFX 17.06.01_MASTER.mq4");
            if mt4_main.exists() {
                project.main_files.push(mt4_main);
            }
            let mt4_include = PathBuf::from(mt4_path).join("Include");
            if mt4_include.exists() {
                project.include_paths.push(mt4_include);
            }
        }

        // Add MT5 files if path exists
        if !mt5_path.is_empty() && Path::new(mt5_path).exists() {
            let mt5_main = PathBuf::from(mt5_path).join("V5 DAAVILEFX 17.06.01_MASTER.mq5");
            if mt5_main.exists() {
                project.main_files.push(mt5_main);
            }
            let mt5_include = PathBuf::from(mt5_path).join("Include");
            if mt5_include.exists() {
                project.include_paths.push(mt5_include);
            }
        }

        let mut compiler = Self {
            project,
            symbol_table: HashMap::new(),
            include_cache: HashMap::new(),
            error_patterns: Vec::new(),
            file_watchers: HashMap::new(),
            last_validation: Arc::new(Mutex::new(None)),
            validation_cache: Arc::new(Mutex::new(HashMap::new())),
        };
        
        compiler.initialize_error_patterns();
        Ok(compiler)
    }

    fn discover_project(root: &str) -> Result<MQLProject, Box<dyn std::error::Error>> {
        let root_path = PathBuf::from(root);
        let mut main_files = Vec::new();
        let mut include_paths = Vec::new();

        // Find main MQL files (.mq4, .mq5)
        if root_path.exists() {
            for entry in fs::read_dir(&root_path)? {
                let entry = entry?;
                let path = entry.path();
                if let Some(ext) = path.extension() {
                    if ext == "mq4" || ext == "mq5" {
                        main_files.push(path);
                    }
                }
            }

            // Find include directories
            let include_dir = root_path.join("Include");
            if include_dir.exists() {
                include_paths.push(include_dir);
            }
        }

        Ok(MQLProject {
            root_path,
            main_files,
            include_paths,
            dependencies: HashMap::new(),
        })
    }

    fn initialize_error_patterns(&mut self) {
        // Undeclared identifier pattern
        self.error_patterns.push(ErrorPattern {
            pattern: Regex::new(r"'([^']+)' - undeclared identifier").unwrap(),
            error_type: "undeclared_identifier".to_string(),
            fix_template: Some("int {name} = 0; // Auto-generated variable".to_string()),
        });

        // Macro redefinition pattern
        self.error_patterns.push(ErrorPattern {
            pattern: Regex::new(r"macro '([^']+)' redefinition").unwrap(),
            error_type: "macro_redefinition".to_string(),
            fix_template: Some("#ifndef {name}_DEFINED\n#define {name}_DEFINED\n#define {name} {value}\n#endif".to_string()),
        });

        // Variable already defined pattern
        self.error_patterns.push(ErrorPattern {
            pattern: Regex::new(r"variable '([^']+)' already defined").unwrap(),
            error_type: "duplicate_variable".to_string(),
            fix_template: Some("// Remove duplicate declaration of {name}".to_string()),
        });
    }

    pub fn analyze_project(&mut self) -> Result<Vec<CompilationError>, Box<dyn std::error::Error>> {
        let mut errors = Vec::new();

        // Phase 1: Build symbol table
        self.build_symbol_table()?;

        // Phase 2: Analyze dependencies
        self.analyze_dependencies()?;

        // Phase 3: Detect errors
        errors.extend(self.detect_undeclared_identifiers()?);
        errors.extend(self.detect_duplicate_definitions()?);
        errors.extend(self.detect_circular_dependencies()?);
        errors.extend(self.detect_macro_conflicts()?);

        Ok(errors)
    }

    fn build_symbol_table(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        for main_file in &self.project.main_files.clone() {
            self.parse_file(main_file)?;
        }

        for include_path in &self.project.include_paths.clone() {
            self.parse_includes(include_path)?;
        }

        Ok(())
    }

    fn parse_file(&mut self, file_path: &Path) -> Result<(), Box<dyn std::error::Error>> {
        let content = fs::read_to_string(file_path)?;
        let file_str = file_path.to_string_lossy().to_string();

        // Parse variable declarations
        let var_regex = Regex::new(r"(?m)^(?:extern\s+|static\s+)?(?:const\s+)?(\w+)\s+(\w+)(?:\s*=\s*[^;]+)?;")?;
        for (line_num, line) in content.lines().enumerate() {
            if let Some(caps) = var_regex.captures(line) {
                let _var_type = caps.get(1).unwrap().as_str();
                let var_name = caps.get(2).unwrap().as_str();
                
                self.symbol_table.insert(var_name.to_string(), MQLSymbol {
                    name: var_name.to_string(),
                    symbol_type: SymbolType::Variable,
                    file: file_str.clone(),
                    line: line_num + 1,
                    scope: "global".to_string(),
                });
            }
        }

        // Parse function declarations
        let func_regex = Regex::new(r"(?m)^(?:static\s+)?(\w+)\s+(\w+)\s*\([^)]*\)")?;
        for (line_num, line) in content.lines().enumerate() {
            if let Some(caps) = func_regex.captures(line) {
                let _return_type = caps.get(1).unwrap().as_str();
                let func_name = caps.get(2).unwrap().as_str();
                
                self.symbol_table.insert(func_name.to_string(), MQLSymbol {
                    name: func_name.to_string(),
                    symbol_type: SymbolType::Function,
                    file: file_str.clone(),
                    line: line_num + 1,
                    scope: "global".to_string(),
                });
            }
        }

        // Parse macro definitions
        let macro_regex = Regex::new(r"(?m)^#define\s+(\w+)")?;
        for (line_num, line) in content.lines().enumerate() {
            if let Some(caps) = macro_regex.captures(line) {
                let macro_name = caps.get(1).unwrap().as_str();
                
                self.symbol_table.insert(macro_name.to_string(), MQLSymbol {
                    name: macro_name.to_string(),
                    symbol_type: SymbolType::Macro,
                    file: file_str.clone(),
                    line: line_num + 1,
                    scope: "global".to_string(),
                });
            }
        }

        Ok(())
    }

    fn parse_includes(&mut self, include_path: &Path) -> Result<(), Box<dyn std::error::Error>> {
        for entry in fs::read_dir(include_path)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext == "mqh" {
                        self.parse_file(&path)?;
                    }
                }
            } else if path.is_dir() {
                self.parse_includes(&path)?;
            }
        }
        Ok(())
    }

    fn analyze_dependencies(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        // Build dependency graph from #include statements
        for main_file in &self.project.main_files.clone() {
            let deps = self.extract_dependencies(main_file)?;
            let file_key = main_file.to_string_lossy().to_string();
            self.project.dependencies.insert(file_key, deps);
        }
        Ok(())
    }

    fn extract_dependencies(&self, file_path: &Path) -> Result<Vec<String>, Box<dyn std::error::Error>> {
        let content = fs::read_to_string(file_path)?;
        let include_regex = Regex::new(r#"#include\s*["<]([^">]+)[">]"#)?;
        
        let mut dependencies = Vec::new();
        for caps in include_regex.captures_iter(&content) {
            let include_file = caps.get(1).unwrap().as_str();
            dependencies.push(include_file.to_string());
        }
        
        Ok(dependencies)
    }

    fn detect_undeclared_identifiers(&self) -> Result<Vec<CompilationError>, Box<dyn std::error::Error>> {
        let mut errors = Vec::new();
        
        // Check for gRuntime_G*_TriggerType_* pattern specifically
        let trigger_regex = Regex::new(r"gRuntime_G(\d+)_TriggerType_(\w+)")?;
        
        for main_file in &self.project.main_files {
            let content = fs::read_to_string(main_file)?;
            let file_str = main_file.to_string_lossy().to_string();
            
            for (line_num, line) in content.lines().enumerate() {
                for caps in trigger_regex.captures_iter(line) {
                    let var_name = caps.get(0).unwrap().as_str();
                    
                    if !self.symbol_table.contains_key(var_name) {
                        errors.push(CompilationError {
                            error_type: "undeclared_identifier".to_string(),
                            message: format!("'{}' - undeclared identifier", var_name),
                            file: file_str.clone(),
                            line: line_num + 1,
                            column: line.find(var_name).unwrap_or(0) + 1,
                            severity: ErrorSeverity::Error,
                            suggested_fix: Some(format!("int {} = 0;", var_name)),
                        });
                    }
                }
            }
        }
        
        Ok(errors)
    }

    fn detect_duplicate_definitions(&self) -> Result<Vec<CompilationError>, Box<dyn std::error::Error>> {
        let mut errors = Vec::new();
        let mut symbol_locations: HashMap<String, Vec<&MQLSymbol>> = HashMap::new();
        
        // Group symbols by name
        for symbol in self.symbol_table.values() {
            symbol_locations.entry(symbol.name.clone()).or_insert_with(Vec::new).push(symbol);
        }
        
        // Find duplicates
        for (name, locations) in symbol_locations {
            if locations.len() > 1 {
                for (i, symbol) in locations.iter().enumerate() {
                    if i > 0 { // Skip first occurrence
                        errors.push(CompilationError {
                            error_type: "duplicate_definition".to_string(),
                            message: format!("variable '{}' already defined", name),
                            file: symbol.file.clone(),
                            line: symbol.line,
                            column: 1,
                            severity: ErrorSeverity::Error,
                            suggested_fix: Some(format!("// Remove duplicate declaration of {}", name)),
                        });
                    }
                }
            }
        }
        
        Ok(errors)
    }

    fn detect_circular_dependencies(&self) -> Result<Vec<CompilationError>, Box<dyn std::error::Error>> {
        let mut errors = Vec::new();
        let mut visited = HashSet::new();
        let mut rec_stack = HashSet::new();
        
        for file in self.project.dependencies.keys() {
            if !visited.contains(file) {
                if self.has_cycle(file, &mut visited, &mut rec_stack)? {
                    errors.push(CompilationError {
                        error_type: "circular_dependency".to_string(),
                        message: format!("Circular dependency detected involving {}", file),
                        file: file.clone(),
                        line: 1,
                        column: 1,
                        severity: ErrorSeverity::Warning,
                        suggested_fix: Some("Review #include structure to eliminate circular references".to_string()),
                    });
                }
            }
        }
        
        Ok(errors)
    }

    fn has_cycle(&self, file: &str, visited: &mut HashSet<String>, rec_stack: &mut HashSet<String>) -> Result<bool, Box<dyn std::error::Error>> {
        visited.insert(file.to_string());
        rec_stack.insert(file.to_string());
        
        if let Some(deps) = self.project.dependencies.get(file) {
            for dep in deps {
                if !visited.contains(dep) {
                    if self.has_cycle(dep, visited, rec_stack)? {
                        return Ok(true);
                    }
                } else if rec_stack.contains(dep) {
                    return Ok(true);
                }
            }
        }
        
        rec_stack.remove(file);
        Ok(false)
    }

    fn detect_macro_conflicts(&self) -> Result<Vec<CompilationError>, Box<dyn std::error::Error>> {
        let mut errors = Vec::new();
        let builtin_macros = vec!["Ask", "Bid", "Digits", "Bars", "Point"];
        
        for symbol in self.symbol_table.values() {
            if matches!(symbol.symbol_type, SymbolType::Macro) {
                if builtin_macros.contains(&symbol.name.as_str()) {
                    errors.push(CompilationError {
                        error_type: "macro_redefinition".to_string(),
                        message: format!("macro '{}' redefinition", symbol.name),
                        file: symbol.file.clone(),
                        line: symbol.line,
                        column: 1,
                        severity: ErrorSeverity::Warning,
                        suggested_fix: Some(format!("#ifndef {}_DEFINED\n#define {}_DEFINED\n// Your macro definition here\n#endif", symbol.name, symbol.name)),
                    });
                }
            }
        }
        
        Ok(errors)
    }

    pub fn generate_fixes(&self, errors: &[CompilationError]) -> Result<HashMap<String, String>, Box<dyn std::error::Error>> {
        let mut fixes = HashMap::new();
        
        for error in errors {
            if let Some(fix) = &error.suggested_fix {
                let file_fixes = fixes.entry(error.file.clone()).or_insert_with(String::new);
                file_fixes.push_str(&format!("// Fix for line {}: {}\n{}\n\n", error.line, error.message, fix));
            }
        }
        
        Ok(fixes)
    }

    pub fn apply_fixes(&self, fixes: &HashMap<String, String>) -> Result<(), Box<dyn std::error::Error>> {
        for (file, fix_content) in fixes {
            let backup_file = format!("{}.backup", file);
            fs::copy(file, &backup_file)?;
            
            let original_content = fs::read_to_string(file)?;
            let new_content = format!("{}\n\n// Auto-generated fixes:\n{}", original_content, fix_content);
            
            fs::write(file, new_content)?;
            println!("✅ Applied fixes to: {}", file);
        }
        
        Ok(())
    }

    /// Real-time validation with caching
    pub fn validate_with_cache(&mut self, force_refresh: bool) -> Result<Vec<CompilationError>, Box<dyn std::error::Error>> {
        let now = SystemTime::now();
        let should_refresh = {
            let last_validation = self.last_validation.lock().unwrap();
            force_refresh || last_validation.is_none() || 
            last_validation.unwrap().elapsed().unwrap_or_default().as_secs() > 30
        };

        if should_refresh {
            let errors = self.analyze_project()?;
            
            // Update cache
            {
                let mut cache = self.validation_cache.lock().unwrap();
                cache.clear();
                for error in &errors {
                    cache.entry(error.file.clone()).or_insert_with(Vec::new).push(error.clone());
                }
            }
            
            *self.last_validation.lock().unwrap() = Some(now);
            Ok(errors)
        } else {
            // Return cached results
            let cache = self.validation_cache.lock().unwrap();
            let mut all_errors = Vec::new();
            for errors in cache.values() {
                all_errors.extend(errors.clone());
            }
            Ok(all_errors)
        }
    }

    /// Start file watching for real-time validation
    pub fn start_file_watching<F>(&mut self, callback: F) -> Result<(), Box<dyn std::error::Error>>
    where
        F: Fn(Vec<CompilationError>) + Send + 'static + Clone,
    {
        for main_file in &self.project.main_files.clone() {
            let file_path = main_file.to_string_lossy().to_string();
            
            if self.file_watchers.contains_key(&file_path) {
                continue; // Already watching
            }

            let callback_clone = callback.clone();
            let compiler_clone = self.clone_for_watching();
            
            let (tx, rx) = std::sync::mpsc::channel();
            
            let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
                if let Ok(_event) = res {
                    let _ = tx.send(());
                }
            })?;

            watcher.watch(main_file.as_path(), RecursiveMode::NonRecursive)?;
            
            let watcher_arc = Arc::new(Mutex::new(Some(watcher)));
            self.file_watchers.insert(file_path, watcher_arc);

            // Spawn validation thread
            std::thread::spawn(move || {
                while rx.recv().is_ok() {
                    std::thread::sleep(std::time::Duration::from_millis(500)); // Debounce
                    
                    if let Ok(errors) = compiler_clone.lock().unwrap().validate_with_cache(true) {
                        callback_clone(errors);
                    }
                }
            });
        }

        Ok(())
    }

    /// Clone for file watching (simplified version)
    fn clone_for_watching(&self) -> Arc<Mutex<Self>> {
        let clone = Self {
            project: self.project.clone(),
            symbol_table: self.symbol_table.clone(),
            include_cache: self.include_cache.clone(),
            error_patterns: self.error_patterns.clone(),
            file_watchers: HashMap::new(),
            last_validation: Arc::new(Mutex::new(None)),
            validation_cache: Arc::new(Mutex::new(HashMap::new())),
        };
        Arc::new(Mutex::new(clone))
    }

    /// Advanced error analysis with context
    pub fn analyze_with_context(&mut self) -> Result<ValidationReport, Box<dyn std::error::Error>> {
        let start_time = SystemTime::now();
        let errors = self.validate_with_cache(false)?;
        let analysis_time = start_time.elapsed().unwrap_or_default();

        let mut error_by_type: HashMap<String, usize> = HashMap::new();
        let mut error_by_file: HashMap<String, usize> = HashMap::new();
        let mut critical_errors = 0;
        let mut warnings = 0;

        for error in &errors {
            *error_by_type.entry(error.error_type.clone()).or_insert(0) += 1;
            *error_by_file.entry(error.file.clone()).or_insert(0) += 1;
            
            match error.severity {
                ErrorSeverity::Error => critical_errors += 1,
                ErrorSeverity::Warning => warnings += 1,
                _ => {}
            }
        }

        let suggestions = self.generate_suggestions(&errors);

        let report = ValidationReport {
            timestamp: SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs(),
            total_errors: errors.len(),
            critical_errors,
            warnings,
            analysis_time_ms: analysis_time.as_millis() as u64,
            error_by_type,
            error_by_file,
            errors,
            suggestions,
        };

        Ok(report)
    }

    /// Generate intelligent suggestions based on error patterns
    fn generate_suggestions(&self, errors: &[CompilationError]) -> Vec<String> {
        let mut suggestions = Vec::new();
        
        let undeclared_count = errors.iter().filter(|e| e.error_type == "undeclared_identifier").count();
        if undeclared_count > 50 {
            suggestions.push(format!(
                "High number of undeclared identifiers ({}). Consider running the trigger variable generator.",
                undeclared_count
            ));
        }

        let macro_conflicts = errors.iter().filter(|e| e.error_type == "macro_redefinition").count();
        if macro_conflicts > 0 {
            suggestions.push(format!(
                "Macro redefinition conflicts detected ({}). Consider using MT5 compatibility layer.",
                macro_conflicts
            ));
        }

        let duplicate_vars = errors.iter().filter(|e| e.error_type == "duplicate_variable").count();
        if duplicate_vars > 0 {
            suggestions.push(format!(
                "Duplicate variable definitions ({}). Review include structure and variable scoping.",
                duplicate_vars
            ));
        }

        if suggestions.is_empty() {
            suggestions.push("Code analysis complete. Consider running full compilation test.".to_string());
        }

        suggestions
    }

    /// Pre-compilation validation pipeline
    pub fn run_precompilation_pipeline(&mut self) -> Result<PrecompilationResult, Box<dyn std::error::Error>> {
        println!("🦀 Running MQL Pre-compilation Pipeline");
        
        // Phase 1: Syntax and structure validation
        println!("📊 Phase 1: Syntax validation...");
        let validation_report = self.analyze_with_context()?;
        
        // Phase 2: Dependency analysis
        println!("🔗 Phase 2: Dependency analysis...");
        let dependency_issues = self.analyze_dependencies_advanced()?;
        
        // Phase 3: Performance analysis
        println!("⚡ Phase 3: Performance analysis...");
        let performance_warnings = self.analyze_performance_patterns()?;
        
        // Phase 4: Generate fixes
        println!("🔧 Phase 4: Generating fixes...");
        let auto_fixes = self.generate_fixes(&validation_report.errors)?;
        
        let result = PrecompilationResult {
            validation_report,
            dependency_issues,
            performance_warnings,
            auto_fixes,
            pipeline_success: true,
            recommendations: self.generate_pipeline_recommendations(),
        };

        println!("✅ Pre-compilation pipeline complete!");
        Ok(result)
    }

    fn analyze_dependencies_advanced(&self) -> Result<Vec<DependencyIssue>, Box<dyn std::error::Error>> {
        let mut issues = Vec::new();
        
        // Check for circular dependencies
        for (file, deps) in &self.project.dependencies {
            for dep in deps {
                if self.has_circular_dependency(file, dep)? {
                    issues.push(DependencyIssue {
                        issue_type: "circular_dependency".to_string(),
                        file: file.clone(),
                        dependency: dep.clone(),
                        severity: "warning".to_string(),
                        description: format!("Circular dependency detected between {} and {}", file, dep),
                    });
                }
            }
        }
        
        Ok(issues)
    }

    fn has_circular_dependency(&self, file1: &str, file2: &str) -> Result<bool, Box<dyn std::error::Error>> {
        // Simplified circular dependency check
        if let Some(deps) = self.project.dependencies.get(file2) {
            return Ok(deps.contains(&file1.to_string()));
        }
        Ok(false)
    }

    fn analyze_performance_patterns(&self) -> Result<Vec<PerformanceWarning>, Box<dyn std::error::Error>> {
        let mut warnings = Vec::new();
        
        // Check for performance anti-patterns in MQL code
        for main_file in &self.project.main_files {
            let content = fs::read_to_string(main_file)?;
            
            // Check for excessive string operations in OnTick
            if content.contains("OnTick") && content.matches("StringConcatenate").count() > 5 {
                warnings.push(PerformanceWarning {
                    warning_type: "excessive_string_ops".to_string(),
                    file: main_file.to_string_lossy().to_string(),
                    line: 0,
                    description: "Excessive string operations detected in OnTick. Consider caching.".to_string(),
                    impact: "medium".to_string(),
                });
            }
            
            // Check for nested loops
            let loop_count = content.matches("for(").count() + content.matches("while(").count();
            if loop_count > 10 {
                warnings.push(PerformanceWarning {
                    warning_type: "complex_loops".to_string(),
                    file: main_file.to_string_lossy().to_string(),
                    line: 0,
                    description: format!("High loop complexity detected ({} loops). Review algorithm efficiency.", loop_count),
                    impact: "high".to_string(),
                });
            }
        }
        
        Ok(warnings)
    }

    fn generate_pipeline_recommendations(&self) -> Vec<String> {
        vec![
            "Run MetaEditor compilation test after applying fixes".to_string(),
            "Consider using Strategy Tester for validation".to_string(),
            "Monitor memory usage during backtesting".to_string(),
            "Test with different broker environments".to_string(),
        ]
    }
}