import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		fontFamily: {
  			sans: [
  				'Inter',
  				'ui-sans-serif',
  				'system-ui',
  				'sans-serif',
  				'Apple Color Emoji',
  				'Segoe UI Emoji',
  				'Segoe UI Symbol',
  				'Noto Color Emoji'
  			],
  			mono: [
  				'Geist Mono',
  				'ui-monospace',
  				'SFMono-Regular',
  				'Menlo',
  				'Monaco',
  				'Consolas',
  				'Liberation Mono',
  				'Courier New',
  				'monospace'
  			],
  			serif: [
  				'ui-serif',
  				'Georgia',
  				'Cambria',
  				'Times New Roman',
  				'Times',
  				'serif'
  			]
  		},
  		colors: {
  			border: 'hsl(var(--border))',
  			'border-subtle': 'hsl(var(--border-subtle))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			background: {
  				DEFAULT: 'hsl(var(--background))',
  				elevated: 'hsl(var(--background-elevated))',
  				subtle: 'hsl(var(--background-subtle))'
  			},
  			foreground: {
  				DEFAULT: 'hsl(var(--foreground))',
  				muted: 'hsl(var(--foreground-muted))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))',
  				glow: 'hsl(var(--primary-glow))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))',
  				muted: 'hsl(var(--accent-muted))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))',
  				hover: 'hsl(var(--card-hover))'
  			},
  			success: {
  				DEFAULT: 'hsl(var(--success))',
  				foreground: 'hsl(var(--success-foreground))'
  			},
  			warning: {
  				DEFAULT: 'hsl(var(--warning))',
  				foreground: 'hsl(var(--warning-foreground))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			},
  			platform: {
  				mt4: 'hsl(var(--platform-mt4))',
  				mt5: 'hsl(var(--platform-mt5))',
  				python: 'hsl(var(--platform-python))',
  				c: 'hsl(var(--platform-c))',
  				cpp: 'hsl(var(--platform-cpp))',
  				rust: 'hsl(var(--platform-rust))'
  			},
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'fade-in': {
  				from: {
  					opacity: '0',
  					transform: 'translateY(4px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateY(0)'
  				}
  			},
  			'fade-in-scale': {
  				from: {
  					opacity: '0',
  					transform: 'scale(0.95)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'scale(1)'
  				}
  			},
  			'slide-in-right': {
  				from: {
  					transform: 'translateX(100%)'
  				},
  				to: {
  					transform: 'translateX(0)'
  				}
  			},
  			'slide-in-up': {
  				from: {
  					opacity: '0',
  					transform: 'translateY(8px)'
  				},
  				to: {
  					opacity: '1',
  					transform: 'translateY(0)'
  				}
  			},
  			'pulse-glow': {
  				'0%, 100%': {
  					opacity: '1'
  				},
  				'50%': {
  					opacity: '0.7'
  				}
  			},
  			shimmer: {
  				'0%': {
  					backgroundPosition: '-200% 0'
  				},
  				'100%': {
  					backgroundPosition: '200% 0'
  				}
  			},
  			'glow-pulse': {
  				'0%, 100%': {
  					boxShadow: '0 0 20px hsl(43 90% 55% / 0.15)'
  				},
  				'50%': {
  					boxShadow: '0 0 30px hsl(43 90% 55% / 0.25)'
  				}
  			},
  			typing: {
  				from: {
  					width: '0'
  				},
  				to: {
  					width: '100%'
  				}
  			},
  			blink: {
  				'50%': {
  					borderColor: 'transparent'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'fade-in': 'fade-in 0.3s ease-out',
  			'fade-in-scale': 'fade-in-scale 0.2s ease-out',
  			'slide-in-right': 'slide-in-right 0.3s ease-out',
  			'slide-in-up': 'slide-in-up 0.25s ease-out',
  			'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
  			shimmer: 'shimmer 2s linear infinite',
  			'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
  			typing: 'typing 2s steps(20) forwards',
  			blink: 'blink 1s step-end infinite'
  		},
  		boxShadow: {
  			'glow-gold': '0 0 30px hsl(43 90% 55% / 0.12), 0 0 60px hsl(43 90% 55% / 0.06)',
  			'glow-accent': '0 0 20px hsl(175 70% 50% / 0.1)',
  			elevated: '0 12px 40px hsl(0 0% 0% / 0.5)',
  			card: '0 2px 8px hsl(0 0% 0% / 0.3), 0 8px 24px hsl(0 0% 0% / 0.2)',
  			'inner-glow': 'inset 0 1px 0 hsl(45 10% 92% / 0.03)',
  			soft: '0 4px 12px hsl(0 0% 0% / 0.25)'
  		},
  		backgroundImage: {
  			'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
  			'gradient-shine': 'linear-gradient(120deg, transparent 0%, hsl(45 10% 92% / 0.03) 50%, transparent 100%)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
