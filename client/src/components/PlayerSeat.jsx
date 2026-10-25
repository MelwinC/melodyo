import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getRoomState, sendRoom, subscribeRoom } from '../lib/room.js';
import Avatar from './Avatar.jsx';
import { fmtClock, useCountdown } from './useCountdown.js';

const EMPTY = { title: '', artist: '' };
const SEND_DELAY_MS = 400;

// Écran du participant : suit la partie et saisit titre et artiste, envoyés au fil de la frappe
export default function PlayerSeat({ code, participant, onLeave }) {
  const live = useSyncExternalStore(subscribeRoom, getRoomState);
  const state = live.state;
  const game = state?.game;
  const round = game ? state.round : null;
  const remaining = useCountdown(round, live.receivedAt);
  const sendTimer = useRef(null);

  // Nouvelle manche (ou reconnexion) : on repart de la réponse connue du serveur
  const roundKey = round ? `${game.id}:${round.position}` : null;
  const [draftKey, setDraftKey] = useState(roundKey);
  const [draft, setDraft] = useState(state?.you?.answer ?? EMPTY);
  if (roundKey !== draftKey) {
    setDraftKey(roundKey);
    setDraft(state?.you?.answer ?? EMPTY);
  }

  useEffect(() => () => clearTimeout(sendTimer.current), []);

  function edit(field, value) {
    const next = { ...draft, [field]: value };
    setDraft(next);
    clearTimeout(sendTimer.current);
    sendTimer.current = setTimeout(() => sendRoom({ type: 'answer', position: round.position, ...next }), SEND_DELAY_MS);
  }

  const ackClosed = live.lastAck?.status === 'closed' && live.lastAck.position === round?.position;
  const locked = round?.status === 'closed' || ackClosed;
  const saved = state?.you?.answer;
  const isSaved = Boolean(saved) && (saved.title || saved.artist) && saved.title === draft.title && saved.artist === draft.artist;

  return (
    <div className="screen seat">
      <header>
        <button className="btn-back" onClick={onLeave}>Quitter</button>
        <h1>{code}</h1>
        <span className="seat-name">{participant.name}</span>
      </header>

      {live.error === 'forbidden' && <div className="browser-warning">Tu ne fais plus partie de cette room</div>}
      {!live.connected && live.error !== 'forbidden' && <div className="reconnecting">Reconnexion…</div>}

      {!game && (
        <>
          <p className="empty-state">En attente du lancement…</p>
          <ul className="participants">
            {(state?.participants ?? []).map(p => (
              <li key={p.id} className={p.connected ? '' : 'offline'}><Avatar avatar={p.avatar} size={28} /><span>{p.name}</span></li>
            ))}
          </ul>
        </>
      )}

      {game && !round && <p className="empty-state">La partie commence…</p>}

      {round && (
        <div className="answer-card">
          <div className="answer-head">
            <span>Son {round.position + 1}/{game.total}</span>
            <span className="answer-timer">{round.paused ? 'En pause' : fmtClock(remaining)}</span>
          </div>
          <label>
            Titre
            <input className="input" value={draft.title} disabled={locked} maxLength={100}
              onChange={e => edit('title', e.target.value)} autoComplete="off" />
          </label>
          <label>
            Artiste
            <input className="input" value={draft.artist} disabled={locked} maxLength={100}
              onChange={e => edit('artist', e.target.value)} autoComplete="off" />
          </label>
          {locked && <p className="answer-locked">Réponses verrouillées</p>}
          {!locked && isSaved && <p className="answer-saved">Enregistré ✓</p>}
        </div>
      )}
    </div>
  );
}
