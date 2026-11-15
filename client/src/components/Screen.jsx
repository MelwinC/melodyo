import Icon from './Icon.jsx';

// Écran secondaire : en-tête avec retour et titre
export default function Screen({ title, onBack, children }) {
  return (
    <div className="screen">
      <header>
        <button className="btn-back" onClick={onBack}><Icon name="back" size={16} /> Retour</button>
        <h1>{title}</h1>
        <span className="header-spacer"></span>
      </header>
      {children}
    </div>
  );
}
