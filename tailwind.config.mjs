/** @type {import('tailwindcss').Config} */
export default {
	content: [
		'./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
		'./node_modules/flowbite/**/*.js',
	],
	darkMode: 'class',
	theme: {
		extend: {
			transitionProperty: {
				none: 'none',
			},
			// The accent color. Values come from the chosen scheme in src/styles/preferences.css.
			colors: {
				teal: Object.fromEntries(
					[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map(step => [step, `rgb(var(--accent-${step}) / <alpha-value>)`])
				),
			},
		},
	},
	plugins: [require('flowbite/plugin')],
}
