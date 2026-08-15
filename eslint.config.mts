import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
		'**/*.js',
		'**/*.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'esbuild.config.mjs', 'version-bump.mjs'],
				},
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		files: ['esbuild.config.mjs', 'version-bump.mjs'],
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
		rules: {
			// Build/release scripts run with Node, never bundled into the plugin.
			'obsidianmd/no-nodejs-modules': 'off',
		},
	},
);
