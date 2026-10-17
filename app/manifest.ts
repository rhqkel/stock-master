import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/', name: 'My Portfolio · 나의 자산', short_name: '내 자산',
    description: 'PC와 핸드폰에서 함께 관리하는 자산 포트폴리오',
    lang: 'ko', start_url: '/', scope: '/', display: 'standalone',
    background_color: '#f8fafc', theme_color: '#2563eb',
    icons: [
      { src: '/icons/portfolio-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/portfolio-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/portfolio-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
