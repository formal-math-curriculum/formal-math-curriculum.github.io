import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://formal-math-curriculum.github.io',
  trailingSlash: 'always',
  integrations: [
    sitemap({
      filter: (page) => !new URL(page).pathname.startsWith('/validation/')
    }),
    starlight({
      title: 'Formal Mathematics Curriculum',
      description: 'A bounded, versioned course connecting mathematical exposition and Lean 4 evidence.',
      disable404Route: true,
      customCss: ['./src/styles/custom.css'],
      components: {
        ThemeProvider: './src/components/PreferenceProvider.astro',
        ThemeSelect: './src/components/PreferenceControls.astro'
      },
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' }
      },
      sidebar: [
        { label: 'Course', items: [
          { label: 'Course home', link: '/' },
          { label: 'Arithmetic to algebra', link: '/content/p5m56c0001/arithmetic-to-algebra/' }
        ] },
        { label: 'Method', items: [{ label: 'Authority and claims', link: '/about/method/' }] }
      ],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/formal-math-curriculum' }]
    })
  ]
});
