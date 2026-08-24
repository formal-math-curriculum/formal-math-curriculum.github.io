import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://formal-math-curriculum.github.io',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: 'Formal Mathematics Curriculum',
      description: 'A bounded, versioned course connecting mathematical exposition and Lean 4 evidence.',
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
        { label: 'Course', items: [{ label: 'Start', link: '/' }] },
        { label: 'Method', items: [{ label: 'Authority and claims', link: '/about/method/' }] }
      ],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/formal-math-curriculum' }]
    })
  ]
});

