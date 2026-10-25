// Écran secondaire : en-tête avec retour et titre
export default function Screen({ title, onBack, children }) {
  return (
    <div className="screen">
      <header>
        <button className="btn-back" onClick={onBack}>← Retour</button>
        <h1>{title}</h1>
        <span style={{ width: 60 }}></span>
      </header>
      {children}
    </div>
  );
}
