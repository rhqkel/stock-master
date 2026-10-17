"use client";
import type { ChangeEntry } from '@/lib/portfolio-types';

export default function ChangeHistory({ entries, onRestore }: { entries: ChangeEntry[]; onRestore: (entry: ChangeEntry, confirm: boolean) => void }) {
  return <div className="change-history">
    <p className="change-history-description">직접 추가·수정·삭제한 최근 30건을 보관합니다. 복원하면 자산·월별 기록·설정이 해당 변경 직전 상태로 돌아갑니다. 시세 자동 갱신은 기록하지 않습니다.</p>
    {entries.length === 0 ? <p className="change-history-empty">아직 변경 이력이 없어요. 지금부터 수정한 내용이 여기에 기록됩니다.</p> : <ol>{entries.map((entry, index) => <li key={entry.id}>
      <div><strong>{entry.label}</strong><time dateTime={entry.at}>{new Date(entry.at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })}</time><span>변경 전 자산 {entry.before.assets.length}개 · 월별 기록 {entry.before.history.length}개</span></div>
      <button onClick={() => onRestore(entry, true)}>{index === 0 ? '최근 변경 취소' : '이 변경 직전으로 복원'}</button>
    </li>)}</ol>}
  </div>;
}
