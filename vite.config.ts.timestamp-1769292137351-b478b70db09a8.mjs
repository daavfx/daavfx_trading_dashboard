// vite.config.ts
import { defineConfig, loadEnv } from "file:///C:/Users/neto_/OneDrive/Desktop/trading_ecosystem_9.0/main_ecosystem_trading/APPS/dashboard/logic-canvas-main/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/neto_/OneDrive/Desktop/trading_ecosystem_9.0/main_ecosystem_trading/APPS/dashboard/logic-canvas-main/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
var __vite_injected_original_dirname = "C:\\Users\\neto_\\OneDrive\\Desktop\\trading_ecosystem_9.0\\main_ecosystem_trading\\APPS\\dashboard\\logic-canvas-main";
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = Number(env.PORT || env.VITE_PORT || 1429);
  const strictPort = Boolean(env.PORT || env.VITE_PORT);
  const base = env.VITE_BASE_PATH || "/";
  return {
    base,
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__vite_injected_original_dirname, "./src")
      }
    },
    server: {
      host: true,
      port,
      strictPort,
      watch: {
        ignored: ["**/src-tauri/**"]
      }
    },
    preview: {
      host: true,
      port,
      strictPort
    },
    build: {
      // Tauri supports es2021
      target: process.env.TAURI_PLATFORM == "windows" ? "chrome105" : "safari13",
      // don't minify for debug builds
      minify: !process.env.TAURI_DEBUG ? "esbuild" : false,
      // produce sourcemaps for debug builds
      sourcemap: !!process.env.TAURI_DEBUG
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxuZXRvX1xcXFxPbmVEcml2ZVxcXFxEZXNrdG9wXFxcXHRyYWRpbmdfZWNvc3lzdGVtXzkuMFxcXFxtYWluX2Vjb3N5c3RlbV90cmFkaW5nXFxcXEFQUFNcXFxcZGFzaGJvYXJkXFxcXGxvZ2ljLWNhbnZhcy1tYWluXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxuZXRvX1xcXFxPbmVEcml2ZVxcXFxEZXNrdG9wXFxcXHRyYWRpbmdfZWNvc3lzdGVtXzkuMFxcXFxtYWluX2Vjb3N5c3RlbV90cmFkaW5nXFxcXEFQUFNcXFxcZGFzaGJvYXJkXFxcXGxvZ2ljLWNhbnZhcy1tYWluXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9uZXRvXy9PbmVEcml2ZS9EZXNrdG9wL3RyYWRpbmdfZWNvc3lzdGVtXzkuMC9tYWluX2Vjb3N5c3RlbV90cmFkaW5nL0FQUFMvZGFzaGJvYXJkL2xvZ2ljLWNhbnZhcy1tYWluL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnLCBsb2FkRW52IH0gZnJvbSBcInZpdGVcIjtcbmltcG9ydCByZWFjdCBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tcmVhY3Qtc3djXCI7XG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xuXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfSkgPT4ge1xuICBjb25zdCBlbnYgPSBsb2FkRW52KG1vZGUsIHByb2Nlc3MuY3dkKCksIFwiXCIpO1xuXG4gIGNvbnN0IHBvcnQgPSBOdW1iZXIoZW52LlBPUlQgfHwgZW52LlZJVEVfUE9SVCB8fCAxNDI5KTtcbiAgY29uc3Qgc3RyaWN0UG9ydCA9IEJvb2xlYW4oZW52LlBPUlQgfHwgZW52LlZJVEVfUE9SVCk7XG4gIGNvbnN0IGJhc2UgPSBlbnYuVklURV9CQVNFX1BBVEggfHwgXCIvXCI7XG5cbiAgcmV0dXJuIHtcbiAgICBiYXNlLFxuICAgIHBsdWdpbnM6IFtyZWFjdCgpXSxcbiAgICByZXNvbHZlOiB7XG4gICAgICBhbGlhczoge1xuICAgICAgICBcIkBcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuL3NyY1wiKSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBzZXJ2ZXI6IHtcbiAgICAgIGhvc3Q6IHRydWUsXG4gICAgICBwb3J0LFxuICAgICAgc3RyaWN0UG9ydCxcbiAgICAgIHdhdGNoOiB7XG4gICAgICAgIGlnbm9yZWQ6IFtcIioqL3NyYy10YXVyaS8qKlwiXSxcbiAgICAgIH0sXG4gICAgfSxcbiAgICBwcmV2aWV3OiB7XG4gICAgICBob3N0OiB0cnVlLFxuICAgICAgcG9ydCxcbiAgICAgIHN0cmljdFBvcnQsXG4gICAgfSxcbiAgICBidWlsZDoge1xuICAgICAgLy8gVGF1cmkgc3VwcG9ydHMgZXMyMDIxXG4gICAgICB0YXJnZXQ6IHByb2Nlc3MuZW52LlRBVVJJX1BMQVRGT1JNID09IFwid2luZG93c1wiID8gXCJjaHJvbWUxMDVcIiA6IFwic2FmYXJpMTNcIixcbiAgICAgIC8vIGRvbid0IG1pbmlmeSBmb3IgZGVidWcgYnVpbGRzXG4gICAgICBtaW5pZnk6ICFwcm9jZXNzLmVudi5UQVVSSV9ERUJVRyA/IFwiZXNidWlsZFwiIDogZmFsc2UsXG4gICAgICAvLyBwcm9kdWNlIHNvdXJjZW1hcHMgZm9yIGRlYnVnIGJ1aWxkc1xuICAgICAgc291cmNlbWFwOiAhIXByb2Nlc3MuZW52LlRBVVJJX0RFQlVHLFxuICAgIH0sXG4gIH07XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBNmdCLFNBQVMsY0FBYyxlQUFlO0FBQ25qQixPQUFPLFdBQVc7QUFDbEIsT0FBTyxVQUFVO0FBRmpCLElBQU0sbUNBQW1DO0FBS3pDLElBQU8sc0JBQVEsYUFBYSxDQUFDLEVBQUUsS0FBSyxNQUFNO0FBQ3hDLFFBQU0sTUFBTSxRQUFRLE1BQU0sUUFBUSxJQUFJLEdBQUcsRUFBRTtBQUUzQyxRQUFNLE9BQU8sT0FBTyxJQUFJLFFBQVEsSUFBSSxhQUFhLElBQUk7QUFDckQsUUFBTSxhQUFhLFFBQVEsSUFBSSxRQUFRLElBQUksU0FBUztBQUNwRCxRQUFNLE9BQU8sSUFBSSxrQkFBa0I7QUFFbkMsU0FBTztBQUFBLElBQ0w7QUFBQSxJQUNBLFNBQVMsQ0FBQyxNQUFNLENBQUM7QUFBQSxJQUNqQixTQUFTO0FBQUEsTUFDUCxPQUFPO0FBQUEsUUFDTCxLQUFLLEtBQUssUUFBUSxrQ0FBVyxPQUFPO0FBQUEsTUFDdEM7QUFBQSxJQUNGO0FBQUEsSUFDQSxRQUFRO0FBQUEsTUFDTixNQUFNO0FBQUEsTUFDTjtBQUFBLE1BQ0E7QUFBQSxNQUNBLE9BQU87QUFBQSxRQUNMLFNBQVMsQ0FBQyxpQkFBaUI7QUFBQSxNQUM3QjtBQUFBLElBQ0Y7QUFBQSxJQUNBLFNBQVM7QUFBQSxNQUNQLE1BQU07QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLElBQ0Y7QUFBQSxJQUNBLE9BQU87QUFBQTtBQUFBLE1BRUwsUUFBUSxRQUFRLElBQUksa0JBQWtCLFlBQVksY0FBYztBQUFBO0FBQUEsTUFFaEUsUUFBUSxDQUFDLFFBQVEsSUFBSSxjQUFjLFlBQVk7QUFBQTtBQUFBLE1BRS9DLFdBQVcsQ0FBQyxDQUFDLFFBQVEsSUFBSTtBQUFBLElBQzNCO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
