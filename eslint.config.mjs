import nextConfig from 'eslint-config-next/core-web-vitals'

const config = [
  // Bộ khung tạm (staging để tự merge) — không lint, xem .gitignore
  { ignores: ['_framework-dropins/**'] },
  ...nextConfig,
  {
    rules: {
      // React Compiler rules (react-hooks v5) quá strict với code hiện tại
      // Các pattern fetch-in-effect và inline component là hợp lệ trong dự án này
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/incompatible-library': 'off',
    },
  },
]

export default config
