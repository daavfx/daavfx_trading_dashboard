"""Dashboard Export Validation Script - V17.04+ Parity Check

Validates that dashboard JSON exports match MT4/MT5 expected structure.
Checks all required fields including V17.04+ Reverse/Hedge and TrailStep.
"""
import json
import sys
import re
from pathlib import Path

# ===== MT4/MT5 VARIABLE NAMING PATTERNS =====
# These are the exact patterns expected by MT4/MT5

LOGIC_ABBREVIATIONS = {
    "Power": "P", "Repower": "R", "Scalper": "S", 
    "Stopper": "ST", "STO": "STO", "SCA": "SCA", "RPO": "RPO"
}

ENGINE_PREFIXES = {"A": "", "B": "B", "C": "C"}

# Required fields per logic (V17.04+)
REQUIRED_LOGIC_FIELDS = [
    # Base params
    "logic_name", "logic_id", "enabled",
    "initial_lot", "multiplier", "grid",
    "trail_method", "trail_value", "trail_start", "trail_step", "trail_step_method",
    "close_targets", "order_count_reference", "reset_lot_on_restart",
    # TPSL
    "use_tp", "tp_mode", "tp_value", "use_sl", "sl_mode", "sl_value",
    # V17.04+ Reverse/Hedge per-logic
    "reverse_enabled", "hedge_enabled", "reverse_scale", "hedge_scale",
    "reverse_reference", "hedge_reference",
    # V17.04+ Trail Step Advanced
    "trail_step_mode", "trail_step_cycle", "trail_step_balance",
    # Close Partial
    "close_partial", "close_partial_cycle", "close_partial_mode",
    "close_partial_balance", "close_partial_trail_step_mode",
]

# Required fields per group (V17.04+)
REQUIRED_GROUP_FIELDS = [
    "group_number", "enabled",
    "reverse_mode", "hedge_mode", "hedge_reference", "entry_delay_bars",
    "logics"
]

def get_suffix(engine_id: str, group: int, logic_name: str) -> str:
    """Generate MT4/MT5 variable suffix: e.g., P1, BP1, CP1"""
    prefix = ENGINE_PREFIXES.get(engine_id, "")
    logic = LOGIC_ABBREVIATIONS.get(logic_name, "P")
    return f"{prefix}{logic}{group}"

def get_short(engine_id: str, logic_name: str) -> str:
    """Generate short logic name: e.g., P, BP, CP"""
    prefix = ENGINE_PREFIXES.get(engine_id, "")
    logic = LOGIC_ABBREVIATIONS.get(logic_name, "P")
    return f"{prefix}{logic}"

def generate_expected_set_keys(engine_id: str, group: int, logic_name: str) -> list:
    """Generate all expected .set file variable names for a logic."""
    suffix = get_suffix(engine_id, group, logic_name)
    short = get_short(engine_id, logic_name)
    
    keys = [
        # Base params
        f"gInput_Initial_loT_{suffix}",
        f"gInput_Mult_{suffix}",
        f"gInput_Grid_{suffix}",
        f"gInput_Trail_{suffix}",
        f"gInput_TrailValue_{suffix}",
        f"gInput_Trail_Start_{suffix}",
        f"gInput_TrailStep_{suffix}",
        f"gInput_TrailStepMethod_{suffix}",
        # Trail Step Advanced (V17.04+)
        f"gInput_TrailStepMode_{suffix}",
        f"gInput_TrailStepCycle_{suffix}",
        f"gInput_TrailStepBalance_{suffix}",
        # Logic specific
        f"gInput_CloseTargets_{suffix}",
        f"gInput_{suffix}_OrderCountReference",
        f"gInput_ResetLotOnRestart_{suffix}",
        # TPSL (group-aware)
        f"gInput_G{group}_UseTP_{short}",
        f"gInput_G{group}_TP_Mode_{short}",
        f"gInput_G{group}_TP_Value_{short}",
        f"gInput_G{group}_UseSL_{short}",
        f"gInput_G{group}_SL_Mode_{short}",
        f"gInput_G{group}_SL_Value_{short}",
        # Reverse/Hedge per-logic (V17.04+)
        f"gInput_G{group}_{short}_ReverseEnabled",
        f"gInput_G{group}_{short}_HedgeEnabled",
        f"gInput_G{group}_Scale_{short}_Reverse",
        f"gInput_G{group}_Scale_{short}_Hedge",
        f"gInput_G{group}_{short}_ReverseReference",
        f"gInput_G{group}_{short}_HedgeReference",
        # Close Partial
        f"gInput_ClosePartial_{suffix}",
        f"gInput_ClosePartialCycle_{suffix}",
        f"gInput_ClosePartialMode_{suffix}",
        f"gInput_ClosePartialBalance_{suffix}",
        f"gInput_ClosePartialTrailStepMode_{suffix}",
    ]
    
    # Non-Power logics have extra fields
    if logic_name.lower() != "power":
        keys.append(f"gInput_StartLevel_{suffix}")
        keys.append(f"gInput_LastLot_{suffix}")
    
    # Group 1 has trigger fields
    if group == 1:
        keys.append(f"gInput_G1_TriggerType_{short}")
        keys.append(f"gInput_G1_TriggerBars_{short}")
        keys.append(f"gInput_G1_TriggerMinutes_{short}")
    
    return keys

def generate_group_level_keys(group: int) -> list:
    """Generate group-level variable names (V17.04+)."""
    return [
        f"gInput_Group{group}_ReverseMode",
        f"gInput_Group{group}_HedgeMode",
        f"gInput_Group{group}_HedgeReference",
        f"gInput_Group{group}_EntryDelayBars",
    ]

def validate_json_structure(data: dict) -> tuple:
    """Validate JSON structure has all required fields."""
    errors = []
    warnings = []
    
    engines = data.get("engines", [])
    if not engines:
        errors.append("No engines found in config")
        return errors, warnings
    
    expected_engines = ["A", "B", "C"]
    for engine in engines:
        engine_id = engine.get("engine_id")
        if engine_id not in expected_engines:
            warnings.append(f"Unexpected engine ID: {engine_id}")
        
        groups = engine.get("groups", [])
        if len(groups) != 20:
            warnings.append(f"Engine {engine_id} has {len(groups)} groups (expected 20)")
        
        for group in groups:
            g_num = group.get("group_number")
            
            # Check group-level fields
            for field in REQUIRED_GROUP_FIELDS:
                if field not in group:
                    errors.append(f"Engine {engine_id} Group {g_num}: Missing group field '{field}'")
            
            logics = group.get("logics", [])
            if len(logics) != 7:
                warnings.append(f"Engine {engine_id} Group {g_num} has {len(logics)} logics (expected 7)")
            
            for logic in logics:
                l_name = logic.get("logic_name", "Unknown")
                
                # Check required logic fields
                for field in REQUIRED_LOGIC_FIELDS:
                    if field not in logic:
                        errors.append(f"Engine {engine_id} Group {g_num} {l_name}: Missing field '{field}'")
                
                # Check non-Power specific fields
                if l_name.lower() != "power":
                    if "start_level" not in logic:
                        errors.append(f"Engine {engine_id} Group {g_num} {l_name}: Missing 'start_level' (non-Power)")
                    if "last_lot" not in logic:
                        errors.append(f"Engine {engine_id} Group {g_num} {l_name}: Missing 'last_lot' (non-Power)")
                
                # Check Group 1 trigger fields
                if g_num == 1:
                    if "trigger_type" not in logic:
                        errors.append(f"Engine {engine_id} Group 1 {l_name}: Missing 'trigger_type'")
                    if "trigger_bars" not in logic:
                        errors.append(f"Engine {engine_id} Group 1 {l_name}: Missing 'trigger_bars'")
                    if "trigger_minutes" not in logic:
                        errors.append(f"Engine {engine_id} Group 1 {l_name}: Missing 'trigger_minutes'")
    
    return errors, warnings

def parse_set_file(file_path: str) -> dict:
    """Parse .set file into key-value dict."""
    values = {}
    try:
        with open(file_path, 'rb') as f:
            content = f.read()
        
        # Handle UTF-16 LE
        if content.startswith(b'\xff\xfe'):
            text = content[2:].decode('utf-16-le')
        else:
            text = content.decode('utf-8')
        
        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith(';'):
                continue
            if '=' in line:
                key, value = line.split('=', 1)
                values[key.strip()] = value.strip()
    except Exception as e:
        print(f"Error parsing .set file: {e}")
    
    return values

def validate_set_file_parity(set_file: str, reference_json: str = None) -> tuple:
    """Validate .set file has all expected variable names."""
    errors = []
    warnings = []
    
    set_values = parse_set_file(set_file)
    if not set_values:
        errors.append(f"Failed to parse .set file: {set_file}")
        return errors, warnings
    
    # Check expected keys for all 3 engines x 20 groups x 7 logics
    for engine_id in ["A", "B", "C"]:
        for group in range(1, 21):
            # Group-level keys
            for key in generate_group_level_keys(group):
                if key not in set_values:
                    errors.append(f"Missing group key: {key}")
            
            # Logic-level keys
            for logic_name in ["Power", "Repower", "Scalper", "Stopper", "STO", "SCA", "RPO"]:
                expected_keys = generate_expected_set_keys(engine_id, group, logic_name)
                for key in expected_keys:
                    if key not in set_values:
                        errors.append(f"Missing logic key: {key}")
    
    return errors, warnings

def validate_export(file_path: str) -> bool:
    """Main validation function for JSON exports."""
    print(f"\n{'='*60}")
    print(f"Validating Dashboard Export: {file_path}")
    print(f"{'='*60}\n")
    
    try:
        with open(file_path, 'r') as f:
            data = json.load(f)
    except Exception as e:
        print(f"❌ Failed to load JSON: {e}")
        return False
    
    errors, warnings = validate_json_structure(data)
    
    # Print warnings
    if warnings:
        print(f"⚠️  {len(warnings)} Warnings:")
        for w in warnings[:10]:  # Show first 10
            print(f"   - {w}")
        if len(warnings) > 10:
            print(f"   ... and {len(warnings) - 10} more warnings")
        print()
    
    # Print errors
    if errors:
        print(f"❌ {len(errors)} Errors:")
        for e in errors[:20]:  # Show first 20
            print(f"   - {e}")
        if len(errors) > 20:
            print(f"   ... and {len(errors) - 20} more errors")
        print()
        print("❌ VALIDATION FAILED")
        return False
    
    # Summary
    engines = data.get("engines", [])
    total_logics = sum(
        len(group.get("logics", []))
        for engine in engines
        for group in engine.get("groups", [])
    )
    print(f"✅ Structure Valid")
    print(f"   - Engines: {len(engines)}")
    print(f"   - Groups per engine: {len(engines[0].get('groups', []))}")
    print(f"   - Total logics: {total_logics}")
    print(f"   - V17.04+ fields: ✅ Present")
    print()
    print("🎉 VALIDATION SUCCESS!")
    return True

def validate_set_parity(set_file: str) -> bool:
    """Validate .set file has all expected MT4/MT5 variable names."""
    print(f"\n{'='*60}")
    print(f"Validating .SET File Parity: {set_file}")
    print(f"{'='*60}\n")
    
    errors, warnings = validate_set_file_parity(set_file)
    
    if errors:
        print(f"❌ {len(errors)} Missing Variables:")
        for e in errors[:30]:  # Show first 30
            print(f"   - {e}")
        if len(errors) > 30:
            print(f"   ... and {len(errors) - 30} more missing")
        print()
        print("❌ .SET PARITY CHECK FAILED")
        return False
    
    print("✅ All expected MT4/MT5 variable names present")
    print("🎉 .SET PARITY CHECK PASSED!")
    return True

def print_expected_keys_sample():
    """Print sample of expected .set keys for manual verification."""
    print("\n" + "="*60)
    print("Expected .SET Variable Names (Sample - Engine A, Group 1, Power)")
    print("="*60 + "\n")
    
    keys = generate_expected_set_keys("A", 1, "Power")
    for key in keys:
        print(f"  {key}")
    
    print("\n" + "-"*40)
    print("Group-level keys (V17.04+):")
    for key in generate_group_level_keys(1):
        print(f"  {key}")

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Dashboard Export Validation")
    parser.add_argument("file", nargs="?", default="SAMPLE_FULL_EXPORT_TEST.json",
                        help="JSON or .set file to validate")
    parser.add_argument("--set", action="store_true", help="Validate .set file parity")
    parser.add_argument("--sample", action="store_true", help="Print sample expected keys")
    
    args = parser.parse_args()
    
    if args.sample:
        print_expected_keys_sample()
        sys.exit(0)
    
    if args.set or args.file.endswith(".set"):
        success = validate_set_parity(args.file)
    else:
        success = validate_export(args.file)
    
    sys.exit(0 if success else 1)
