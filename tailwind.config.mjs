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
			colors: {
				// The accent color. Values come from the chosen scheme in src/styles/preferences.css.
				teal: Object.fromEntries(
					[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map(step => [step, `rgb(var(--accent-${step}) / <alpha-value>)`])
				),
				// Warmth: non-destructive overdue attention. Never use as text in light mode
				// (1.83:1 contrast on Paper); use Pine text (text-gray-900) on bg-warmth/35 in
				// light mode and text-warmth-light on bg-warmth/10 in dark mode (>= 5.1:1 on all
				// dark surfaces, including solid slate-700 hover).
				warmth: {
					DEFAULT: '#D7B36A',
					light: '#E2C382',
				},
				// Brand neutrals. Hex, not CSS variables: the Flowbite plugin reads gray through theme() in
				// JavaScript, which leaves <alpha-value> unreplaced. Warm ink from Paper (50) to Pine (900);
				// 500 stays at 4.5:1 or more on Paper and white.
				gray: {
					50: '#F7F5EF',
					100: '#F0EFE9',
					200: '#E3E3DB',
					300: '#CDCFC7',
					400: '#9DA39A',
					500: '#606D66',
					600: '#4E5C58',
					700: '#394C48',
					800: '#294540',
					900: '#173F3A',
				},
				// Dark-mode surfaces, tinted toward Pine. Each step keeps the luminance of the Tailwind slate
				// step it replaces, so dark-mode contrast stays the same.
				slate: {
					50: '#F9FAFA',
					100: '#F2F5F5',
					200: '#E2E9E8',
					300: '#CBD7D5',
					400: '#8EA6A3',
					500: '#547A75',
					600: '#3E5956',
					700: '#244642',
					800: '#172C2A',
					900: '#0D1918',
					950: '#040707',
				},
			},
		},
	},
	plugins: [require('flowbite/plugin')],
}
