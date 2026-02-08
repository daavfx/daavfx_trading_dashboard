use clap::Parser;
use std::path::PathBuf;

use app_lib::mql_rust_compiler::MQLRustCompiler;

#[derive(Parser, Debug)]
struct Args {
    #[arg(long)]
    mt4: PathBuf,

    #[arg(long)]
    main: PathBuf,
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();

    let mut compiler = MQLRustCompiler::new(args.mt4.to_string_lossy().as_ref())?;

    let include_dir = args.mt4.join("Include");
    compiler.project.root_path = args.mt4.clone();
    compiler.project.main_files = vec![args.main];
    compiler.project.include_paths = if include_dir.exists() {
        vec![include_dir]
    } else {
        Vec::new()
    };

    let report = compiler.analyze_with_context()?;

    println!(
        "MQLCHECK|total_errors={}|critical_errors={}|warnings={}|analysis_ms={}",
        report.total_errors, report.critical_errors, report.warnings, report.analysis_time_ms
    );

    if report.critical_errors > 0 {
        for e in report.errors.iter().take(50) {
            println!("MQLCHECK_ERR|{}|{}:{}:{}", e.error_type, e.file, e.line, e.message);
        }
        std::process::exit(2);
    }

    Ok(())
}

