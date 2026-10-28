// Ayudas para construir la interfaz.

/** Crea un elemento: el('button', { class: 'btn', onclick }, 'Texto'). */
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else if (key === 'style') node.style.cssText = value;
    else if (key in node && typeof value !== 'string') node[key] = value;
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

/** Ícono de línea. Los trazos usan el color del texto. */
export function icon(name, size = 20, { filled = false } = {}) {
  const paths = {
    marca: '<circle cx="12" cy="11" r="7"/><path d="M8 20h8"/>',
    fotos: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-8 8"/>',
    instrucciones: '<path d="M5 4h14v16H5z"/><path d="M9 9h6M9 13h6M9 17h3"/>',
    editor: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    feed: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
    respaldo: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    restaurar: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    candado: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    escudo: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/>',
    tacho: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    cerrar: '<path d="M6 6l12 12M18 6 6 18"/>',
    copiar: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    lapiz: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
    guardar: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    aviso: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
    almacen: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    compartir: '<path d="M12 3v12M7 8l5-5 5 5M5 13v7h14v-7"/>',
    biblioteca: '<path d="M4 4h4v16H4zM10 4h4v16h-4z"/><path d="m16 5 3.5-1 3 15.5-3.5 1z"/>',
    estrella: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
    enlace: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    buscar: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
  };
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`;
  return span;
}

let toastTimer = null;

/** Muestra un mensaje breve abajo de la pantalla. */
export function toast(message, { persist = false } = {}) {
  let box = document.getElementById('toast');
  if (!box) {
    box = el('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(box);
  }
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimer);
  if (!persist) toastTimer = setTimeout(() => { box.hidden = true; }, 3200);
}

export function hideToast() {
  const box = document.getElementById('toast');
  if (box) box.hidden = true;
}

/**
 * Ventana de confirmación dentro de la app. Devuelve true si se confirma.
 * danger: el botón de confirmar se pinta como acción que borra.
 */
export function confirmDialog({ title, body, confirmLabel, cancelLabel = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const close = (value) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      if (previous && previous.focus) previous.focus();
      resolve(value);
    };
    const onKey = (event) => { if (event.key === 'Escape') close(false); };
    const confirmButton = el('button', { type: 'button', class: danger ? 'btn btn-danger' : 'btn btn-primary', onclick: () => close(true) }, confirmLabel);
    const overlay = el('div', { class: 'overlay', onclick: (event) => { if (event.target === overlay) close(false); } },
      el('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dialog-title', 'aria-describedby': 'dialog-body' },
        el('h2', { id: 'dialog-title' }, title),
        el('div', { id: 'dialog-body', class: 'dialog-body' }, body),
        el('div', { class: 'dialog-actions' },
          el('button', { type: 'button', class: 'btn btn-quiet', onclick: () => close(false) }, cancelLabel),
          confirmButton)));
    document.body.append(overlay);
    document.addEventListener('keydown', onKey);
    confirmButton.focus();
  });
}

/**
 * Entrega un archivo a la persona.
 * En el iPad abre el menú de compartir (Guardar en Archivos, Guardar imagen…).
 * Donde no existe ese menú, lo descarga.
 * Devuelve 'shared', 'downloaded' o 'cancelled'.
 */
export async function saveFile(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (error) {
      if (error.name === 'AbortError') return 'cancelled';
      // Si el iPad no deja abrir el menú (por ejemplo, porque pasó demasiado tiempo
      // desde el toque), se descarga como alternativa.
    }
  }
  const url = URL.createObjectURL(file);
  const link = el('a', { href: url, download: file.name, style: 'display:none' });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}

/** Copia texto al portapapeles. Devuelve false si el navegador no lo permite. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toLocaleString('es-AR', { maximumFractionDigits: 1 })} GB`;
  if (mb >= 1) return `${mb.toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** "hoy", "ayer", "hace 3 días" o una fecha. */
export function relativeDate(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function daysSince(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}
