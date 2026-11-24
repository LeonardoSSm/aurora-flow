/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require('./design-system/tailwind-preset.cjs')],
  content: ['./index.html', './src/**/*.{ts,tsx}', './design-system/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Marca, superfícies, bordas e textos vêm do preset @tijucas/ui (design-system/).
        // Aqui ficam só as cores próprias do Tijuca Flow.
        tertiary: '#003923',
        'tertiary-fixed': '#8df7c1',
        error: '#ba1a1a',
        // Modal de configuração de nó (Fluxos) — ver o bloco --nc-* em global.css
        nc: {
          accent:        'var(--nc-accent)',
          'accent-soft': 'var(--nc-accent-soft)',
          btn:           'var(--nc-btn)',
          'btn-hover':   'var(--nc-btn-hover)',
          input:         'var(--nc-input)',
          ok:            'var(--nc-ok)',
          'ok-bg':       'var(--nc-ok-bg)',
          'ok-icon':     'var(--nc-ok-icon)',
          warn:          'var(--nc-warn)',
          'warn-bg':     'var(--nc-warn-bg)',
          danger:        'var(--nc-danger)',
          'danger-bg':   'var(--nc-danger-bg)',
          info:          'var(--nc-info)',
          'info-bg':     'var(--nc-info-bg)',
          'field-var':   'var(--nc-field-var)',
          'field-var-bg': 'var(--nc-field-var-bg)',
          'seg-track':   'var(--nc-seg-track)',
          'seg-active':  'var(--nc-seg-active)',
          backdrop:      'var(--nc-backdrop)',
        },
      },
      boxShadow: {
        'nc-modal': 'var(--nc-shadow)',
        'nc-nav': 'var(--nc-nav-shadow)',
        'nc-ring': 'var(--nc-ring)',
      },
      backgroundImage: {
        'brand-auth': 'var(--bg-auth)',
      },
      // Entrada do modal de Administracao: painel subindo 8px (o fade do backdrop vem do preset).
      keyframes: {
        'admin-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(.985)' },
          to: { opacity: '1', transform: 'none' },
        },
        // Mapa de servicos: fluxo nas arestas solidas e pulso no ponto de degradado/fora do ar.
        svcFlow: {
          to: { strokeDashoffset: '-24' },
        },
        svcPulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '.35' },
        },
        // Ficha da "Lista do ERP" chegando no painel ao lado do formulário.
        'erp-side-in': {
          from: { opacity: '0', transform: 'translateX(40px) scale(.98)', filter: 'blur(6px)' },
          to: { opacity: '1', transform: 'none', filter: 'none' },
        },
        // Ficha da "Lista do ERP" na gaveta (etapa com tabela larga).
        'erp-drawer-in': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'none' },
        },
        'erp-backdrop-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        'admin-in': 'admin-in .22s cubic-bezier(.2,.8,.2,1)',
        'svc-flow': 'svcFlow 1.1s linear infinite',
        'svc-pulse': 'svcPulse 1.4s ease-in-out infinite',
        'erp-side-in': 'erp-side-in .6s cubic-bezier(.22,1,.36,1) both',
        'erp-drawer-in': 'erp-drawer-in .4s cubic-bezier(.22,1,.36,1) both',
        'erp-backdrop-in': 'erp-backdrop-in .3s ease-out both',
      },
    },
  },
  plugins: [],
};
