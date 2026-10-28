// Instrucciones para ChatGPT.
// Arma el texto a partir de las opciones elegidas y de la ficha del producto.
// No usa el navegador: se puede probar con Node.

export const PROMPT_TYPES = [
  { id: 'mejorar', label: 'Mejorar una foto real', help: 'ChatGPT cambia solo el fondo, la luz y el ambiente de tu foto.' },
  { id: 'fondo', label: 'Solo el fondo', help: 'ChatGPT crea la escena vacía. En el Editor (Etapa 4) se pone encima tu esfera real.' },
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
  return { type: 'mejorar', goal: 'emocional', format: '4x5', light: 'lampara', scene: 'estante', textSpace: 'arriba', referenceId: null };
}

const find = (list, id) => list.find((item) => item.id === id) || list[0];

function colorsLine(palette) {
  const hex = (name) => (palette.find((c) => c.name === name) || {}).hex;
  return `Colores del ambiente: marfil ${hex('Marfil')}, lino ${hex('Lino')} y verde salvia ${hex('Salvia')}, con algún toque dorado ${hex('Dorado')}.`;
}

/**
 * Devuelve el texto de la instrucción.
 * options: ver defaultPromptOptions(). brand: ficha de marca (usa brand.rules). palette: PALETTE.
 */
export function buildPrompt(options, brand, palette) {
  const goal = find(GOALS, options.goal);
  const format = find(PROMPT_FORMATS, options.format);
  const light = find(PROMPT_LIGHTS, options.light);
  const scene = find(SCENES, options.scene);
  const space = find(TEXT_SPACES, options.textSpace);
  const rules = (brand.rules || []).filter((r) => r.part || r.text).map((r) => `- ${r.part ? `${r.part}: ` : ''}${r.text}`);

  if (options.type === 'fondo') {
    return [
      'Creá una imagen de fondo para un producto. La imagen NO tiene que incluir la esfera ni ningún otro producto: el producto real se agrega después, encima de esta imagen.',
      '',
      'Cómo tiene que ser la escena:',
      `- Lugar: ${scene.text}.`,
      `- Clima: ${goal.scene}.`,
      `- Luz: ${light.text}.`,
      `- ${colorsLine(palette)}`,
      `- Dejá un lugar vacío ${space.product}, sobre una superficie plana vista a la altura de la mirada, para apoyar después una esfera de 7 cm sobre una base negra. Ese lugar tiene que quedar despejado.`,
      space.text ? `- ${space.text}` : null,
      `- ${format.text}`,
      '',
      'Si adjunto una foto, usala solo como referencia de luz, ángulo y tamaño. No la copies.',
      '',
      'No agregues:',
      '- Esferas, globos de nieve, lámparas redondas ni objetos parecidos al producto.',
      '- Textos, logos, marcas ni personas.',
    ].filter((line) => line !== null).join('\n');
  }

  return [
    'Editá la foto adjunta. La esfera de la foto es un producto real y tiene que quedar exactamente igual.',
    '',
    'Qué cambiar: solo el fondo, la luz y el ambiente.',
    `- Escena: ${scene.text}.`,
    `- Clima: ${goal.scene}.`,
    `- Luz: ${light.text}.`,
    `- ${colorsLine(palette)}`,
    space.text ? `- ${space.text}` : null,
    `- ${format.text}`,
    '',
    'Qué NO cambiar (obligatorio):',
    '- La esfera: misma forma, tamaño, posición y ángulo que en la foto.',
    '- La imagen que se ve dentro de la pantalla: idéntica, sin cambiar colores ni personas.',
    ...rules,
    '- Si en la foto aparece una mano, dejala igual.',
    '- No agregues textos, logos, reflejos inventados ni objetos sobre la esfera.',
    '',
    'Si algo de esto no se puede respetar, dejá el producto como está y cambiá solo el fondo.',
  ].filter((line) => line !== null).join('\n');
}
