// Shared UI label helpers for raw data codes.

const CATEGORY_LABELS = {
  es: {
    Berries: 'Frutos rojos',
    Cattle_dairy: 'Vacuno de leche',
    Cattle_nondairy: 'Vacuno de carne',
    Cereals: 'Cereales',
    Chickens_broilers: 'Pollos de engorde',
    Chickens_poultry: 'Aves de corral',
    Coffee_Cocoa_Tea: 'Café, cacao y té',
    Crop_others: 'Otros cultivos',
    Equinos: 'Equinos',
    'Fibre Crops Primary': 'Cultivos de fibra',
    Fruit_tree: 'Frutales',
    Grapes: 'Uva',
    Oil_Crops_extensive: 'Oleaginosas extensivas',
    Oil_Crops_fruits: 'Oleaginosas de fruto',
    Oil_Crops_olives: 'Olivar',
    Oil_Crops_palm: 'Palma aceitera',
    Other_animals: 'Otros animales',
    Pigs: 'Porcino',
    Pulses: 'Legumbres',
    Rice: 'Arroz',
    'Roots and Tubers': 'Raíces y tubérculos',
    Rubber: 'Caucho',
    Sheep_goats: 'Ovino y caprino',
    'Sugar Crops Primary': 'Cultivos azucareros',
    Tobacco: 'Tabaco',
    Treenuts: 'Frutos secos',
    Vegetables: 'Hortalizas',
  },
  en: {
    Berries: 'Berries',
    Cattle_dairy: 'Dairy cattle',
    Cattle_nondairy: 'Non-dairy cattle',
    Cereals: 'Cereals',
    Chickens_broilers: 'Broiler chickens',
    Chickens_poultry: 'Poultry',
    Coffee_Cocoa_Tea: 'Coffee, cocoa and tea',
    Crop_others: 'Other crops',
    Equinos: 'Equines',
    'Fibre Crops Primary': 'Fibre crops',
    Fruit_tree: 'Fruit trees',
    Grapes: 'Grapes',
    Oil_Crops_extensive: 'Extensive oil crops',
    Oil_Crops_fruits: 'Fruit oil crops',
    Oil_Crops_olives: 'Olives',
    Oil_Crops_palm: 'Oil palm',
    Other_animals: 'Other animals',
    Pigs: 'Pigs',
    Pulses: 'Pulses',
    Rice: 'Rice',
    'Roots and Tubers': 'Roots and tubers',
    Rubber: 'Rubber',
    Sheep_goats: 'Sheep and goats',
    'Sugar Crops Primary': 'Sugar crops',
    Tobacco: 'Tobacco',
    Treenuts: 'Tree nuts',
    Vegetables: 'Vegetables',
  },
};

export function formatCategoryLabel(value, lang = 'es') {
  if (!value) return lang === 'en' ? 'All categories' : 'Todas las categorías';
  const labels = CATEGORY_LABELS[lang] || CATEGORY_LABELS.es;
  if (labels[value]) return labels[value];
  return cleanupRawLabel(value);
}

export function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanupRawLabel(value) {
  const cleaned = String(value || '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

