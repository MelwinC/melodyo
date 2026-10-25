import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getRoomState, sendRoom, subscribeRoom } from '../lib/room.js';
import Avatar from './Avatar.jsx';
import Scoreboard from './Scoreboard.jsx';
import { fmtClock, useCountdown } from './useCountdown.js';

const EMPTY = { title: '', artist: '' };
const ordinal = rank => (rank === 1 ? '1er' : `${rank}e`);

// Chanson révélée et résultat du participant pour cette chanson (une fois corrigée)
function Reveal({ song, result }) {
  return (
    <div className="reveal">
      {song.albumImage && <img className="reveal-cover" src={song.albumImage} alt="" />}
      <p>C&apos;était : {song.name} — {song.artists.join(', ')}</p>
      {result && (
        <p className="reveal-result">
          {result.titleOk !== null && <span>Titre {result.titleOk ? '✓' : '✗'}</span>}
          {result.artistOk !== null && <span>Artiste {result.artistOk ? '✓' : '✗'}</span>}
        </p>
      )}
    </div>
  );
}
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

  const saved = state?.you?.answer;
  const open = round?.status === 'open';
  const differs = (saved?.title ?? '') !== draft.title || (saved?.artist ?? '') !== draft.artist;

  // Au réveil d'un téléphone, une réponse peut être partie dans une connexion déjà morte :
  // à chaque nouvel état, si le serveur n'a pas la dernière version (et qu'aucun envoi n'est prévu), on la renvoie
  useEffect(() => {
    if (open && differs && !sendTimer.current) sendRoom({ type: 'answer', position: round.position, ...draft });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.receivedAt]);

  function edit(field, value) {
    const next = { ...draft, [field]: value };
    setDraft(next);
    clearTimeout(sendTimer.current);
    sendTimer.current = setTimeout(() => {
      sendTimer.current = null;
      sendRoom({ type: 'answer', position: round.position, ...next });
    }, SEND_DELAY_MS);
  }

  // Seul l'état du serveur verrouille : un vieil accusé ne bloque pas une manche rouverte
  const locked = round?.status === 'closed';
  const phase = state?.phase;
  const focus = phase === 'correcting' ? state.correction.position : round?.position;
  const song = state?.revealed?.find(r => r.position === focus);
  const result = state?.you?.results?.find(r => r.position === focus);
  const mine = state?.revealed?.length ? state.scores.find(sc => sc.id === participant.id) : null;
  const isSaved = Boolean(saved) && (saved.title || saved.artist) && saved.title === draft.title && saved.artist === draft.artist;

  return (
    <div className="screen seat">
      <header>
        <button className="btn-back" onClick={onLeave}>Quitter</button>
        <h1>{code}</h1>
        <span className="seat-name">{participant.name}</span>
      </header>
      {mine && <p className="seat-score">{mine.score} pts · {ordinal(mine.rank)}</p>}

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

      {phase === 'final' && <Scoreboard scores={state.scores} participants={state.participants} details={state.final.details} />}

      {phase === 'correcting' && <p className="empty-state">Correction en cours — chanson {focus + 1}/{game.total}</p>}

      {phase === 'playing' && !round && <p className="empty-state">La partie commence…</p>}

      {round && phase !== 'final' && (
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

      {song && phase !== 'final' && <Reveal song={song} result={result} />}
    </div>
  );
}
