// ============================================================
// UTILIDAD DE FECHAS — ZONA HORARIA COLOMBIA (America/Bogota)
// ============================================================

/**
 * Devuelve la fecha actual en Colombia en formato AAAA-MM-DD.
 * Evita que después de las 7:00 PM (19:00 UTC-5) la fecha cambie al día siguiente.
 */
export function getFechaColombia(date: Date = new Date()): string {
  // Usa el formateador sueco (sv-SE) que siempre devuelve 'YYYY-MM-DD'
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Devuelve la hora formateada en Colombia (ej: 07:30 PM)
 */
export function getHoraColombia(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/**
 * Devuelve el rango ISO de inicio (00:00:00) y fin (23:59:59) del día en Colombia (-05:00)
 */
export function getInicioFinDiaColombia(fechaYMD?: string) {
  const ymd = fechaYMD || getFechaColombia();
  const inicioIso = new Date(`${ymd}T00:00:00-05:00`).toISOString();
  const finIso = new Date(`${ymd}T23:59:59.999-05:00`).toISOString();
  return { ymd, inicioIso, finIso };
}
