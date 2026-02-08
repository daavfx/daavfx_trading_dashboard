#!/usr/bin/env python3
"""
MASSIVE DAAVILEFX Setfile Generator v19
Modified version with changed values for testing dashboard loading
Changes from v18:
- InitialLot: 0.01 -> 0.02
- LastLot: 0.10 -> 0.20
- Additional random variations across groups/logics
"""

import os
import random
from datetime import datetime

# Set seed for reproducibility but with variations
random.seed(19)

# Configuration
GROUPS = 15
ENGINES = ['A', 'B', 'C']
LOGICS = ['Power', 'Repower', 'Scalp', 'Stopper', 'STO', 'SCA', 'RPO']
DIRECTIONS = ['Buy', 'Sell']

# Logic suffix mapping for compact names
LOGIC_SUFFIX = {
    'Power': 'P',
    'Repower': 'R',
    'Scalp': 'S',
    'Stopper': 'T',
    'STO': 'O',
    'SCA': 'C',
    'RPO': 'X'
}

def generate_logic_inputs(group_num, engine, logic, direction):
    """Generate all 88 inputs for a single logic-direction with variations"""
    prefix = f"gInput_{group_num}_{engine}{LOGIC_SUFFIX[logic]}_{direction}"
    is_power = logic == 'Power'
    is_buy = direction == 'Buy'
    
    # CHANGED: Base variations for testing
    # Group 1-5: Conservative
    # Group 6-10: Moderate  
    # Group 11-15: Aggressive
    if group_num <= 5:
        base_lot = 0.02  # CHANGED from 0.01
        max_lot = 0.20   # CHANGED from 0.10
        grid_base = 100
        trail_base = 5.0
    elif group_num <= 10:
        base_lot = 0.03
        max_lot = 0.30
        grid_base = 150
        trail_base = 7.5
    else:
        base_lot = 0.05
        max_lot = 0.50
        grid_base = 200
        trail_base = 10.0
    
    # Add some randomness for testing visibility
    lot_variation = random.uniform(-0.005, 0.005)
    grid_variation = random.uniform(-10, 10)
    trail_variation = random.uniform(-1, 1)
    
    inputs = []
    
    # 1. Metadata & Base (3 fields)
    inputs.append(f"{prefix}_Enabled=1")
    inputs.append(f"{prefix}_AllowBuy=1" if is_buy else f"{prefix}_AllowBuy=0")
    inputs.append(f"{prefix}_AllowSell=0" if is_buy else f"{prefix}_AllowSell=1")
    
    # 2. Order Parameters (5 fields) - CHANGED values
    inputs.append(f"{prefix}_InitialLot={base_lot + lot_variation:.2f}")
    inputs.append(f"{prefix}_LastLot={max_lot + (lot_variation * 2):.2f}")
    inputs.append(f"{prefix}_Multiplier={1.20 + (group_num * 0.02):.2f}")
    inputs.append(f"{prefix}_Grid={grid_base + (group_num * 20) + grid_variation:.1f}")
    inputs.append(f"{prefix}_GridBehavior=0")
    
    # 3. Trail Configuration (4 fields) with variations
    inputs.append(f"{prefix}_TrailMethod=0")
    inputs.append(f"{prefix}_TrailValue={trail_base + (group_num * 0.5) + trail_variation:.1f}")
    inputs.append(f"{prefix}_TrailStart={group_num * 2.0 + random.uniform(0, 2):.1f}")
    inputs.append(f"{prefix}_TrailStep={trail_base + (group_num * 0.25) + random.uniform(-0.5, 0.5):.1f}")
    
    # 4. Trail Steps [7] × 5 fields = 35 fields with variations
    for step in range(1, 8):
        step_variation = random.uniform(-2, 2)
        step_value = trail_base + (step * 5.0) + (group_num * 0.5) + step_variation
        inputs.append(f"{prefix}_TrailStep{step}={step_value:.1f}")
        inputs.append(f"{prefix}_TrailStepMethod{step}=0")
        inputs.append(f"{prefix}_TrailStepMode{step}=0")
        inputs.append(f"{prefix}_TrailStepCycle{step}={step}")
        inputs.append(f"{prefix}_TrailStepBalance{step}={random.uniform(0, 100):.1f}")
    
    # 5. Take Profit / Stop Loss (6 fields) with variations
    inputs.append(f"{prefix}_UseTP=1")
    tp_variation = random.uniform(-5, 5)
    inputs.append(f"{prefix}_TakeProfit={50.0 + (group_num * 10.0) + tp_variation:.1f}")
    inputs.append(f"{prefix}_TPMode=0")
    inputs.append(f"{prefix}_UseSL=1")
    sl_variation = random.uniform(-3, 3)
    inputs.append(f"{prefix}_StopLoss={30.0 + (group_num * 5.0) + sl_variation:.1f}")
    inputs.append(f"{prefix}_SLMode=0")
    
    # 6. Breakeven (4 fields) with variations
    be_variation = random.uniform(-2, 2)
    inputs.append(f"{prefix}_BreakEvenMode=0")
    inputs.append(f"{prefix}_BreakEvenActivation={20.0 + (group_num * 2.0) + be_variation:.1f}")
    inputs.append(f"{prefix}_BreakEvenLock={10.0 + group_num + be_variation * 0.5:.1f}")
    inputs.append(f"{prefix}_BreakEvenTrail=0")
    
    # 7. Profit Trail (5 fields) with variations
    pt_enabled = 1 if random.random() > 0.7 else 0  # 30% chance enabled
    inputs.append(f"{prefix}_ProfitTrailEnabled={pt_enabled}")
    inputs.append(f"{prefix}_ProfitTrailPeakDrop={random.uniform(40, 60):.1f}")
    inputs.append(f"{prefix}_ProfitTrailLock={random.uniform(25, 35):.1f}")
    inputs.append(f"{prefix}_ProfitTrailCloseOnTrigger={random.randint(0, 1)}")
    inputs.append(f"{prefix}_ProfitTrailUseBreakEven={random.randint(0, 1)}")
    
    # 8. Entry Triggers (4 fields) with variations
    trigger_type = random.randint(0, 2)  # Random trigger type for testing
    inputs.append(f"{prefix}_TriggerType={trigger_type}")
    inputs.append(f"{prefix}_TriggerBars={random.randint(0, 3)}")
    inputs.append(f"{prefix}_TriggerMinutes={random.randint(0, 5)}")
    inputs.append(f"{prefix}_TriggerPips={random.uniform(0, 5):.1f}")
    
    # 9. Cross-Logic References (8 fields) with random variations
    inputs.append(f"{prefix}_ReverseReference={random.randint(0, 3)}")
    inputs.append(f"{prefix}_HedgeReference={random.randint(0, 3)}")
    inputs.append(f"{prefix}_OrderCountRefLogic={random.randint(0, 5)}")
    inputs.append(f"{prefix}_ReverseScale={random.uniform(0.8, 1.2):.1f}")
    inputs.append(f"{prefix}_HedgeScale={random.uniform(0.8, 1.2):.1f}")
    inputs.append(f"{prefix}_ReverseEnabled={random.randint(0, 1)}")
    inputs.append(f"{prefix}_HedgeEnabled={random.randint(0, 1)}")
    inputs.append(f"{prefix}_CloseTargets={random.randint(0, 3)}")
    
    # 10. Engine-Specific (4 fields, Power has no start_level)
    inputs.append(f"{prefix}_OrderCountRef={random.randint(0, 10)}")
    if not is_power:
        inputs.append(f"{prefix}_StartLevel={group_num + random.randint(0, 2)}")
    else:
        inputs.append(f"{prefix}_StartLevel=0")
    inputs.append(f"{prefix}_ResetLotOnRestart={random.randint(0, 1)}")
    inputs.append(f"{prefix}_RestartPolicy={random.randint(0, 2)}")
    
    # 11. Partial Close [4] × 8 fields = 32 fields with variations
    for partial in range(1, 5):
        partial_enabled = 1 if random.random() > 0.6 else 0  # 40% chance
        inputs.append(f"{prefix}_PartialEnabled{partial}={partial_enabled}")
        inputs.append(f"{prefix}_PartialCycle{partial}={partial + random.randint(0, 2)}")
        inputs.append(f"{prefix}_PartialMode{partial}={random.randint(0, 2)}")
        inputs.append(f"{prefix}_PartialBalance{partial}={random.randint(0, 2)}")
        inputs.append(f"{prefix}_PartialTrailMode{partial}={random.randint(0, 1)}")
        inputs.append(f"{prefix}_PartialTrigger{partial}={random.randint(0, 2)}")
        inputs.append(f"{prefix}_PartialProfitThreshold{partial}={random.uniform(0, 20):.1f}")
        inputs.append(f"{prefix}_PartialHours{partial}={random.randint(0, 48)}")
    
    return inputs

def generate_global_inputs():
    """Generate ~50 global inputs with variations from v18"""
    inputs = []
    
    # Global Settings - some changed from v18
    inputs.append("gInput_MagicNumber=777")
    inputs.append("gInput_MagicNumberBuy=888")  # CHANGED from 777
    inputs.append("gInput_MagicNumberSell=999")  # CHANGED from 888
    inputs.append("gInput_EnableLogs=1")  # CHANGED from 0
    inputs.append("gInput_AllowBuy=1")
    inputs.append("gInput_AllowSell=1")
    inputs.append("gInput_MaxSlippage=5")  # CHANGED from 3
    inputs.append("gInput_MaxSpread=60")  # CHANGED from 50
    inputs.append("gInput_MaxOrders=150")  # CHANGED from 100
    inputs.append("gInput_MaxDailyLoss=5")  # CHANGED from 0
    inputs.append("gInput_MaxDrawdown=10")  # CHANGED from 0
    inputs.append("gInput_AutoCompounding=1")  # CHANGED from 0
    inputs.append("gInput_CompoundingPercent=2.0")  # CHANGED from 0.0
    inputs.append("gInput_RiskPercent=2.0")  # CHANGED from 1.0
    inputs.append("gInput_LotSize=0.02")  # CHANGED from 0.01
    inputs.append("gInput_UseMoneyManagement=1")  # CHANGED from 0
    inputs.append("gInput_FixedLot=0.02")  # CHANGED from 0.01
    
    # Session Settings - some inverted
    inputs.append("gInput_TradeMonday=1")
    inputs.append("gInput_TradeTuesday=1")
    inputs.append("gInput_TradeWednesday=1")
    inputs.append("gInput_TradeThursday=1")
    inputs.append("gInput_TradeFriday=1")
    inputs.append("gInput_TradeSaturday=0")
    inputs.append("gInput_TradeSunday=0")
    inputs.append("gInput_StartHour=1")  # CHANGED from 0
    inputs.append("gInput_EndHour=23")  # CHANGED from 24
    inputs.append("gInput_UseSessionFilter=1")  # CHANGED from 0
    inputs.append("gInput_SessionStart=2")  # CHANGED from 0
    inputs.append("gInput_SessionEnd=22")  # CHANGED from 24
    
    # Filter Settings - enabled some
    inputs.append("gInput_UseTrendFilter=1")  # CHANGED from 0
    inputs.append("gInput_TrendPeriod=21")  # CHANGED from 14
    inputs.append("gInput_UseVolatilityFilter=1")  # CHANGED from 0
    inputs.append("gInput_VolatilityPeriod=14")  # CHANGED from 20
    inputs.append("gInput_UseNewsFilter=1")  # CHANGED from 0
    inputs.append("gInput_NewsImpact=2")  # CHANGED from 3
    inputs.append("gInput_MinsBeforeNews=60")  # CHANGED from 30
    inputs.append("gInput_MinsAfterNews=60")  # CHANGED from 30
    
    # Advanced Settings - enabled
    inputs.append("gInput_UseVirtualPending=1")  # CHANGED from 0
    inputs.append("gInput_VirtualPendingPips=15.0")  # CHANGED from 10.0
    inputs.append("gInput_OrderComment=DAAVILEFX_v19")  # CHANGED
    inputs.append("gInput_RequireLicense=0")
    inputs.append("gInput_LicenseServer=https://license.daavfx.com")
    inputs.append("gInput_ShowUI=1")
    inputs.append("gInput_ShowTrails=1")  # CHANGED from 0
    inputs.append("gInput_EnableDebug=1")  # CHANGED from 0
    inputs.append("gInput_LogLevel=2")  # CHANGED from 1
    inputs.append("gInput_SaveStats=1")
    inputs.append("gInput_StatsFile=daavilefx_stats_v19.csv")  # CHANGED
    
    return inputs

def generate_massive_setfile():
    """Generate complete massive setfile v19 with all changes"""
    lines = []
    
    # Header
    lines.append("; DAAVILEFX MASSIVE CONFIGURATION SETFILE v19")
    lines.append(f"; Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("; Version: 19.0 MASSIVE (Testing Variant)")
    lines.append("; Platform: MT4")
    lines.append(";")
    lines.append(f"; Structure: {GROUPS} groups × {len(ENGINES)} engines × {len(LOGICS)} logics × {len(DIRECTIONS)} directions")
    lines.append(f"; Total Logic-Directions: {GROUPS * len(ENGINES) * len(LOGICS) * len(DIRECTIONS)}")
    lines.append(f"; Fields per Logic: 88")
    lines.append(f"; Total Logic Inputs: {GROUPS * len(ENGINES) * len(LOGICS) * len(DIRECTIONS) * 88}")
    lines.append(f"; Global Inputs: ~50")
    lines.append(f"; GRAND TOTAL: ~55,500 inputs")
    lines.append(";")
    lines.append("; CHANGES FROM v18:")
    lines.append("; - InitialLot: 0.01 -> 0.02 (and higher for groups 6-15)")
    lines.append("; - LastLot: 0.10 -> 0.20 (and higher for groups 6-15)")
    lines.append("; - Added random variations across all parameters for testing")
    lines.append("; - Enabled various filters and settings that were disabled")
    lines.append("; - Changed magic numbers and session times")
    lines.append("")
    
    # Global Settings Section
    lines.append("; ===========================================")
    lines.append("; GLOBAL SETTINGS (Changed from v18)")
    lines.append("; ===========================================")
    lines.append("")
    lines.extend(generate_global_inputs())
    lines.append("")
    
    # Logic Inputs Section
    lines.append("; ===========================================")
    lines.append("; LOGIC CONFIGURATIONS (630 logic-directions)")
    lines.append("; Groups 1-5: Conservative (0.02 lot)")
    lines.append("; Groups 6-10: Moderate (0.03 lot)")
    lines.append("; Groups 11-15: Aggressive (0.05 lot)")
    lines.append("; ===========================================")
    lines.append("")
    
    total_inputs = 0
    for group in range(1, GROUPS + 1):
        lines.append(f"; Group {group}")
        lines.append(f"; ===========================================")
        
        for engine in ENGINES:
            for logic in LOGICS:
                for direction in DIRECTIONS:
                    logic_inputs = generate_logic_inputs(group, engine, logic, direction)
                    lines.extend(logic_inputs)
                    total_inputs += len(logic_inputs)
                    lines.append("")  # Blank line between logics
        
        lines.append("")
    
    # Footer
    lines.append("; ===========================================")
    lines.append(f"; END OF CONFIGURATION v19")
    lines.append(f"; Total Inputs Generated: {total_inputs + len(generate_global_inputs())}")
    lines.append("; CHANGES: Higher lots, enabled filters, random variations")
    lines.append("; ===========================================")
    
    return '\n'.join(lines)

def main():
    """Generate and save the massive setfile v19"""
    output_dir = r"D:\trading_ecosystem_11\trading_ecosystem_9.0\main_ecosystem_trading\APPS\dashboard\logic-canvas-main\Vault_Presets"
    output_file = os.path.join(output_dir, "MASSIVE_DAAVILEFX_COMPLETE_v19.set")
    
    print("=" * 60)
    print("MASSIVE DAAVILEFX Setfile Generator v19")
    print("=" * 60)
    print(f"Structure: {GROUPS} groups × {len(ENGINES)} engines × {len(LOGICS)} logics × {len(DIRECTIONS)} directions")
    print(f"Expected inputs: ~55,500")
    print()
    print("CHANGES FROM v18:")
    print("  - InitialLot: 0.01 -> 0.02")
    print("  - LastLot: 0.10 -> 0.20")
    print("  - Added random variations for testing")
    print("  - Enabled various filters and settings")
    print()
    
    # Generate content
    content = generate_massive_setfile()
    
    # Count lines
    lines = content.split('\n')
    print(f"Generated {len(lines)} lines")
    
    # Calculate file size estimate
    file_size_mb = len(content.encode('utf-8')) / (1024 * 1024)
    print(f"Estimated file size: {file_size_mb:.2f} MB")
    
    # Save file
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(content)
    
    actual_size = os.path.getsize(output_file) / (1024 * 1024)
    print(f"\n[SUCCESS] Saved to: {output_file}")
    print(f"[SUCCESS] Total lines: {len(lines)}")
    print(f"[SUCCESS] File size: {actual_size:.2f} MB")
    print(f"\nYou can now compare v18 and v19 in the dashboard!")
    
    return output_file

if __name__ == "__main__":
    output_path = main()
    print(f"\nOutput: {output_path}")
