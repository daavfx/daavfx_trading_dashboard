# MT4/MT5 Connection Guide

## How to Connect Your MetaTrader

Since every broker uses different folder names and you may have renamed your MT4 installation, you need to manually select the correct **Common Files** folder.

### Step 1: Find Your MT4 Common Files Folder

1. **Open File Explorer**
2. **Navigate to**: `%AppData%\MetaQuotes\Terminal`
3. **Look for folders** named like:
   - `3294B7A95B19A28C77EC4F447FBBB26D` (random hash)
   - `terminal64.exe - ICMarkets`
   - `terminal64.exe - YourBrokerName`
   - Any folder that ends with your broker name

4. **Double-click the folder** and look for a **"Files"** subfolder
5. **Copy this path** (e.g., `C:\Users\You\AppData\Roaming\MetaQuotes\Terminal\3294B7A...\Files`)

### Step 2: Set the Path in Dashboard

1. **Open Dashboard** → **Settings** → **Data & Storage** tab
2. **Click "Browse"** next to "MT4 Common Files"
3. **Paste or select** the path you found
4. **Click "Save Settings"**

### Step 3: Export Configurations

1. **Open Vault** (folder icon in sidebar)
2. **Click the "Terminal" icon** (orange) next to any file
3. **File is instantly copied** to MT4's Common Files folder
4. **In MT4**: The EA will automatically load the new configuration

### Quick Check

Your path should look something like:
```
C:\Users\[YourName]\AppData\Roaming\MetaQuotes\Terminal\[RANDOM_HASH]\Files
```

Or if you renamed it:
```
C:\Users\[YourName]\AppData\Roaming\MetaQuotes\Terminal\terminal64.exe - ICMarkets\Files
```

### Troubleshooting

**"Path not found" error?**
- Make sure MT4 is installed (not portable version)
- Check if you're looking at the right user profile
- Try the Auto-Detect button first

**File not appearing in MT4?**
- Verify the EA is running in MT4
- Check MT4's "Experts" tab for messages
- Ensure the .set file name matches what the EA expects

**Multiple MT4 instances?**
- You can switch between them by changing the path in Settings
- Or use the "Save to PC" button and manually copy to each MT4

---

## Workflow Summary

```
1. Build Strategy in Dashboard
      ↓
2. Save to Vault (optional)
      ↓
3. Click "Send to MT4" button
      ↓
4. File appears in MT4's Common Files
      ↓
5. EA automatically reads the file
```

That's it! No more manual file copying.
