import { useEffect, useState } from 'react';
import { connectRoom, disconnectRoom, getRoomInfo, joinRoom, myParticipant } from '../lib/room.js';
import { messageFor } from '../lib/session.js';
import PlayerSeat from './PlayerSeat.jsx';
import Screen from './Screen.jsx';

// Rejoindre une room comme participant : par le lien (/r/CODE) ou en tapant le code
export default function Join({ code: initialCode, user, onLeave }) {
  const [code, setCode] = useState(initialCode);
  const [room, setRoom] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [seat, setSeat] = useState(null);

  // Room trouvée : le lien va dans l'adresse (un rechargement y revient) et, si l'appareil
  // a déjà rejoint (rechargement, veille), il reprend directement sa place
  function showRoom(found) {
    history.replaceState({}, '', `/r/${found.code}`);
    setRoom(found);
    return myParticipant(found.code).then(participant => {
      if (!participant) return;
      connectRoom(found.code, 'player');
      setSeat({ code: found.code, participant });
    });
  }

  useEffect(() => {
    if (!initialCode) return;
    getRoomInfo(initialCode).then(showRoom).catch(err => setError(messageFor(err.code)));
  }, [initialCode]);

  async function lookup(e) {
    e.preventDefault();
    setError('');
    try {
      await showRoom(await getRoomInfo(code));
    } catch (err) {
      setError(messageFor(err.code));
    }
  }

  async function join(guestName) {
    setBusy(true);
    setError('');
    try {
      const participant = await joinRoom(room.code, guestName);
      connectRoom(room.code, 'player');
      setSeat({ code: room.code, participant });
    } catch (err) {
      setError(messageFor(err.code));
      setBusy(false);
    }
  }

  if (seat) {
    return <PlayerSeat code={seat.code} participant={seat.participant} onLeave={() => { disconnectRoom(); onLeave(); }} />;
  }

  return (
    <Screen title="Rejoindre une partie" onBack={onLeave}>
      <div className="form join">
        {!room && (
          <form className="auth-form" onSubmit={lookup}>
            <label>
              Code de la room
              <input className="input room-code-input" value={code} onChange={e => setCode(e.target.value)}
                autoCapitalize="characters" autoComplete="off" required />
            </label>
            <button className="btn btn-green btn-full">Continuer</button>
          </form>
        )}
        {room && (
          <>
            <p className="join-room">Room de {room.hostName}</p>
            <p className="lobby-code join-code">{room.code}</p>
            {user && (
              <button type="button" className="btn btn-green btn-full" disabled={busy} onClick={() => join(undefined)}>
                Jouer avec mon compte ({user.username})
              </button>
            )}
            <form className="auth-form" onSubmit={e => { e.preventDefault(); join(name); }}>
              <label>
                Nom de ton équipe
                <input className="input" value={name} onChange={e => setName(e.target.value)} maxLength={20} required />
              </label>
              <button className="btn btn-ghost btn-full" disabled={busy}>Rejoindre en invité</button>
            </form>
          </>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </Screen>
  );
}
