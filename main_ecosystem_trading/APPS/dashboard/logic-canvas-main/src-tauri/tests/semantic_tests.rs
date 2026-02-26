// Semantic Engine Test Suite with insta snapshots
// Run: cargo insta test --accept
// Or:  cargo test --test semantic_tests

use app_lib::headless::{handle_message_headless, HeadlessResult};

// ============================================================================
// SEMANTIC SCALING TESTS
// ============================================================================

#[test]
fn test_30_percent_more_aggressive() {
    let result = handle_message_headless("make engine A 30% more aggressive");
    insta::assert_json_snapshot!(result, {
        ".input" => "[input]"
    });
}

#[test]
fn test_50_percent_more_aggressive() {
    let result = handle_message_headless("50% more aggressive for group 1");
    insta::assert_json_snapshot!(result);
}

#[test]
fn test_30_percent_safer() {
    let result = handle_message_headless("make it 30% safer");
    insta::assert_json_snapshot!(result);
}

#[test]
fn test_50_percent_more_conservative() {
    let result = handle_message_headless("50% more conservative for engine A");
    insta::assert_json_snapshot!(result);
}

// ============================================================================
// DOUBLING / HALVING TESTS
// ============================================================================

#[test]
fn test_double_lot() {
    let result = handle_message_headless("double the lot for group 1");
    insta::assert_json_snapshot!(result);
}

#[test]
fn test_double_grid() {
    let result = handle_message_headless("double the grid");
    insta::assert_json_snapshot!(result);
}

#[test]
fn test_double_multiplier() {
    let result = handle_message_headless("double the multiplier for power");
    insta::assert_json_snapshot!(result);
}

#[test]
fn test_half_lot() {
    let result = handle_message_headless("half the lot");
    insta::assert_json_snapshot!(result);
}

#[test]
fn test_halve_grid() {
    let result = handle_message_headless("halve the grid for group 1-5");
    insta::assert_json_snapshot!(result);
}

// ============================================================================
// PRESET TESTS
// ============================================================================

#[test]
fn test_make_aggressive() {
    let result = handle_message_headless("make it aggressive");
    insta::assert_json_snapshot!(result);
}

#[test]
fn test_go_aggressive() {
    let result = handle_message_headless("go aggressive for engine A");
    insta::assert_json_snapshot!(result);
}

#[test]
fn test_make_safe() {
    let result = handle_message_headless("make it safe");
    insta::assert_json_snapshot!(result);
}

#[test]
fn test_play_safe() {
    let result = handle_message_headless("play it safe for group 1");
    insta::assert_json_snapshot!(result);
}

#[test]
fn test_make_conservative() {
    let result = handle_message_headless("make it conservative");
    insta::assert_json_snapshot!(result);
}

// ============================================================================
// GRID ADJUSTMENT TESTS
// ============================================================================

#[test]
fn test_tighten_grid() {
    let result = handle_message_headless("tighten the grid");
    insta::assert_json_snapshot!(result);
}

#[test]
fn test_tighten_grid_by_200() {
    let result = handle_message_headless("tighten grid by 200");
    insta::assert_json_snapshot!(result);
}

// ============================================================================
// QUERY TESTS
// ============================================================================

#[test]
fn test_show_power_group_values() {
    let result = handle_message_headless("show me power group 1 values");
    insta::assert_json_snapshot!(result);
}

#[test]
fn test_show_grid_all_groups() {
    let result = handle_message_headless("show grid for all groups");
    insta::assert_json_snapshot!(result);
}

#[test]
fn test_find_groups_grid() {
    let result = handle_message_headless("find groups with grid > 500");
    insta::assert_json_snapshot!(result);
}

// ============================================================================
// SET COMMAND TESTS
// ============================================================================

#[test]
fn test_set_grid_600() {
    let result = handle_message_headless("set grid to 600 for group 1");
    insta::assert_json_snapshot!(result);
}

#[test]
fn test_set_lot_002() {
    let result = handle_message_headless("set lot to 0.02 for groups 1-8");
    insta::assert_json_snapshot!(result);
}

#[test]
fn test_set_multiplier() {
    let result = handle_message_headless("set multiplier to 1.5 for power");
    insta::assert_json_snapshot!(result);
}

// ============================================================================
// ENABLE/DISABLE TESTS
// ============================================================================

#[test]
fn test_enable_reverse() {
    let result = handle_message_headless("enable reverse for group 1");
    insta::assert_json_snapshot!(result);
}

#[test]
fn test_disable_hedge() {
    let result = handle_message_headless("disable hedge for all groups");
    insta::assert_json_snapshot!(result);
}

// ============================================================================
// EDGE CASE TESTS
// ============================================================================

#[test]
fn test_empty_input() {
    let result = handle_message_headless("");
    assert_eq!(result.status, "fail");
}

#[test]
fn test_gibberish_input() {
    let result = handle_message_headless("asdfghjkl xyz 123");
    assert_eq!(result.status, "fail");
}

#[test]
fn test_partial_command() {
    let result = handle_message_headless("set grid");
    // Should fail - no value specified
    insta::assert_json_snapshot!(result);
}

// ============================================================================
// BATCH TESTING HELPER
// ============================================================================

/// Run a batch of test cases and return pass/fail counts
fn run_batch(inputs: &[&str]) -> (usize, usize) {
    let mut pass = 0;
    let mut fail = 0;
    
    for input in inputs {
        let result = handle_message_headless(input);
        if result.status == "pass" {
            pass += 1;
        } else {
            fail += 1;
        }
    }
    
    (pass, fail)
}

#[test]
fn test_batch_semantic_commands() {
    let commands = vec![
        "30% more aggressive",
        "make it 50% safer",
        "double the lot",
        "half the grid",
        "make it aggressive",
        "go safe",
        "tighten grid by 100",
    ];
    
    let (pass, fail) = run_batch(&commands);
    assert!(pass >= 5, "Expected at least 5 passes, got {} (fail: {})", pass, fail);
}

#[test]
fn test_batch_query_commands() {
    let commands = vec![
        "show grid for group 1",
        "show power group 1 values",
        "find groups with lot > 0.01",
        "list all settings",
    ];
    
    let (pass, _fail) = run_batch(&commands);
    assert!(pass >= 2, "Expected at least 2 query passes");
}

#[test]
fn test_batch_set_commands() {
    let commands = vec![
        "set grid to 600 for group 1",
        "set lot to 0.02 for groups 1-5",
        "set multiplier to 1.5 for power",
        "enable reverse for group 1",
        "disable hedge for all",
    ];
    
    let (pass, _fail) = run_batch(&commands);
    assert!(pass >= 3, "Expected at least 3 set command passes");
}
