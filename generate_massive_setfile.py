#!/usr/bin/env python3
"""
MASSIVE DAAVILEFX Setfile Generator
Generates complete 55,500+ input configuration
15 groups × 3 engines × 7 logics × 2 directions = 630 logic-directions
"""

import os
from datetime import datetime

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
    """Generate all 88 inputs for a single logic-direction"""
    prefix = f"gInput_{group_num}_{engine}{LOGIC_SUFFIX[logic]}_{direction}"
    is_power = logic == 'Power'
    is_buy = direction == 'Buy'
    
    inputs = []
    
    # 1. Metadata & Base (3 fields)
    inputs.append(f"{prefix}_Enabled=1")
    inputs.append(f"{prefix}_AllowBuy=1" if is_buy else f"{prefix}_AllowBuy=0")
    inputs.append(f"{prefix}_AllowSell=0" if is_buy else f"{prefix}_AllowSell=1")
    
    # 2. Order Parameters (5 fields)
    inputs.append(f"{prefix}_InitialLot=0.01")
    inputs.append(f"{prefix}_LastLot=0.10")
    inputs.append(f"{prefix}_Multiplier=1.20")
    inputs.append(f"{prefix}_Grid={100 + (group_num * 20)}")  # Varying grid per group
    inputs.append(f"{prefix}_GridBehavior=0")  # Counter-trend
    
    # 3. Trail Configuration (4 fields)
    inputs.append(f"{prefix}_TrailMethod=0")  # Points
    inputs.append(f"{prefix}_TrailValue={5.0 + (group_num * 0.5)}")
    inputs.append(f"{prefix}_TrailStart={group_num * 2.0}")
    inputs.append(f"{prefix}_TrailStep={5.0 + (group_num * 0.25)}")
    
    # 4. Trail Steps [7] × 5 fields = 35 fields
    for step in range(1, 8):
        step_value = 5.0 + (step * 5.0) + (group_num * 0.5)
        inputs.append(f"{prefix}_TrailStep{step}={step_value:.1f}")
        inputs.append(f"{prefix}_TrailStepMethod{step}=0")  # Points
        inputs.append(f"{prefix}_TrailStepMode{step}=0")  # Auto
        inputs.append(f"{prefix}_TrailStepCycle{step}={step}")
        inputs.append(f"{prefix}_TrailStepBalance{step}=0.0")
    
    # 5. Take Profit / Stop Loss (6 fields)
    inputs.append(f"{prefix}_UseTP=1")
    inputs.append(f"{prefix}_TakeProfit={50.0 + (group_num * 10.0)}")
    inputs.append(f"{prefix}_TPMode=0")  # Points
    inputs.append(f"{prefix}_UseSL=1")
    inputs.append(f"{prefix}_StopLoss={30.0 + (group_num * 5.0)}")
    inputs.append(f"{prefix}_SLMode=0")  # Points
    
    # 6. Breakeven (4 fields)
    inputs.append(f"{prefix}_BreakEvenMode=0")
    inputs.append(f"{prefix}_BreakEvenActivation={20.0 + (group_num * 2.0)}")
    inputs.append(f"{prefix}_BreakEvenLock={10.0 + group_num}")
    inputs.append(f"{prefix}_BreakEvenTrail=0")
    
    # 7. Profit Trail (5 fields)
    inputs.append(f"{prefix}_ProfitTrailEnabled=0")
    inputs.append(f"{prefix}_ProfitTrailPeakDrop=50.0")
    inputs.append(f"{prefix}_ProfitTrailLock=30.0")
    inputs.append(f"{prefix}_ProfitTrailCloseOnTrigger=0")
    inputs.append(f"{prefix}_ProfitTrailUseBreakEven=0")
    
    # 8. Entry Triggers (4 fields)
    inputs.append(f"{prefix}_TriggerType=0")  # Immediate
    inputs.append(f"{prefix}_TriggerBars=0")
    inputs.append(f"{prefix}_TriggerMinutes=0")
    inputs.append(f"{prefix}_TriggerPips=0.0")
    
    # 9. Cross-Logic References (8 fields)
    inputs.append(f"{prefix}_ReverseReference=0")  # None
    inputs.append(f"{prefix}_HedgeReference=0")  # None
    inputs.append(f"{prefix}_OrderCountRefLogic=0")
    inputs.append(f"{prefix}_ReverseScale=1.0")
    inputs.append(f"{prefix}_HedgeScale=1.0")
    inputs.append(f"{prefix}_ReverseEnabled=0")
    inputs.append(f"{prefix}_HedgeEnabled=0")
    inputs.append(f"{prefix}_CloseTargets=0")
    
    # 10. Engine-Specific (4 fields, Power has no start_level)
    inputs.append(f"{prefix}_OrderCountRef=0")
    if not is_power:
        inputs.append(f"{prefix}_StartLevel={group_num}")
    else:
        inputs.append(f"{prefix}_StartLevel=0")
    inputs.append(f"{prefix}_ResetLotOnRestart=1")
    inputs.append(f"{prefix}_RestartPolicy=0")
    
    # 11. Partial Close [4] × 8 fields = 32 fields
    for partial in range(1, 5):
        inputs.append(f"{prefix}_PartialEnabled{partial}=0")
        inputs.append(f"{prefix}_PartialCycle{partial}={partial + 1}")
        inputs.append(f"{prefix}_PartialMode{partial}=1")  # Mid
        inputs.append(f"{prefix}_PartialBalance{partial}=1")  # Balanced
        inputs.append(f"{prefix}_PartialTrailMode{partial}=0")  # Auto
        inputs.append(f"{prefix}_PartialTrigger{partial}=0")  # Cycle
        inputs.append(f"{prefix}_PartialProfitThreshold{partial}=0.0")
        inputs.append(f"{prefix}_PartialHours{partial}=0")
    
    return inputs

def generate_global_inputs():
    """Generate ~50 global inputs"""
    inputs = []
    
    # Global Settings
    inputs.append("gInput_MagicNumber=777")
    inputs.append("gInput_MagicNumberBuy=777")
    inputs.append("gInput_MagicNumberSell=888")
    inputs.append("gInput_EnableLogs=0")
    inputs.append("gInput_AllowBuy=1")
    inputs.append("gInput_AllowSell=1")
    inputs.append("gInput_MaxSlippage=3")
    inputs.append("gInput_MaxSpread=50")
    inputs.append("gInput_MaxOrders=100")
    inputs.append("gInput_MaxDailyLoss=0")
    inputs.append("gInput_MaxDrawdown=0")
    inputs.append("gInput_AutoCompounding=0")
    inputs.append("gInput_CompoundingPercent=0.0")
    inputs.append("gInput_RiskPercent=1.0")
    inputs.append("gInput_LotSize=0.01")
    inputs.append("gInput_UseMoneyManagement=0")
    inputs.append("gInput_FixedLot=0.01")
    
    # Session Settings
    inputs.append("gInput_TradeMonday=1")
    inputs.append("gInput_TradeTuesday=1")
    inputs.append("gInput_TradeWednesday=1")
    inputs.append("gInput_TradeThursday=1")
    inputs.append("gInput_TradeFriday=1")
    inputs.append("gInput_TradeSaturday=0")
    inputs.append("gInput_TradeSunday=0")
    inputs.append("gInput_StartHour=0")
    inputs.append("gInput_EndHour=24")
    inputs.append("gInput_UseSessionFilter=0")
    inputs.append("gInput_SessionStart=0")
    inputs.append("gInput_SessionEnd=24")
    
    # Filter Settings
    inputs.append("gInput_UseTrendFilter=0")
    inputs.append("gInput_TrendPeriod=14")
    inputs.append("gInput_UseVolatilityFilter=0")
    inputs.append("gInput_VolatilityPeriod=20")
    inputs.append("gInput_UseNewsFilter=0")
    inputs.append("gInput_NewsImpact=3")
    inputs.append("gInput_MinsBeforeNews=30")
    inputs.append("gInput_MinsAfterNews=30")
    
    # Advanced Settings
    inputs.append("gInput_UseVirtualPending=0")
    inputs.append("gInput_VirtualPendingPips=10.0")
    inputs.append("gInput_OrderComment=DAAVILEFX")
    inputs.append("gInput_RequireLicense=0")
    inputs.append("gInput_LicenseServer=https://license.daavfx.com")
    inputs.append("gInput_ShowUI=1")
    inputs.append("gInput_ShowTrails=0")
    inputs.append("gInput_EnableDebug=0")
    inputs.append("gInput_LogLevel=1")
    inputs.append("gInput_SaveStats=1")
    inputs.append("gInput_StatsFile=daavilefx_stats.csv")
    
    return inputs

def generate_massive_setfile():
    """Generate complete massive setfile with all 55,500+ inputs"""
    lines = []
    
    # Header
    lines.append("; DAAVILEFX MASSIVE CONFIGURATION SETFILE")
    lines.append(f"; Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("; Version: 18.0 MASSIVE")
    lines.append("; Platform: MT4")
    lines.append(";")
    lines.append(f"; Structure: {GROUPS} groups × {len(ENGINES)} engines × {len(LOGICS)} logics × {len(DIRECTIONS)} directions")
    lines.append(f"; Total Logic-Directions: {GROUPS * len(ENGINES) * len(LOGICS) * len(DIRECTIONS)}")
    lines.append(f"; Fields per Logic: 88")
    lines.append(f"; Total Logic Inputs: {GROUPS * len(ENGINES) * len(LOGICS) * len(DIRECTIONS) * 88}")
    lines.append(f"; Global Inputs: ~50")
    lines.append(f"; GRAND TOTAL: ~55,500 inputs")
    lines.append("")
    
    # Global Settings Section
    lines.append("; ===========================================")
    lines.append("; GLOBAL SETTINGS")
    lines.append("; ===========================================")
    lines.append("")
    lines.extend(generate_global_inputs())
    lines.append("")
    
    # Logic Inputs Section
    lines.append("; ===========================================")
    lines.append("; LOGIC CONFIGURATIONS (630 logic-directions)")
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
    lines.append(f"; END OF CONFIGURATION")
    lines.append(f"; Total Inputs Generated: {total_inputs + len(generate_global_inputs())}")
    lines.append("; ===========================================")
    
    return '\n'.join(lines)

def main():
    """Generate and save the massive setfile"""
    output_dir = r"D:\trading_ecosystem_11\trading_ecosystem_9.0\main_ecosystem_trading\APPS\dashboard\logic-canvas-main\Vault_Presets"
    output_file = os.path.join(output_dir, "MASSIVE_DAAVILEFX_COMPLETE_v18.set")
    
    print("Generating MASSIVE DAAVILEFX setfile...")
    print(f"Structure: {GROUPS} groups × {len(ENGINES)} engines × {len(LOGICS)} logics × {len(DIRECTIONS)} directions")
    print(f"Expected inputs: ~55,500")
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
    
    print(f"\n✅ Saved to: {output_file}")
    print(f"✅ Total inputs: {len(lines)}")
    print(f"✅ File size: {os.path.getsize(output_file) / (1024 * 1024):.2f} MB")
    
    return output_file

if __name__ == "__main__":
    output_path = main()
    print(f"\nSetfile generated successfully at: {output_path}")
