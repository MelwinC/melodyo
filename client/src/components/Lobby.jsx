import { toast } from '../lib/toast.js';
import Avatar from './Avatar.jsx';
import QrCode from './QrCode.jsx';

export default function Lobby({ room, state, onClose }) {
  const link = `${location.origin}/r/${room.code}`;
  const participants = state?.participants ?? [];

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast('Lien copié');
    } catch {
      toast(`Copie impossible : ${link}`);
    }
  }

  return (
    <section className="lobby">
      <div className="lobby-join">
        <QrCode text={link} size={140} />
        <div>
          <div className="lobby-label">Code de la room</div>
          <div className="lobby-code">{room.code}</div>
          <div className="lobby-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={copy}>Copier le lien</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Fermer la room</button>
          </div>
        </div>
      </div>
      {participants.length === 0
        ? <p className="lobby-empty">En attente des participants…</p>
        : (
          <>
            <div className="lobby-label">{participants.length} participant{participants.length > 1 ? 's' : ''}</div>
            <ul className="participants">
              {participants.map(p => (
                <li key={p.id} className={p.connected ? '' : 'offline'}>
                  <Avatar avatar={p.avatar} size={28} />
                  <span>{p.name}</span>
                </li>
              ))}
            </ul>
          </>
        )}
    </section>
  );
}
