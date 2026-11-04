import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'coverage/**', 'next-env.d.ts', 'src/generated/**']),
  {
    // `const { omitted: _omitted, ...rest } = obj` is the idiomatic way to drop a field
    rules: { '@typescript-eslint/no-unused-vars': ['warn', { ignoreRestSiblings: true }] },
  },
]);

export default eslintConfig;
