import { useState } from 'react';
import Avatar from './Avatar.jsx';

const DEFAULT_AVATAR = { kind: 'preset', value: 'note' };

function Detail({ name, rows }) {
  if (!rows?.length) return <p className="lobby-empty">Aucune réponse</p>;
  return (
    <ul className="score-detail" aria-label={`Réponses de ${name}`}>
      {rows.map(r => (
        <li key={r.position}>
          <div className="score-track">{r.track.name} — {r.track.artists.join(', ')}</div>
          {r.answer
            ? (
              <div className="score-answer">
                <span className={r.titleOk ? 'ok' : 'ko'}>{r.titleOk ? '✓' : '✗'} {r.answer.title || '—'}</span>
                <span className={r.artistOk ? 'ok' : 'ko'}>{r.artistOk ? '✓' : '✗'} {r.answer.artist || '—'}</span>
              </div>
            )
            : <div className="score-answer ko">Pas de réponse</div>}
        </li>
      ))}
    </ul>
  );
}

// Classement final : un clic sur un participant déplie ses réponses chanson par chanson
export default function Scoreboard({ scores, participants, details, onClose }) {
  const [open, setOpen] = useState(null);
  const avatars = new Map(participants.map(p => [p.id, p.avatar]));

  return (
    <section className="scoreboard">
      <h2>🏆 Classement</h2>
      {scores.length === 0 && <p className="lobby-empty">Personne n&apos;a joué</p>}
      <ol className="score-list">
        {scores.map(s => (
          <li key={s.id}>
            <button type="button" className="score-row" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>
              <span className="score-rank">{s.rank}</span>
              <Avatar avatar={avatars.get(s.id) ?? DEFAULT_AVATAR} size={32} />
              <span className="score-name">{s.name}</span>
              <span className="score-points">{s.score} pts</span>
            </button>
            {open === s.id && <Detail name={s.name} rows={details[s.id]} />}
          </li>
        ))}
      </ol>
      {onClose && <button type="button" className="btn btn-green btn-full" onClick={onClose}>Terminer</button>}
    </section>
  );
}
