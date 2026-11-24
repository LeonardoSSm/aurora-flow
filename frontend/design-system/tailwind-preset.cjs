// Gerado por design-system/scripts/generate.ts a partir de src/tokens.ts — não edite à mão.
/** @type {import("tailwindcss").Config} */
module.exports = {
  "darkMode": "class",
  "theme": {
    "extend": {
      "colors": {
        "primary": "rgb(var(--color-primary-ch) / <alpha-value>)",
        "primary-container": "rgb(var(--color-primary-dark-ch) / <alpha-value>)",
        "brand": {
          "primary": "rgb(var(--color-primary-ch) / <alpha-value>)",
          "primary-dark": "rgb(var(--color-primary-dark-ch) / <alpha-value>)",
          "primary-light": "rgb(var(--color-primary-light-ch) / <alpha-value>)",
          "secondary": "rgb(var(--color-secondary-ch) / <alpha-value>)",
          "accent": "rgb(var(--color-accent-ch) / <alpha-value>)"
        },
        "surface": "var(--bg-base)",
        "surface-container-low": "var(--bg-surface-2)",
        "surface-container-lowest": "var(--bg-surface)",
        "surface-container-high": "var(--bg-surface-3)",
        "outline-variant": "var(--border-default)",
        "on-surface": "var(--text-primary)",
        "on-surface-variant": "var(--text-secondary)",
        "bg": {
          "base": "var(--bg-base)",
          "surface": "var(--bg-surface)",
          "s2": "var(--bg-surface-2)",
          "s3": "var(--bg-surface-3)",
          "hover": "var(--bg-surface-hover)",
          "input": "var(--bg-input)"
        },
        "border": {
          "default": "var(--border-default)",
          "strong": "var(--border-strong)",
          "subtle": "var(--border-subtle)"
        },
        "tx": {
          "primary": "var(--text-primary)",
          "secondary": "var(--text-secondary)",
          "muted": "var(--text-muted)",
          "ph": "var(--text-placeholder)"
        },
        "status": {
          "success": "var(--color-success)",
          "warning": "var(--color-warning)",
          "danger": "var(--color-error)",
          "info": "var(--color-info)"
        }
      },
      "fontFamily": {
        "headline": [
          "Manrope",
          "Inter",
          "sans-serif"
        ],
        "body": [
          "Inter",
          "sans-serif"
        ]
      },
      "boxShadow": {
        "soft": "0 20px 40px rgba(13, 29, 41, 0.06)"
      },
      "keyframes": {
        "fade": {
          "from": {
            "opacity": "0"
          },
          "to": {
            "opacity": "1"
          }
        }
      },
      "animation": {
        "fade": "fade .18s ease-out"
      }
    }
  }
};
