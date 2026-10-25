import Avatar from './Avatar.jsx';

const EMPTY = { title: '', artist: '', titleOk: null, artistOk: null };

// Validation d'un champ : ✓ / ✗, désactivés pour une réponse vide
function Verdict({ label, value, ok, onSet }) {
  return (
    <div className="verdict">
      <span className="verdict-answer">{value || '—'}</span>
      <button type="button" className="verdict-ok" aria-label={`${label} correct`} aria-pressed={ok === true} disabled={!value} onClick={() => onSet(true)}>✓</button>
      <button type="button" className="verdict-ko" aria-label={`${label} faux`} aria-pressed={ok === false} disabled={!value} onClick={() => onSet(false)}>✗</button>
    </div>
  );
}

export default function Correction({ state, onCorrect, onReveal, onNext }) {
  const { position } = state.correction;
  const revealed = state.revealed.find(r => r.position === position);
  const answers = new Map(state.answers.map(a => [a.participantId, a]));
  const end = state.game.correction === 'end';
  const last = position + 1 >= state.game.total;

  return (
    <section className="correction">
      <div className="correction-head">
        <span>Chanson {position + 1}/{state.game.total}</span>
        {revealed
          ? (
            <span className="correction-track">
              {revealed.albumImage && <img className="correction-cover" src={revealed.albumImage} alt="" />}
              {revealed.name} — {revealed.artists.join(', ')}
            </span>
          )
          : (
            <>
              <span className="correction-hidden">Pas encore révélée</span>
              <button type="button" className="btn btn-green btn-sm" onClick={() => onReveal(position)}>👁 Révéler</button>
            </>
          )}
      </div>
      {state.participants.length === 0
        ? <p className="lobby-empty">Aucun participant : révèle la chanson et continue</p>
        : (
          <ul className="correction-list">
            {state.participants.map(p => {
              const a = answers.get(p.id) ?? EMPTY;
              return (
                <li key={p.id}>
                  <span className="correction-name"><Avatar avatar={p.avatar} size={28} />{p.name}</span>
                  <Verdict label="Titre" value={a.title} ok={a.titleOk} onSet={ok => onCorrect(p.id, 'title', ok)} />
                  <Verdict label="Artiste" value={a.artist} ok={a.artistOk} onSet={ok => onCorrect(p.id, 'artist', ok)} />
                </li>
              );
            })}
          </ul>
        )}
      {end && (
        <button type="button" className="btn btn-green btn-full" onClick={onNext}>
          {last ? 'Voir le classement' : 'Chanson suivante'}
        </button>
      )}
    </section>
  );
}
