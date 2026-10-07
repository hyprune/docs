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
      { label: 'Start here', items: [{ label: 'The idea', link: '/' }, { label: 'Concepts', slug: 'concepts' }, { label: 'Architecture', slug: 'architecture' }, { label: 'Roadmap', slug: 'roadmap' }] },
      { label: 'RFCs · v0', items: [{ autogenerate: { directory: 'rfcs' } }] },
      { label: 'Build with us', items: [{ slug: 'first-session' }, { slug: 'contributing' }, { slug: 'governance' }, { slug: 'lessons' }] },
    ],
  })],
});
