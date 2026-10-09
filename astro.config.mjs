import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://hyprune.com',
  trailingSlash: 'always',
  integrations: [starlight({
    title: 'Hyprune',
    description: 'What if the computer itself were an explorable world?',
    favicon: '/favicon.svg',
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
        { slug: 'lessons' },
      ] },
      { label: 'RFCs', collapsed: true, items: [{ autogenerate: { directory: 'rfcs' } }] },
    ],
  })],
});
