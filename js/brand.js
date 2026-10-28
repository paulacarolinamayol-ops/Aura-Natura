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
