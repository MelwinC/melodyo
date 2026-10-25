import { useEffect, useState } from 'react';
import { fetchStats } from '../lib/stats.js';
import { findTheme } from '../lib/themes.js';

const pct = value => `${value} %`;
const ordinal = rank => (rank === 1 ? '1er' : `${rank}e`);
const themeName = id => {
  const theme = findTheme(id);
  return theme ? `${theme.emoji} ${theme.label}` : id;
};

export default function Stats() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetchStats().then(setStats).catch(() => setError(true));
  }, []);

  if (error) return <p className="lobby-empty">Statistiques indisponibles</p>;
  if (!stats) return <p className="lobby-empty">Chargement des statistiques…</p>;

  const tiles = [
    ['Parties', stats.games],
    ['Victoires', stats.wins],
    ['Défaites', stats.losses],
    ['Bonnes réponses', pct(stats.overallRate)],
    ['Titres', pct(stats.titleRate)],
    ['Artistes', pct(stats.artistRate)],
    ['Classement moyen', stats.averageRank === null ? '—' : stats.averageRank.toLocaleString('fr-FR')],
    ['Meilleur classement', stats.bestRank === null ? '—' : ordinal(stats.bestRank)],
  ];

  return (
    <section className="stats">
      <h2>Mes statistiques</h2>
      {stats.games === 0
        ? <p className="lobby-empty">Pas encore de partie</p>
        : (
          <>
            <div className="stat-grid">
              {tiles.map(([label, value]) => (
                <div key={label} className="stat-tile">
                  <span className="stat-value">{value}</span>
                  <span className="stat-label">{label}</span>
                </div>
              ))}
            </div>
            <table className="stat-themes">
              <thead>
                <tr><th>Thème</th><th>Sons</th><th>Titres</th><th>Artistes</th></tr>
              </thead>
              <tbody>
                {stats.themes.map(t => (
                  <tr key={t.themeId}>
                    <td>{themeName(t.themeId)}</td>
                    <td>{t.songs}</td>
                    <td>{pct(Math.round((100 * t.titleOk) / t.songs))}</td>
                    <td>{pct(Math.round((100 * t.artistOk) / t.songs))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
    </section>
  );
}
