// Identidad de Aura Natura. Los colores salen de auranatura.shop.

export const PALETTE = [
  { name: 'Marfil', hex: '#F7F4EC', use: 'Fondo principal' },
  { name: 'Lino', hex: '#E8DDCC', use: 'Placas informativas' },
  { name: 'Bruma', hex: '#E0E6DA', use: 'Testimonios, ideas de regalo' },
  { name: 'Salvia', hex: '#596B53', use: 'Color de marca, frases' },
  { name: 'Carbón', hex: '#302C26', use: 'Textos, placas de venta' },
  { name: 'Dorado', hex: '#BF9F73', use: 'Solo acento' },
];

export const FONTS = [
  { name: 'Fraunces', role: 'Títulos', family: "'Fraunces', Georgia, serif" },
  { name: 'Manrope', role: 'Textos y botones', family: "'Manrope', system-ui, sans-serif" },
];

export const CATEGORIES = [
  { id: 'frente', label: 'Frente' },
  { id: 'trasera', label: 'Trasera' },
  { id: 'uso', label: 'En uso' },
  { id: 'recorte', label: 'Recortes sin fondo' },
  { id: 'sin', label: 'Sin clasificar' },
];

export const LIGHTS = [
  { id: 'sin', label: 'Luz sin definir' },
  { id: 'dia', label: 'Luz de día' },
  { id: 'lampara', label: 'Luz de lámpara' },
];

// Biblioteca: etapas del recorrido del cliente, formatos y lugares de publicación.
export const FUNNEL = [
  { id: 'tofu', label: 'TOFU', help: 'Descubrimiento: gente que todavía no te conoce' },
  { id: 'mofu', label: 'MOFU', help: 'Consideración: gente que te está evaluando' },
  { id: 'bofu', label: 'BOFU', help: 'Compra: gente lista para comprar' },
];

export const FORMATS = [
  { id: 'video', label: 'Video' },
  { id: 'estatico', label: 'Estático' },
  { id: 'carrusel', label: 'Carrusel' },
  { id: 'historia', label: 'Historia' },
];

export const CHANNELS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'meta', label: 'Meta Ads' },
  { id: 'web', label: 'Web' },
];

// Feed: los cinco temas de contenido del manual de marca, con su etapa y su color de placa.
export const FEED_THEMES = [
  { id: 'recuerdos', label: 'Recuerdos', funnel: 'TOFU', color: '#E8DDCC' },
  { id: 'regalo', label: 'Ideas de regalo', funnel: 'TOFU · MOFU', color: '#E0E6DA' },
  { id: 'como-funciona', label: 'Cómo funciona', funnel: 'MOFU', color: '#F7F4EC' },
  { id: 'historias', label: 'Historias reales', funnel: 'MOFU', color: '#596B53' },
  { id: 'oferta', label: 'Oferta', funnel: 'BOFU', color: '#302C26' },
];

export const TONES = [
  { id: 'claro', label: 'Claro' },
  { id: 'oscuro', label: 'Oscuro' },
  { id: 'acento', label: 'Acento' },
];

export function defaultBrand() {
  return {
    rules: [
      { part: 'Esfera', text: 'Frente transparente y brillante, con una pantalla circular que ocupa casi todo el frente.' },
      { part: 'Trasera', text: 'Media esfera oscura mate, con puerto USB-C, interruptor deslizable y rejilla de parlante.' },
      { part: 'Base', text: 'Cilindro negro mate, liso, sin puntos ni botones a la vista.' },
      { part: 'Correa', text: 'Cordón trenzado negro con motas claras y un regulador negro. Sale de la parte de arriba de la esfera.' },
      { part: 'Cable', text: 'Cable de carga USB-C negro.' },
      { part: 'Tamaño', text: '7 cm de diámetro. Entra en la palma de una mano.' },
    ],
    voiceYes: [
      'Tus fotos favoritas, siempre a la vista.',
      'Un regalo que se carga de recuerdos.',
      'Frases cortas que nombran momentos reales: un viaje, un cumpleaños, una mascota.',
    ],
    voiceNo: [
      'El regalo más mágico del universo, con muchos emojis.',
      '¡¡Última oportunidad!! ¡¡No te lo pierdas!!',
      'Promesas que el producto no cumple.',
    ],
  };
}
