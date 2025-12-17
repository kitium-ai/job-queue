import { baseConfig, securityConfig, typeScriptConfig } from '@kitiumai/lint/eslint';

export default [
  {
    ignores: ['dist/', 'node_modules/', 'coverage/', '.husky/', '**/*.d.ts'],
  },
  ...baseConfig,
  ...typeScriptConfig,
  securityConfig,
  {
    name: 'database/boundaries-settings',
    settings: {
      'boundaries/alias': null,
    },
  },
  {
    name: 'schemas/overrides',
    rules: {
      'security/detect-object-injection': 'off',
      'no-restricted-imports': 'off'
    },
  },
];
