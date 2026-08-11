/** @type {import('tailwindcss').Config} */
export default {
	content: ["./src/mainview/**/*.{html,js,ts,jsx,tsx}"],
	theme: {
		extend: {
			colors: {
				sidebar: "#F7F7F5",
				"border-subtle": "#EDEDEB",
				"text-primary": "#37352F",
				"text-secondary": "#9B9A97",
				accent: "#5B6BF5",
				"sidebar-text": "#5f5e5b",
				"traffic-red": "#FF5F56",
				"traffic-yellow": "#FFBD2E",
				"traffic-green": "#28C840",
			},
		},
	},
	plugins: [
		require('@tailwindcss/typography'),
	],
};
