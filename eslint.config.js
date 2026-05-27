import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
    // 1. Глобальные игноры для всего монорепозитория
    globalIgnores(['**/dist/**', '**/node_modules/**', '**/prisma.config.ts/**']),

    // 2. ОБЩИЕ НАСТРОЙКИ для ВСЕХ TypeScript файлов (и фронт, и бек)
    {
        files: ['packages/**/*.{ts,tsx}'],
        extends: [
            js.configs.recommended,
            ...tseslint.configs.recommended, // ВАЖНО: tseslint.configs возвращает массив, нужен spread (...)
        ],
        languageOptions: {
            parserOptions: {
                // Просим ESLint искать ближайший tsconfig.json к файлу
                project: true,
                tsconfigRootDir: import.meta.dirname,
                project: [
                    './packages/*/tsconfig.json',
                    './packages/*/tsconfig.app.json',
                    './packages/*/tsconfig.node.json',
                ]
            },
        },
        rules: {
            'no-console': 'warn',
        },
    },

    {
        files: ['packages/frontend/**/*.{ts,tsx}'],
        extends: [
            reactHooks.configs.flat.recommended,
            reactRefresh.configs.vite,
        ],
        languageOptions: {
            globals: globals.browser,
        },
        rules: {
            // Специфичные правила для React
            'react-refresh/only-export-components': [
                'warn',
                { allowConstantExport: true },
            ],
        },
    },

    {
        files: ['packages/backend/**/*.ts'],
        languageOptions: {
            globals: globals.node,
        },
        rules: {},
    },
])