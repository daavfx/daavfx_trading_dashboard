"""Generate Complete V17.04+ Dashboard Export JSON for Validation

This script generates a complete JSON export with all:
- 3 Engines (A, B, C)
- 20 Groups per engine
- 7 Logics per group (Power, Repower, Scalper, Stopper, STO, SCA, RPO)
- All V17.04+ fields including Reverse/Hedge and TrailStep
"""

import json
from datetime import datetime

def generate_set_file(config, filename):
    """Generates a standard MT4/MT5 .set file for visible inputs (Group 1)."""
    
    # Enum Mappings (Best Guess / Standard defaults)
    TRAIL_METHODS = {"Points": 0, "Percent": 1, "AVG_Points": 2, "AVG_Percent": 3}
    TRAIL_STEP_METHODS = {"Step_Points": 0, "Step_Percent": 1, "Step_Pips": 2}
    TRAIL_STEP_MODES = {"TrailStepMode_Auto": 0, "TrailStepMode_Fixed": 1, "TrailStepMode_PerOrder": 2, "TrailStepMode_Disabled": 3}
    TPSL_MODES = {"TPSL_Points": 0, "TPSL_Percent": 1, "TPSL_Currency": 2}
    
    logic_suffix_map = {
        "Power": "P", "Repower": "R", "Scalper": "S", "Stopper": "ST", 
        "STO": "STO", "SCA": "SCA", "RPO": "RPO"
    }
    
    with open(filename, "w") as f:
        f.write("; DAAVFX V17.04 Generated Setfile\n")
        f.write("; Contains Group 1 (Visible) inputs + Global Settings\n")
        f.write("; For Hidden inputs (Groups 2-20), use the JSON config loader.\n\n")
        
        # General Settings
        gen = config["general"]
        f.write(f"MagicNumber={gen.get('magic_number', 777)}\n")
        f.write(f"MaxSlippage={gen.get('max_slippage_points', 30.0)}\n")
        f.write(f"EnableLogs={1 if gen.get('enable_logs', True) else 0}\n")
        f.write("\n")
        
        # Iterate Engines (Assuming Single Engine context for Setfile, or flattening)
        # Standard EA usually runs one Engine context or manages them internally.
        # We will generate inputs for Engine A (Primary)
        
        engine_a = next((e for e in config["engines"] if e["engine_id"] == "A"), None)
        if not engine_a:
            return

        # Group 1 Only
        group1 = next((g for g in engine_a["groups"] if g["group_number"] == 1), None)
        if group1:
            f.write("; ==== GROUP 1 ====\n")
            f.write("gInput_str1==== GROUP 1 ====\n")
            
            for logic in group1["logics"]:
                name = logic["logic_name"] # Power, Repower...
                suffix = logic_suffix_map.get(name, "Unknown")
                suffix_full = f"{suffix}1" # P1, R1...
                
                f.write(f"; --- {name} 1 ---\n")
                f.write(f"gInput_str1_{name}={name} 1\n")
                
                # Core Inputs
                if "initial_lot" in logic:
                    f.write(f"gInput_Initial_loT_{suffix_full}={logic['initial_lot']}\n")
                if "multiplier" in logic:
                    f.write(f"gInput_Mult_{suffix_full}={logic['multiplier']}\n")
                if "grid" in logic:
                    f.write(f"gInput_Grid_{suffix_full}={logic['grid']}\n")
                
                # Trail
                tm = logic.get("trail_method", "Points")
                f.write(f"gInput_Trail_{suffix_full}={TRAIL_METHODS.get(tm, 0)}\n")
                f.write(f"gInput_TrailValue_{suffix_full}={logic.get('trail_value', 0)}\n")
                f.write(f"gInput_Trail_Start_{suffix_full}={logic.get('trail_start', 0)}\n")
                f.write(f"gInput_TrailStep_{suffix_full}={logic.get('trail_step', 0)}\n")
                
                tsm = logic.get("trail_step_method", "Step_Points")
                f.write(f"gInput_TrailStepMethod_{suffix_full}={TRAIL_STEP_METHODS.get(tsm, 0)}\n")
                
                # Logic Specific
                if name == "Power":
                    f.write(f"gInput_MaxPowerOrders={engine_a.get('max_power_orders', 10)}\n")
                    f.write(f"gInput_LastLotPower={logic.get('last_lot', 0.63)}\n")
                else:
                    f.write(f"gInput_Start{name}={logic.get('start_level', 4)}\n")
                    f.write(f"gInput_LastLot{name}={logic.get('last_lot', 0.12)}\n")

                f.write("\n")

def generate_full_export():
    """Generate complete V17.04+ compliant config."""
    
    logic_names = ["Power", "Repower", "Scalper", "Stopper", "STO", "SCA", "RPO"]
    engine_ids = ["A", "B", "C"]
    
    engines = []
    
    for engine_id in engine_ids:
        groups = []
        
        for group_num in range(1, 21):  # Groups 1-20
            logics = []
            
            for logic_name in logic_names:
                is_power = logic_name.lower() == "power"
                logic_id = f"{engine_id}_{logic_name}_G{group_num}"
                
                logic = {
                    # Metadata
                    "logic_name": logic_name,
                    "logic_id": logic_id,
                    "enabled": True,
                    
                    # Base params
                    "initial_lot": 0.02,
                    "multiplier": 1.2,
                    "grid": 300.0,
                    "trail_method": "Points",
                    "trail_value": 3000.0,
                    "trail_start": 1.0,
                    "trail_step": 1500.0,
                    "trail_step_method": "Step_Points",
                    
                    # Logic specific
                    "close_targets": "1,2,3",
                    "order_count_reference": "Logic_Self",
                    "reset_lot_on_restart": False,
                    
                    # TPSL
                    "use_tp": False,
                    "tp_mode": "TPSL_Points",
                    "tp_value": 0.0,
                    "use_sl": False,
                    "sl_mode": "TPSL_Points",
                    "sl_value": 0.0,
                    
                    # V17.04+ Reverse/Hedge per-logic (8 fields)
                    "reverse_enabled": False,
                    "hedge_enabled": False,
                    "reverse_scale": 100.0,
                    "hedge_scale": 50.0,
                    "reverse_reference": "Logic_None",
                    "hedge_reference": "Logic_None",
                    
                    # V17.04+ Trail Step Advanced (3 fields)
                    "trail_step_mode": "TrailStepMode_Auto",
                    "trail_step_cycle": 1,
                    "trail_step_balance": 0.0,
                    
                    # Trail Step 2-7
                    "trail_step_2": 1500.0,
                    "trail_step_method_2": "Step_Points",
                    "trail_step_cycle_2": 1,
                    "trail_step_balance_2": 0.0,
                    "trail_step_mode_2": "TrailStepMode_Auto",

                    "trail_step_3": 1500.0,
                    "trail_step_method_3": "Step_Points",
                    "trail_step_cycle_3": 1,
                    "trail_step_balance_3": 0.0,
                    "trail_step_mode_3": "TrailStepMode_Auto",

                    "trail_step_4": 1500.0,
                    "trail_step_method_4": "Step_Points",
                    "trail_step_cycle_4": 1,
                    "trail_step_balance_4": 0.0,
                    "trail_step_mode_4": "TrailStepMode_Auto",

                    "trail_step_5": 1500.0,
                    "trail_step_method_5": "Step_Points",
                    "trail_step_cycle_5": 1,
                    "trail_step_balance_5": 0.0,
                    "trail_step_mode_5": "TrailStepMode_Auto",

                    "trail_step_6": 1500.0,
                    "trail_step_method_6": "Step_Points",
                    "trail_step_cycle_6": 1,
                    "trail_step_balance_6": 0.0,
                    "trail_step_mode_6": "TrailStepMode_Auto",

                    "trail_step_7": 1500.0,
                    "trail_step_method_7": "Step_Points",
                    "trail_step_cycle_7": 1,
                    "trail_step_balance_7": 0.0,
                    "trail_step_mode_7": "TrailStepMode_Auto",

                    # Close Partial (5 fields)
                    "close_partial": False,
                    "close_partial_cycle": 3,
                    "close_partial_mode": "PartialMode_Low",
                    "close_partial_balance": "PartialBalance_Balanced",
                    "close_partial_trail_step_mode": "TrailStepMode_Auto",

                    # Close Partial 2-4
                    "close_partial_2": False,
                    "close_partial_cycle_2": 3,
                    "close_partial_mode_2": "PartialMode_Low",
                    "close_partial_balance_2": "PartialBalance_Balanced",

                    "close_partial_3": False,
                    "close_partial_cycle_3": 3,
                    "close_partial_mode_3": "PartialMode_Low",
                    "close_partial_balance_3": "PartialBalance_Balanced",

                    "close_partial_4": False,
                    "close_partial_cycle_4": 3,
                    "close_partial_mode_4": "PartialMode_Low",
                    "close_partial_balance_4": "PartialBalance_Balanced",
                }
                
                # Non-Power specific fields
                if not is_power:
                    logic["start_level"] = 4
                    logic["last_lot"] = 0.12
                
                # Group 1 trigger fields
                if group_num == 1:
                    logic["trigger_type"] = "Default"
                    logic["trigger_bars"] = 3
                    logic["trigger_minutes"] = 15
                
                logics.append(logic)
            
            group = {
                "group_number": group_num,
                "enabled": True,
                
                # V17.04+ Group-level Reverse/Hedge controls
                "reverse_mode": False,
                "hedge_mode": False,
                "hedge_reference": "Logic_None",
                "entry_delay_bars": 0,
                
                "logics": logics,
            }
            groups.append(group)
        
        engine = {
            "engine_id": engine_id,
            "engine_name": f"Engine {engine_id}",
            "max_power_orders": 10,
            "groups": groups,
        }
        engines.append(engine)
    
    config = {
        "version": "17.04",
        "platform": "MT4",
        "timestamp": datetime.now().isoformat(),
        "total_inputs": 11081,
        "general": {
            "license_key": "",
            "license_server_url": "https://license.daavfx.com",
            "require_license": False,
            "license_check_interval": 3600,
            "config_file_name": "DAAVFX_Config.json",
            "config_file_is_common": False,
            "allow_buy": True,
            "allow_sell": True,
            "enable_logs": True,
            "compounding_enabled": False,
            "compounding_type": "Compound_Balance",
            "compounding_target": 40.0,
            "compounding_increase": 2.0,
            "restart_policy_power": "Restart_Default",
            "restart_policy_non_power": "Restart_Default",
            "close_non_power_on_power_close": False,
            "hold_timeout_bars": 10,
            "magic_number": 777,
            "max_slippage_points": 30.0,
            "risk_management": {
                "spread_filter_enabled": False,
                "max_spread_points": 25.0,
                "equity_stop_enabled": False,
                "equity_stop_value": 35.0,
                "drawdown_stop_enabled": False,
                "max_drawdown_percent": 35.0,
            },
            "time_filters": {
                "priority_settings": {
                    "news_filter_overrides_session": False,
                    "session_filter_overrides_news": True,
                },
                "sessions": [
                    {
                        "session_number": i,
                        "enabled": False,
                        "day": i % 7,
                        "start_hour": 9,
                        "start_minute": 30,
                        "end_hour": 17,
                        "end_minute": 0,
                        "action": "TriggerAction_StopEA_KeepTrades",
                        "auto_restart": True,
                        "restart_mode": "Restart_Immediate",
                        "restart_bars": 0,
                        "restart_minutes": 0,
                        "restart_pips": 0,
                    }
                    for i in range(1, 8)
                ],
            },
            "news_filter": {
                "enabled": False,
                "api_key": "",
                "api_url": "https://www.jblanked.com/news/api/calendar/",
                "countries": "US,GB,EU",
                "impact_level": 3,
                "minutes_before": 30,
                "minutes_after": 30,
                "action": "TriggerAction_StopEA_KeepTrades",
            },
        },
        "engines": engines,
    }
    
    return config

if __name__ == "__main__":
    config = generate_full_export()
    
    # Write to file
    with open("SAMPLE_FULL_EXPORT_TEST.json", "w") as f:
        json.dump(config, f, indent=2)
    
    # Stats
    total_logics = sum(
        len(group["logics"])
        for engine in config["engines"]
        for group in engine["groups"]
    )
    print(f"Generated complete V17.04+ config:")
    print(f"  - Engines: {len(config['engines'])}")
    print(f"  - Groups per engine: {len(config['engines'][0]['groups'])}")
    print(f"  - Logics per group: {len(config['engines'][0]['groups'][0]['logics'])}")
    print(f"  - Total logic configs: {total_logics}")
    print(f"\nSaved to: SAMPLE_FULL_EXPORT_TEST.json")

    # Generate Setfile
    generate_set_file(config, "SAMPLE_VISIBLE_INPUTS.set")
    print("Generated setfile: SAMPLE_VISIBLE_INPUTS.set")
