export default function TrackRow({ track, played = true, actionLabel, actionPressed, onAction }) {
  return (
    <div className={`track-row${played ? '' : ' unplayed'}`}>
      {track.albumImage ? <img className="track-row-cover" src={track.albumImage} alt="" /> : <span className="track-row-cover" />}
      <div className="track-row-info">
        <div className="track-row-name">{track.name}</div>
        <div className="track-row-artists">{track.artists.join(', ')}</div>
        {!played && <span className="badge">non jouée</span>}
      </div>
      <button type="button" className="btn btn-ghost btn-sm" aria-pressed={actionPressed} onClick={onAction}>{actionLabel}</button>
    </div>
  );
}
