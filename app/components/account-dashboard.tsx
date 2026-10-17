"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase';
import { emptyPortfolio, readLocal, validPortfolio, writeLocal, type PortfolioData } from '@/lib/portfolio-storage';
import PortfolioDashboard from './portfolio-dashboard';

export default function AccountDashboard() {
  const [client] = useState(getSupabase);
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(!!client);
  const [guest, setGuest] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup' | 'reset' | 'password'>('login');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null); setChecking(false);
      if (event === 'PASSWORD_RECOVERY') setMode('password');
    });
    return () => data.subscription.unsubscribe();
  }, [client]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client) return;
    setBusy(true); setMessage('');
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') || '').trim();
    const password = String(form.get('password') || '');
    try {
      if (mode === 'password') {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        setMode('login'); setMessage('비밀번호를 변경했습니다.');
      } else if (mode === 'reset') {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw error;
        setMessage('등록된 이메일이라면 비밀번호 재설정 링크가 발송됩니다.');
      } else if (mode === 'signup') {
        const { error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        setMessage('이메일의 인증 링크를 확인한 뒤 로그인해주세요.');
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch { setMessage('처리하지 못했습니다. 입력 정보·이메일 인증 여부를 확인하거나 잠시 후 재시도해주세요.'); }
    finally { setBusy(false); }
  }
  if (checking) return <main className="account-shell" role="status">로그인 확인 중…</main>;
  if (guest) return <><div className="account-bar"><span>이 기기에만 저장 중</span><button onClick={() => setGuest(false)}>로그인 화면</button></div><PortfolioDashboard /></>;
  if (user && mode !== 'password') return <CloudPortfolio key={user.id} user={user} onLogout={async () => {
    const { error } = await client!.auth.signOut({ scope: 'local' }); if (error) throw error;
  }} />;
  return <main className="account-shell"><section className="account-card">
    <p className="account-eyebrow">MY PORTFOLIO</p>
    <h1>{mode === 'signup' ? '계정 만들기' : mode === 'reset' ? '비밀번호 찾기' : mode === 'password' ? '새 비밀번호 설정' : '내 자산, 어디서든 함께'}</h1>
    <p>PC와 핸드폰에서 같은 계정으로 자산을 관리하세요.</p>
    {!client ? <p role="status">클라우드 로그인 연결을 준비 중입니다. 기존 기기 저장 모드를 사용할 수 있습니다.</p> : <form onSubmit={submit}>
      {mode !== 'password' && <label>이메일<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>}
      {mode !== 'reset' && <label>비밀번호<input name="password" type="password" minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required placeholder="8자 이상" /></label>}
      <button className="account-primary" disabled={busy}>{busy ? '처리 중…' : mode === 'signup' ? '회원가입' : mode === 'reset' ? '재설정 메일 보내기' : mode === 'password' ? '비밀번호 변경' : '로그인'}</button>
    </form>}
    <p role="status" aria-live="polite">{message}</p>
    {client && mode !== 'password' && <div className="account-links">
      <button disabled={busy} onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setMessage(''); }}>{mode === 'signup' ? '로그인으로 돌아가기' : '회원가입'}</button>
      <button disabled={busy} onClick={() => { setMode(mode === 'reset' ? 'login' : 'reset'); setMessage(''); }}>{mode === 'reset' ? '로그인' : '비밀번호 찾기'}</button>
    </div>}
    {mode !== 'password' && <button className="account-local" onClick={() => setGuest(true)}>기존 기기 저장 모드로 계속</button>}
  </section></main>;
}

function CloudPortfolio({ user, onLogout }: { user: User; onLogout: () => Promise<void> }) {
  const client = getSupabase()!;
  const prefix = `account:${user.id}:`;
  const [phase, setPhase] = useState<'loading' | 'new' | 'ready' | 'error'>('loading');
  const [generation, setGeneration] = useState(0);
  const [status, setStatus] = useState('계정 데이터 불러오는 중…');
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState(false);
  const current = useRef<PortfolioData | null>(null);
  const saved = useRef('');
  const revision = useRef(0);
  const locked = useRef(false);
  const mounted = useRef(true);
  function apply(data: unknown, version: number) {
    if (!validPortfolio(data)) throw new Error('클라우드 데이터 형식 오류');
    writeLocal(prefix, data);
    current.current = data; saved.current = JSON.stringify(data); revision.current = version;
    setGeneration(g => g + 1); setConflict(false); setPhase('ready'); setPending(false);
    setStatus('클라우드와 동기화됨');
  }
  async function load(discardLocal = false) {
    try {
      const { data, error } = await client.from('portfolios').select('data,revision').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      if (!mounted.current) return;
      if (data) {
        const queued = localStorage.getItem(prefix + 'pendingRevision');
        if (!discardLocal && queued !== null) {
          const local = readLocal(prefix);
          if (!validPortfolio(local)) throw new Error('기기 데이터 형식 오류');
          current.current = local; saved.current = JSON.stringify(data.data);
          revision.current = Number(queued);
          setPhase('ready'); setGeneration(g => g + 1); setPending(true);
          setConflict(data.revision !== Number(queued));
          setStatus(data.revision !== Number(queued) ? '미저장 내용과 다른 기기의 변경이 겹쳤습니다. JSON 백업 후 최신 데이터를 불러와주세요.' : '이 기기의 미저장 변경사항을 다시 동기화합니다.');
        } else {
          localStorage.removeItem(prefix + 'pendingRevision');
          apply(data.data, data.revision);
        }
      }
      else { setPhase('new'); setStatus('처음 사용할 데이터를 선택해주세요.'); }
    } catch { if (mounted.current) { setPhase('error'); setStatus('계정 데이터를 불러오지 못했습니다. 연결과 저장소 설정을 확인해주세요.'); } }
  }
  async function create(importExisting: boolean) {
    if (locked.current) return;
    locked.current = true; setPending(true);
    try {
      const payload = importExisting ? readLocal() : emptyPortfolio;
      if (!validPortfolio(payload)) throw new Error('기기 데이터 형식 오류');
      const { data, error } = await client.from('portfolios').insert({ user_id: user.id, data: payload }).select('data,revision').single();
      if (error) throw error;
      if (mounted.current) apply(data.data, data.revision);
    } catch { setStatus('초기 저장에 실패했습니다. 다시 시도하거나 계정 데이터를 다시 불러와주세요.'); }
    finally { locked.current = false; setPending(false); }
  }
  useEffect(() => {
    mounted.current = true;
    queueMicrotask(() => { if (mounted.current) void load(); });
    return () => { mounted.current = false; };
    // This component is remounted for every account change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (phase !== 'ready' || conflict) return;
    let ticks = 0;
    async function sync() {
      if (locked.current || !current.current) return;
      const snapshot = current.current;
      const encoded = JSON.stringify(snapshot);
      const dirty = encoded !== saved.current;
      if (!dirty && ++ticks % 10 !== 0) return;
      locked.current = true;
      try {
        if (dirty) {
          setStatus('클라우드에 저장 중…');
          const { data, error } = await client.from('portfolios')
            .update({ data: snapshot, revision: revision.current + 1, updated_at: new Date().toISOString() })
            .eq('user_id', user.id).eq('revision', revision.current).select('revision').maybeSingle();
          if (error) throw error;
          if (!mounted.current) return;
          if (!data) { setConflict(true); setStatus('다른 기기에서 변경되었습니다. 현재 내용을 JSON으로 백업한 뒤 최신 데이터를 불러와주세요.'); return; }
          saved.current = encoded; revision.current = data.revision;
          const stillDirty = JSON.stringify(current.current) !== encoded;
          if (stillDirty) localStorage.setItem(prefix + 'pendingRevision', String(data.revision));
          else localStorage.removeItem(prefix + 'pendingRevision');
          setPending(stillDirty); setStatus(stillDirty ? '변경사항 저장 대기 중…' : '클라우드와 동기화됨');
        } else {
          const { data, error } = await client.from('portfolios').select('data,revision').eq('user_id', user.id).single();
          if (error) throw error;
          if (!mounted.current) return;
          if (data.revision !== revision.current) {
            if (JSON.stringify(current.current) === saved.current) apply(data.data, data.revision);
            else { setConflict(true); setStatus('다른 기기의 변경과 겹쳤습니다. JSON 백업 후 최신 데이터를 불러와주세요.'); }
          } else setStatus('클라우드와 동기화됨');
        }
      } catch { if (mounted.current) setStatus('클라우드 연결 실패 · 변경사항은 이 기기에 보관 중이며 자동 재시도합니다.'); }
      finally { locked.current = false; }
    }
    const timer = window.setInterval(() => void sync(), 1500);
    return () => window.clearInterval(timer);
    // Refs hold the latest snapshot without restarting the sync timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, conflict]);
  useEffect(() => {
    if (!pending && !conflict) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending, conflict]);
  return <>
    <div className="account-bar"><div><strong>{user.email}</strong><p role="status" aria-live="polite">{status}</p></div><div className="account-links">
      {(conflict || phase === 'error' || phase === 'new') && <button onClick={() => {
        if (!conflict || window.confirm('현재 내용을 JSON으로 백업했나요? 최신 데이터로 화면을 교체합니다.')) { setPhase('loading'); void load(true); }
      }}>계정 데이터 다시 불러오기</button>}
      <button disabled={pending || conflict} onClick={async () => {
        try { await onLogout(); } catch { setStatus('로그아웃에 실패했습니다. 다시 시도해주세요.'); }
      }}>로그아웃{pending ? ' (저장 대기)' : ''}</button>
    </div></div>
    {phase === 'new' && <main className="account-shell"><section className="account-card"><h1>첫 포트폴리오 시작</h1><p>가져오기는 이 브라우저에 저장된 자산에 적용됩니다. 기존 데이터는 기기에 그대로 남습니다.</p><button className="account-primary" disabled={pending} onClick={() => void create(true)}>이 기기의 기존 데이터 가져오기</button><button className="account-local" disabled={pending} onClick={() => void create(false)}>빈 포트폴리오로 시작</button></section></main>}
    {phase === 'loading' && <main className="account-shell" role="status">자산을 불러오는 중…</main>}
    {phase === 'ready' && <PortfolioDashboard key={generation} storagePrefix={prefix} onSnapshot={data => {
      current.current = data;
      const dirty = JSON.stringify(data) !== saved.current;
      if (dirty) localStorage.setItem(prefix + 'pendingRevision', String(revision.current));
      setPending(dirty);
    }} />}
  </>;
}
