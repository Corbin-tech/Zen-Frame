// Tailwind runs as a PostCSS plugin (Astro 6 and later dropped the @astrojs/tailwind integration).
// Its settings stay in tailwind.config.mjs; the directives are in src/styles/tailwind.css.
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
