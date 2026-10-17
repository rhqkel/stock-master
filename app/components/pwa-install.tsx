"use client";

import { useEffect, useState } from 'react';

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PwaInstall() {
  const [visible, setVisible] = useState(false);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [help, setHelp] = useState(false);
  const [ios, setIos] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)');
    const alreadyInstalled = () => standalone.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone;
    const update = () => setVisible(!alreadyInstalled() && sessionStorage.getItem('portfolio:install-dismissed') !== '1');
    queueMicrotask(() => {
      setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
      update();
    });
    const beforeInstall = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); update(); };
    const installed = () => { setVisible(false); setPrompt(null); };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installed);
    standalone.addEventListener('change', update);
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => { /* Installation help remains available if the browser blocks service workers. */ });
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installed);
      standalone.removeEventListener('change', update);
    };
  }, []);
  if (!visible) return null;
  return <aside className="pwa-install" aria-label="홈 화면 설치">
    <div className="pwa-install-row"><div><strong>내 자산을 홈 화면에서 바로</strong><p>아이콘을 추가해 앱처럼 열어보세요.</p></div>
      <button className="pwa-install-button" disabled={busy} aria-expanded={help} aria-controls="pwa-install-help" onClick={async () => {
        if (!prompt) { setHelp(v => !v); return; }
        setBusy(true);
        try { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }
        catch { setHelp(true); }
        finally { setBusy(false); }
      }}>{busy ? '확인 중…' : '홈 화면에 추가'}</button>
      <button className="pwa-install-close" aria-label="이번에는 설치 안내 닫기" onClick={() => { sessionStorage.setItem('portfolio:install-dismissed', '1'); setVisible(false); }}>×</button>
    </div>
    {help && <div id="pwa-install-help" className="pwa-install-help">
      {ios ? <p>아이폰·아이패드에서는 Safari로 이 사이트를 연 뒤 <strong>공유 → 홈 화면에 추가 → 추가</strong>를 눌러주세요.</p>
        : <p>안드로이드 Chrome에서는 <strong>메뉴(⋮) → 홈 화면에 추가 또는 앱 설치</strong>를 선택하세요. PC에서는 브라우저 주소창의 설치 아이콘이나 메뉴를 확인해주세요.</p>}
      <p>설치한 뒤에도 같은 계정으로 로그인하면 됩니다. 시세 조회와 기기 간 동기화에는 인터넷 연결이 필요해요.</p>
    </div>}
  </aside>;
}
