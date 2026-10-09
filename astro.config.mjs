import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://hyprune.com',
  trailingSlash: 'always',
  integrations: [starlight({
    title: 'Hyprune',
    description: 'What if the computer itself were an explorable world?',
    favicon: '/favicon.svg',
    logo: { light: './src/assets/logo-light.svg', dark: './src/assets/logo-dark.svg', alt: 'Hyprune', replacesTitle: true },
    head: [
      { tag: 'link', attrs: { rel: 'icon', href: '/favicon.ico', sizes: '16x16 32x32 48x48' } },
      { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' } },
      { tag: 'meta', attrs: { property: 'og:image', content: 'https://hyprune.com/og.jpg' } },
      { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
      { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
      { tag: 'meta', attrs: { property: 'og:image:alt', content: 'The Hyprune logo beside the Sun Court terrace in Lumen Reach.' } },
      { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' } },
      { tag: 'meta', attrs: { name: 'twitter:image', content: 'https://hyprune.com/og.jpg' } },
    ],
    social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/hyprune' }],
    customCss: ['./src/styles/custom.css'],
    editLink: { baseUrl: 'https://github.com/hyprune/docs/edit/main/' },
    sidebar: [
      { label: 'Guide', items: [
        { label: 'Overview', link: '/' },
        { label: 'Try Hyprune', slug: 'first-session' },
        { slug: 'concepts' },
        { slug: 'architecture' },
      ] },
      { label: 'Reference', items: [
        { label: 'Schema reference', link: '/reference/schema/' },
        { label: 'World manifest', link: '/reference/schema/world/' },
        { label: 'IPC protocol', link: '/reference/schema/ipc/' },
        { label: 'Input keymap schema', link: '/reference/schema/input/' },
        { label: 'Default keymap', slug: 'keymap' },
      ] },
      { label: 'Project', items: [
        { slug: 'progress' },
        { slug: 'roadmap' },
        { slug: 'contributing' },
        { slug: 'governance' },
        { slug: 'brand' },
        { slug: 'lessons' },
      ] },
      { label: 'RFCs', collapsed: true, items: [{ autogenerate: { directory: 'rfcs' } }] },
    ],
  })],
});
