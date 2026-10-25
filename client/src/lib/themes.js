import { THEMES } from '../../../shared/themes.js';

export { THEMES };

export const MIN_PER_THEME = 2;
export const MAX_PER_THEME = 50;

export const findTheme = id => THEMES.find(t => t.id === id);

// Bornes du slider : le max est le plus petit nombre de sons disponibles parmi les thèmes sélectionnés.
// counts[id] vaut un nombre, ou 'loading' / 'error' tant que le thème n'est pas compté.
export function sliderBounds(selected, counts) {
  const pending = selected.some(id => typeof counts[id] !== 'number');
  let max = MAX_PER_THEME;
  let limitedBy = null;
  selected.forEach(id => {
    if (counts[id] < max) { max = counts[id]; limitedBy = findTheme(id); }
  });
  return { min: Math.min(MIN_PER_THEME, max), max, limitedBy, pending };
}
