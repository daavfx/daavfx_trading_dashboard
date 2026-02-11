#!/usr/bin/env python3
"""
Generate COMPLETE DashboardExport.mqh with ALL 14 groups × 3 engines × 7 logics
Auto-generates MQL4 code for all 2,732 MT4 inputs
"""

def generate_logic_export(engine_id, logic_name, logic_suffix, group_num, is_last_logic, logic_short):
    """Generate export code for a single logic"""
    comma = "" if is_last_logic else ","
    
    # Handle optional Trigger inputs for Group 1
    trigger_code = ""
    if group_num == 1:
        trigger_code = f'''
              "trigger_type": "" + EnumToString(gInput_G1_TriggerType_{logic_short}) + "",
              "trigger_bars": " + IntegerToString(gInput_G1_TriggerBars_{logic_short}) + ",
              "trigger_minutes": " + IntegerToString(gInput_G1_TriggerMinutes_{logic_short}) + ",
              "trigger_pips": " + DoubleToString(gInput_G1_TriggerPips_{logic_short}, 1) + ",
        '''

    # Generate TrailStep 2-7
    trail_step_extended = ""
    for i in range(2, 8):
        trail_step_extended += f'''
              "trail_step_{i}": " + DoubleToString(gInput_TrailStep{i}_{logic_suffix}{group_num}, 1) + ",
              "trail_step_method_{i}": "" + EnumToString(gInput_TrailStepMethod{i}_{logic_suffix}{group_num}) + "",
              "trail_step_mode_{i}": "" + EnumToString(gInput_TrailStepMode{i}_{logic_suffix}{group_num}) + "",
              "trail_step_cycle_{i}": " + IntegerToString(gInput_TrailStepCycle{i}_{logic_suffix}{group_num}) + ",
              "trail_step_balance_{i}": " + DoubleToString(gInput_TrailStepBalance{i}_{logic_suffix}{group_num}, 2) + ",'''

    # Generate ClosePartial 2-4
    close_partial_extended = ""
    for i in range(2, 5):
        close_partial_extended += f'''
              "close_partial_{i}": " + (gInput_ClosePartial{i}_{logic_suffix}{group_num} ? "true" : "false") + ",
              "close_partial_cycle_{i}": " + IntegerToString(gInput_ClosePartialCycle{i}_{logic_suffix}{group_num}) + ",
              "close_partial_mode_{i}": "" + EnumToString(gInput_ClosePartialMode{i}_{logic_suffix}{group_num}) + "",
              "close_partial_balance_{i}": "" + EnumToString(gInput_ClosePartialBalance{i}_{logic_suffix}{group_num}) + ",'''

    code = f'''            {{
              "logic_name": "{logic_name}",
              "logic_id": "{engine_id}_{logic_name}_G{group_num}",
              "enabled": true,
              "initial_lot": " + DoubleToString(gInput_Initial_loT_{logic_suffix}{group_num}, 2) + ",
              "multiplier": " + DoubleToString(gInput_Mult_{logic_suffix}{group_num}, 2) + ",
              "grid": " + DoubleToString(gInput_Grid_{logic_suffix}{group_num}, 1) + ",
              "trail_method": "" + EnumToString(gInput_Trail_{logic_suffix}{group_num}) + "",
              "trail_value": " + DoubleToString(gInput_TrailValue_{logic_suffix}{group_num}, 1) + ",
              "trail_start": " + DoubleToString(gInput_Trail_Start_{logic_suffix}{group_num}, 1) + ",
              "trail_step": " + DoubleToString(gInput_TrailStep_{logic_suffix}{group_num}, 1) + ",
              "trail_step_method": "" + EnumToString(gInput_TrailStepMethod_{logic_suffix}{group_num}) + "",
              "trail_step_mode": "" + EnumToString(gInput_TrailStepMode_{logic_suffix}{group_num}) + "",
              "trail_step_cycle": " + IntegerToString(gInput_TrailStepCycle_{logic_suffix}{group_num}) + ",
              "trail_step_balance": " + DoubleToString(gInput_TrailStepBalance_{logic_suffix}{group_num}, 2) + ",{trail_step_extended}
              "close_partial": " + (gInput_ClosePartial_{logic_suffix}{group_num} ? "true" : "false") + ",
              "close_partial_cycle": " + IntegerToString(gInput_ClosePartialCycle_{logic_suffix}{group_num}) + ",
              "close_partial_mode": "" + EnumToString(gInput_ClosePartialMode_{logic_suffix}{group_num}) + "",
              "close_partial_balance": "" + EnumToString(gInput_ClosePartialBalance_{logic_suffix}{group_num}) + "",
              "close_partial_trail_step_mode": "" + EnumToString(gInput_ClosePartialTrailStepMode_{logic_suffix}{group_num}) + ",{close_partial_extended}
              "reverse_enabled": " + (gInput_G{group_num}_{logic_short}_ReverseEnabled ? "true" : "false") + ",
              "hedge_enabled": " + (gInput_G{group_num}_{logic_short}_HedgeEnabled ? "true" : "false") + ",
              "reverse_scale": " + DoubleToString(gInput_G{group_num}_Scale_{logic_short}_Reverse, 2) + ",
              "hedge_scale": " + DoubleToString(gInput_G{group_num}_Scale_{logic_short}_Hedge, 2) + ",
              "reverse_reference": "" + EnumToString(gInput_G{group_num}_{logic_short}_ReverseReference) + "",
              "hedge_reference": "" + EnumToString(gInput_G{group_num}_{logic_short}_HedgeReference) + "",
              "use_tp": " + (gInput_G{group_num}_UseTP_{logic_short} ? "true" : "false") + ",
              "tp_mode": "" + EnumToString(gInput_G{group_num}_TP_Mode_{logic_short}) + "",
              "tp_value": " + DoubleToString(gInput_G{group_num}_TP_Value_{logic_short}, 1) + ",
              "use_sl": " + (gInput_G{group_num}_UseSL_{logic_short} ? "true" : "false") + ",
              "sl_mode": "" + EnumToString(gInput_G{group_num}_SL_Mode_{logic_short}) + "",
              "sl_value": " + DoubleToString(gInput_G{group_num}_SL_Value_{logic_short}, 1) + ",
              "order_count_reference": "" + EnumToString(gInput_{logic_suffix}{group_num}_OrderCountReference) + "",
              "reset_lot_on_restart": " + (gInput_ResetLotOnRestart_{logic_suffix}{group_num} ? "true" : "false") + ",
              "close_targets": " + gInput_CloseTargets_{logic_suffix}{group_num} + ",
              {trigger_code}
              "last_lot": " + DoubleToString(gInput_LastLot{logic_suffix}{group_num}, 2) + "
            }}{comma}\n'''
    
    return code

def generate_engine_export(engine_id, engine_name, max_power_var, logics_info):
    """Generate export function for entire engine"""
    
    code = f'''//+------------------------------------------------------------------+
//| Export {engine_name} - ALL 14 GROUPS × 7 LOGICS                 |
//+------------------------------------------------------------------+
void ExportEngine_{engine_id}_All(int handle)
{{
   FileWriteString(handle, "    {{\\n");
   FileWriteString(handle, "      \\"engine_id\\": \\"{engine_id}\\",\\n");
   FileWriteString(handle, "      \\"engine_name\\": \\"{engine_name}\\",\\n");
   FileWriteString(handle, "      \\"max_power_orders\\": " + IntegerToString({max_power_var}) + ",\\n");
   FileWriteString(handle, "      \\"groups\\": [\\n");
   
'''
    
    for group in range(1, 21):  # Groups 1-20
        code += f'''   // Group {group}\n'''
        code += f'''   FileWriteString(handle, "        {{\\\"group_number\\\": {group}, \\\"enabled\\\": true, \\\"reverse_mode\\\": " + (gInput_Group{group}_ReverseMode ? "true" : "false") + ", \\\"hedge_mode\\\": " + (gInput_Group{group}_HedgeMode ? "true" : "false") + ", \\\"hedge_reference\\\": \\"" + EnumToString(gInput_Group{group}_HedgeReference) + "\\", \\\"entry_delay_bars\\\": " + IntegerToString(gInput_Group{group}_EntryDelayBars) + ", \\\"logics\\\": [\\n");\n'''
        
        for i, (logic_name, logic_suffix) in enumerate(logics_info):
            logic_short = logic_suffix.replace("P", "Power").replace("R", "Repower").replace("S", "Scalp").replace("ST", "Stopper").replace("STO", "STO").replace("SCA", "SCA").replace("RPO", "RPO")
            # Logic short correction for correct variable mapping
            if logic_name == "Power": logic_short = "P"
            elif logic_name == "Repower": logic_short = "R"
            elif logic_name == "Scalp": logic_short = "S"
            elif logic_name == "Stopper": logic_short = "ST"
            elif logic_name == "STO": logic_short = "STO"
            elif logic_name == "SCA": logic_short = "SCA"
            elif logic_name == "RPO": logic_short = "RPO"
            elif logic_name == "BPower": logic_short = "BP"
            elif logic_name == "BRepower": logic_short = "BR"
            elif logic_name == "BScalp": logic_short = "BS"
            elif logic_name == "BStopper": logic_short = "BST"
            elif logic_name == "BSTO": logic_short = "BSTO"
            elif logic_name == "BSCA": logic_short = "BSCA"
            elif logic_name == "BRPO": logic_short = "BRPO"
            elif logic_name == "CPower": logic_short = "CP"
            elif logic_name == "CRepower": logic_short = "CR"
            elif logic_name == "CScalp": logic_short = "CS"
            elif logic_name == "CStopper": logic_short = "CST"
            elif logic_name == "CSTO": logic_short = "CSTO"
            elif logic_name == "CSCA": logic_short = "CSCA"
            elif logic_name == "CRPO": logic_short = "CRPO"
            
            is_last = (i == len(logics_info) - 1)
            code += generate_logic_export(engine_id, logic_name, logic_suffix, group, is_last, logic_short)
            
        code += f'''   FileWriteString(handle, "      ]}}{"," if group < 20 else ""}\\n");\n'''
        
    code += '''   FileWriteString(handle, "   ]\\n");
   FileWriteString(handle, "    }");
}
'''
    return code

if __name__ == "__main__":
    engines = [
        ("A", "Engine A", "gInput_MaxPowerOrders", [
            ("Power", "P"), ("Repower", "R"), ("Scalp", "S"), ("Stopper", "ST"), ("STO", "STO"), ("SCA", "SCA"), ("RPO", "RPO")
        ]),
        ("B", "Engine B", "gInput_MaxPowerOrdersB", [
            ("BPower", "BP"), ("BRepower", "BR"), ("BScalp", "BS"), ("BStopper", "BST"), ("BSTO", "BSTO"), ("BSCA", "BSCA"), ("BRPO", "BRPO")
        ]),
        ("C", "Engine C", "gInput_MaxPowerOrdersC", [
            ("CPower", "CP"), ("CRepower", "CR"), ("CScalp", "CS"), ("CStopper", "CST"), ("CSTO", "CSTO"), ("CSCA", "CSCA"), ("CRPO", "CRPO")
        ])
    ]

    print("//+------------------------------------------------------------------+")
    print("//| DashboardExport.mqh - AUTO GENERATED                             |")
    print("//+------------------------------------------------------------------+")
    print("#property copyright \"DAAVFX\"")
    print("#property link      \"https://daavfx.com\"")
    print("")
    
    for eng_id, eng_name, max_var, logics in engines:
        print(generate_engine_export(eng_id, eng_name, max_var, logics))

    print("//+------------------------------------------------------------------+")
    print("//| Main Export Function                                             |")
    print("//+------------------------------------------------------------------+")
    print("void ExportDashboardConfig(string filename)")
    print("{")
    print("   int handle = FileOpen(filename, FILE_WRITE|FILE_TXT|FILE_ANSI);")
    print("   if(handle == INVALID_HANDLE) {")
    print("      Print(\"Error opening file for export: \", GetLastError());")
    print("      return;")
    print("   }")
    print("")
    print("   FileWriteString(handle, \"{\\n\");")
    print("   FileWriteString(handle, \"  \\\"timestamp\\\": \\\"\" + TimeToString(TimeCurrent()) + \"\\\",\\n\");")
    print("   FileWriteString(handle, \"  \\\"engines\\\": [\\n\");")
    print("")
    print("   ExportEngine_A_All(handle);")
    print("   FileWriteString(handle, \",\\n\");")
    print("   ExportEngine_B_All(handle);")
    print("   FileWriteString(handle, \",\\n\");")
    print("   ExportEngine_C_All(handle);")
    print("")
    print("   FileWriteString(handle, \"\\n  ]\\n\");")
    print("   FileWriteString(handle, \"}\");")
    print("   FileClose(handle);")
    print("   Print(\"Dashboard configuration exported to: \", filename);")
    print("}")
