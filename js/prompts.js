// Instrucciones para ChatGPT.
// Arma el texto a partir de las opciones elegidas y de la ficha del producto.
// No usa el navegador: se puede probar con Node.

// «uses» indica qué opciones aplican a cada tipo: el resto se oculta en la pantalla.
export const PROMPT_TYPES = [
  {
    id: 'retoque', label: 'Retoque', uses: ['format', 'light'],
    help: 'Misma escena: ChatGPT mejora la luz y el color. Adjuntá tu foto.',
  },
  {
    id: 'escenario', label: 'Cambiar el escenario', uses: ['goal', 'format', 'light', 'scene', 'textSpace'],
    help: 'ChatGPT reemplaza todo el fondo por el escenario elegido. Adjuntá tu foto.',
  },
  {
    id: 'fondo', label: 'Solo el fondo', uses: ['goal', 'format', 'light', 'scene', 'textSpace'],
    help: 'ChatGPT crea la escena vacía, sin la esfera. Usá un chat nuevo y no adjuntes fotos. Después, en el Editor, ponés encima tu esfera real.',
  },
];

export const GOALS = [
  { id: 'emocional', label: 'Emocional', scene: 'un momento íntimo y emotivo en casa, con sensación de recuerdo y cariño' },
  { id: 'demostracion', label: 'Demostración', scene: 'una escena clara y ordenada, sin distracciones, donde el producto se entienda de un vistazo' },
  { id: 'venta', label: 'Venta', scene: 'una composición limpia, luminosa y prolija, como una foto de producto profesional' },
  { id: 'regalo', label: 'Regalo', scene: 'un momento de regalo, con papel de seda, una cinta o una tarjeta escrita a mano cerca, sin tapar el producto' },
];

export const PROMPT_FORMATS = [
  { id: '4x5', label: 'Publicación 4:5', text: 'Formato vertical 4:5 (1080 × 1350 px).' },
  { id: '9x16', label: 'Historia o reel 9:16', text: 'Formato vertical 9:16 (1080 × 1920 px), para historias y reels: dejá libres los bordes de arriba y de abajo, donde Instagram pone sus botones.' },
  { id: '1x1', label: 'Cuadrado 1:1', text: 'Formato cuadrado 1:1 (1080 × 1080 px).' },
];

export const PROMPT_LIGHTS = [
  { id: 'dia', label: 'Día cálido', text: 'luz natural cálida de día, entrando por una ventana, con sombras suaves' },
  { id: 'lampara', label: 'Lámpara', text: 'luz cálida de lámpara, de noche, suave y acogedora' },
];

export const SCENES = [
  { id: 'mesa-de-luz', label: 'Mesa de luz', text: 'una mesa de luz de madera clara junto a una cama con ropa de cama de lino' },
  { id: 'estante', label: 'Estante con cámaras analógicas', text: 'un estante de madera en un hogar, con cámaras de fotos analógicas y una planta, desenfocados detrás' },
  { id: 'escritorio', label: 'Escritorio', text: 'un escritorio ordenado, con una libreta y una taza desenfocadas a un costado' },
  { id: 'caja-de-regalo', label: 'Caja de regalo', text: 'una caja de regalo abierta, con papel de seda marfil y una cinta verde salvia' },
  { id: 'living', label: 'Living', text: 'un living cálido, con un sillón de lino y una manta tejida desenfocados detrás' },
];

export const TEXT_SPACES = [
  { id: 'arriba', label: 'Arriba', text: 'Dejá libre el tercio de arriba de la imagen, sin objetos, para poner un texto después.', product: 'en el centro, un poco hacia abajo' },
  { id: 'abajo', label: 'Abajo', text: 'Dejá libre el tercio de abajo de la imagen, sin objetos, para poner un texto después.', product: 'en el centro, un poco hacia arriba' },
  { id: 'costado', label: 'Costado', text: 'Dejá libre la mitad izquierda de la imagen, sin objetos, para poner un texto después.', product: 'en la mitad derecha' },
  { id: 'ninguno', label: 'Sin espacio', text: null, product: 'en el centro' },
];

export function defaultPromptOptions() {
  return { type: 'retoque', goal: 'emocional', format: '4x5', light: 'lampara', scene: 'estante', textSpace: 'arriba', referenceId: null };
}

/** Opciones guardadas por versiones anteriores de la app. */
export function normalizePromptOptions(options) {
  const merged = { ...defaultPromptOptions(), ...options };
  if (merged.type === 'mejorar') merged.type = 'escenario';
  return merged;
}

const find = (list, id) => list.find((item) => item.id === id) || list[0];

function colorsLine(palette) {
  const hex = (name) => (palette.find((c) => c.name === name) || {}).hex;
  return `Colores del ambiente: marfil ${hex('Marfil')}, lino ${hex('Lino')} y verde salvia ${hex('Salvia')}, con algún toque dorado ${hex('Dorado')}.`;
}

// La pantalla de la esfera tiene que verse como en la realidad: sin nitidez ni colores de más.
const SCREEN_RULE = '- La imagen que se ve dentro de la pantalla: idéntica y realista. No la hagas más nítida ni le subas los colores o el brillo: tiene que verse como una pantalla real, con su textura suave.';

function protectedProduct(brand) {
  const rules = (brand.rules || []).filter((r) => r.part || r.text).map((r) => `- ${r.part ? `${r.part}: ` : ''}${r.text}`);
  return [
    'Qué NO cambiar (obligatorio):',
    '- La esfera: misma forma, tamaño, posición y ángulo que en la foto.',
    SCREEN_RULE,
    ...rules,
    '- Si en la foto aparece una mano, dejala igual.',
    '- No agregues textos, logos, reflejos inventados ni objetos sobre la esfera.',
    '',
    'Si algo de esto no se puede respetar, dejá el producto como está.',
  ];
}

/**
 * Devuelve el texto de la instrucción.
 * options: ver defaultPromptOptions(). brand: ficha de marca (usa brand.rules). palette: PALETTE.
 */
export function buildPrompt(rawOptions, brand, palette) {
  const options = normalizePromptOptions(rawOptions);
  const goal = find(GOALS, options.goal);
  const format = find(PROMPT_FORMATS, options.format);
  const light = find(PROMPT_LIGHTS, options.light);
  const scene = find(SCENES, options.scene);
  const space = find(TEXT_SPACES, options.textSpace);

  if (options.type === 'fondo') {
    return [
      'Generá una imagen nueva desde cero. No edites ninguna foto y no uses ninguna imagen anterior de esta conversación.',
      'Es un fondo para un producto: la imagen NO tiene que incluir la esfera ni ningún otro producto. El producto real se agrega después, encima de esta imagen.',
      '',
      'Cómo tiene que ser la escena:',
      `- Lugar: ${scene.text}.`,
      `- Clima: ${goal.scene}.`,
      `- Luz: ${light.text}.`,
      `- ${colorsLine(palette)}`,
      `- Dejá un lugar vacío ${space.product}, sobre una superficie plana vista a la altura de la mirada, para apoyar después una esfera de 7 cm sobre una base negra. Ese lugar tiene que quedar despejado.`,
      space.text ? `- ${space.text}` : null,
      `- ${format.text}`,
      '- Fotografía realista, como sacada con una cámara, no ilustración.',
      '',
      'No agregues:',
      '- Esferas, globos de nieve, lámparas redondas ni objetos parecidos al producto.',
      '- Textos, logos, marcas ni personas.',
    ].filter((line) => line !== null).join('\n');
  }

  if (options.type === 'escenario') {
    return [
      'Usá la foto adjunta y reemplazá TODO el fondo por una escena nueva. La esfera es un producto real: tiene que quedar exactamente igual.',
      '',
      'Escena nueva (cambiarla es obligatorio):',
      `- Lugar: ${scene.text}.`,
      `- Clima: ${goal.scene}.`,
      `- Luz: ${light.text}.`,
      `- ${colorsLine(palette)}`,
      space.text ? `- ${space.text}` : null,
      `- ${format.text}`,
      '- No conserves nada del fondo original: ni muebles, ni lámparas, ni frascos, ni paredes. Solo quedan la esfera, su base y su correa (y la mano, si aparece).',
      '- Ajustá las sombras y los reflejos alrededor de la esfera para que coincidan con la escena nueva, sin cambiar la esfera.',
      '',
      ...protectedProduct(brand),
    ].filter((line) => line !== null).join('\n');
  }

  return [
    'Retocá la foto adjunta sin cambiar la escena. La esfera es un producto real y tiene que quedar exactamente igual.',
    '',
    'Qué mejorar:',
    `- Luz: ${light.text}, más pareja y sin zonas quemadas.`,
    '- Color: natural y equilibrado, sin un tono naranja o azul exagerado.',
    '- Prolijidad: sacá polvo, manchas o pelusas, sin mover ni agregar nada.',
    `- ${format.text} Si hace falta recortar, no cortes la esfera, su base ni su correa.`,
    '',
    'La escena se queda como está: los mismos objetos en el mismo lugar, sin agregar ni quitar ninguno.',
    '',
    ...protectedProduct(brand),
  ].join('\n');
}
