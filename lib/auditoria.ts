// Reconciliacion y deteccion de huecos.
//
// TODO lo que sigue es deterministico. El modelo de lenguaje se usa despues,
// para priorizar y explicar lo que esto ya calculo, nunca para calcularlo: un
// LLM que "revisa tus finanzas" devuelve hallazgos plausibles e inventados, y
// sobre estos numeros se toman decisiones.
//
// La diferencia practica: si la app dice "te falta cargar el recibo de agosto",
// eso salio de comparar dos listas, no de que un modelo lo haya intuido.

export type Severidad = 'alta' | 'media' | 'baja';

export type Hallazgo = {
  id: string;
  severidad: Severidad;
  titulo: string;
  detalle: string;
  accion?: string;
};

export type DatosAuditoria = {
  cierres: { periodo: string; ingresoArs: number; gastoArs: number; ahorroArs: number; tasaAhorro: number | null; porCategoria: Record<string, number> }[];
  gastos: { periodo: string; concepto: string; categoria: string; montoArs: number }[];
  metas: { nombre: string; montoObjetivo: number; moneda: string; fechaObjetivo: string | null }[];
  tenencias: { activo: string; cantidad: number }[];
  activosConLibro: string[];
  conexiones: { etiqueta: string; estado: string; ultimoSync: Date | null }[];
  /** Plata prestada a personas, con lo que falta cobrar. Opcional: el resto de
   *  la auditoria no depende de esto y no queremos romper a quien no lo pase. */
  fiados?: { persona: string; pendiente: number; moneda: string; diasDesde: number | null; huboDevolucion: boolean }[];
  ahorroAcumuladoUsd: number;
  tipoCambioArs: number;
  hoy: string;   // YYYY-MM
};

const mesesEntre = (a: string, b: string): number => {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb * 12 + mb) - (ya * 12 + ma);
};

const sumarMeses = (p: string, n: number): string => {
  const [y, m] = p.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

export function auditar(d: DatosAuditoria): Hallazgo[] {
  const out: Hallazgo[] = [];
  const cierres = [...d.cierres].sort((a, b) => a.periodo.localeCompare(b.periodo));

  // --- Huecos en la serie -------------------------------------------------
  if (cierres.length >= 2) {
    const desde = cierres[0].periodo;
    const hasta = cierres[cierres.length - 1].periodo;
    const presentes = new Set(cierres.map(c => c.periodo));
    const faltantes: string[] = [];
    for (let i = 0; i <= mesesEntre(desde, hasta); i++) {
      const p = sumarMeses(desde, i);
      if (!presentes.has(p)) faltantes.push(p);
    }
    if (faltantes.length) {
      out.push({
        id: 'meses-faltantes',
        severidad: 'media',
        titulo: `${faltantes.length} ${faltantes.length === 1 ? 'mes sin datos' : 'meses sin datos'} en el medio`,
        detalle: `No hay nada cargado en ${faltantes.join(', ')}, entre meses que si tienen datos. El promedio y las proyecciones se calculan sobre lo que hay, asi que salen sesgados.`,
        accion: 'Subi los resumenes de esos meses.',
      });
    }
  }

  // --- Meses sin recibo ---------------------------------------------------
  // Sin ingreso, el ahorro del mes da negativo y arrastra todos los promedios.
  const sinIngreso = cierres.filter(c => c.ingresoArs === 0);
  if (sinIngreso.length) {
    out.push({
      id: 'meses-sin-recibo',
      severidad: 'alta',
      titulo: `${sinIngreso.length} ${sinIngreso.length === 1 ? 'mes' : 'meses'} con gastos pero sin sueldo cargado`,
      detalle: `En ${sinIngreso.map(c => c.periodo).join(', ')} hay gastos pero ningun recibo. El ahorro de esos meses figura como perdida total, y eso ensucia el promedio que usan las metas y la proyeccion.`,
      accion: 'Carga el recibo de sueldo de esos meses.',
    });
  }

  // --- Gasto recurrente que falta este mes --------------------------------
  // El hallazgo mas util: si pagaste luz todos los meses y este no aparece,
  // casi seguro falta cargarla, no es que no la pagaste.
  const ultimo = cierres[cierres.length - 1]?.periodo;
  if (ultimo && cierres.length >= 3) {
    const previos = cierres.slice(-4, -1).map(c => c.periodo);
    const conceptoNormal = (c: string) => c.toLowerCase().replace(/\d+/g, '').trim();

    const recurrentes = new Map<string, number>();
    for (const p of previos) {
      const delMes = new Set(d.gastos.filter(g => g.periodo === p).map(g => conceptoNormal(g.concepto)));
      for (const c of delMes) recurrentes.set(c, (recurrentes.get(c) ?? 0) + 1);
    }

    const esteMes = new Set(d.gastos.filter(g => g.periodo === ultimo).map(g => conceptoNormal(g.concepto)));
    const faltan = [...recurrentes.entries()]
      .filter(([c, veces]) => veces >= previos.length && !esteMes.has(c))
      .map(([c]) => c);

    if (faltan.length) {
      out.push({
        id: 'recurrente-faltante',
        severidad: 'alta',
        titulo: `Falta cargar ${faltan.length === 1 ? 'un gasto habitual' : 'gastos habituales'} de ${ultimo}`,
        detalle: `Aparecen todos los meses anteriores pero no en ${ultimo}: ${faltan.join(', ')}. Si ya los pagaste, el gasto del mes esta subestimado y el ahorro parece mayor de lo que fue.`,
        accion: 'Subi la boleta o anotalo por texto desde Gastos.',
      });
    }
  }

  // --- Tenencias sin costo de entrada -------------------------------------
  const conLibro = new Set(d.activosConLibro);
  const sinCosto = d.tenencias.filter(t => t.cantidad > 0 && !conLibro.has(t.activo));
  if (sinCosto.length) {
    out.push({
      id: 'tenencias-sin-costo',
      severidad: 'media',
      titulo: `${sinCosto.length} ${sinCosto.length === 1 ? 'activo' : 'activos'} sin precio de entrada`,
      detalle: `Tenes ${sinCosto.map(t => t.activo).join(', ')} pero no hay compras cargadas, asi que se ve cuanto vale y no cuanto ganaste. Una foto del portafolio no dice a que precio compraste.`,
      accion: 'Anota las compras en Portafolio.',
    });
  }

  // --- Conexiones que no estan trayendo datos -----------------------------
  const rotas = d.conexiones.filter(c => c.estado === 'ERROR' || c.estado === 'VENCIDA');
  if (rotas.length) {
    out.push({
      id: 'conexiones-rotas',
      severidad: 'alta',
      titulo: `${rotas.length} ${rotas.length === 1 ? 'conexion' : 'conexiones'} sin funcionar`,
      detalle: `${rotas.map(c => c.etiqueta).join(', ')} no esta sincronizando. Binance vence las claves sin restriccion de IP a los 30 dias, asi que puede ser eso.`,
      accion: 'Genera una clave nueva y actualiza la conexion.',
    });
  }

  const viejas = d.conexiones.filter(c => {
    if (c.estado !== 'ACTIVA' || !c.ultimoSync) return false;
    return Date.now() - c.ultimoSync.getTime() > 30 * 24 * 3600 * 1000;
  });
  if (viejas.length) {
    out.push({
      id: 'sync-viejo',
      severidad: 'baja',
      titulo: 'Tenencias desactualizadas',
      detalle: `${viejas.map(c => c.etiqueta).join(', ')} no sincroniza hace mas de un mes. El valor del portafolio que ves es viejo.`,
      accion: 'Toca sincronizar en Conexiones.',
    });
  }

  // --- Metas fuera de ritmo -----------------------------------------------
  const ahorroMensualUsd = cierres.length && d.tipoCambioArs > 0
    ? Math.max(0, cierres.slice(-6).reduce((s, c) => s + c.ahorroArs, 0) / Math.min(6, cierres.length) / d.tipoCambioArs)
    : 0;

  for (const m of d.metas) {
    const objetivoUsd = m.moneda === 'USD' ? m.montoObjetivo : m.montoObjetivo / (d.tipoCambioArs || 1);
    const falta = objetivoUsd - d.ahorroAcumuladoUsd;
    if (falta <= 0) continue;

    if (!m.fechaObjetivo) {
      out.push({
        id: `meta-sin-fecha-${m.nombre}`,
        severidad: 'baja',
        titulo: `"${m.nombre}" no tiene fecha`,
        detalle: 'Sin fecha objetivo no se puede decir si vas a buen ritmo: solo cuanto falta.',
        accion: 'Ponele una fecha para poder medirla.',
      });
      continue;
    }

    const mesesQueQuedan = mesesEntre(d.hoy, m.fechaObjetivo);
    if (mesesQueQuedan <= 0) {
      out.push({
        id: `meta-vencida-${m.nombre}`,
        severidad: 'alta',
        titulo: `"${m.nombre}" vencio sin alcanzarse`,
        detalle: `La fecha era ${m.fechaObjetivo} y todavia faltan unos USD ${Math.round(falta)}.`,
        accion: 'Movele la fecha o ajusta el monto.',
      });
      continue;
    }

    const necesarioPorMes = falta / mesesQueQuedan;
    if (ahorroMensualUsd > 0 && necesarioPorMes > ahorroMensualUsd * 1.1) {
      out.push({
        id: `meta-fuera-de-ritmo-${m.nombre}`,
        severidad: 'media',
        titulo: `"${m.nombre}" no llega al ritmo actual`,
        detalle: `Harian falta unos USD ${Math.round(necesarioPorMes)} por mes hasta ${m.fechaObjetivo}, y venis ahorrando unos USD ${Math.round(ahorroMensualUsd)}.`,
        accion: 'O estiras la fecha, o baja el monto, o subis la tasa de ahorro.',
      });
    }
  }

  // --- Un mes que se desvia mucho -----------------------------------------
  if (cierres.length >= 4) {
    const previos = cierres.slice(0, -1);
    const promedio = previos.reduce((s, c) => s + c.gastoArs, 0) / previos.length;
    const u = cierres[cierres.length - 1];
    if (promedio > 0 && u.gastoArs > promedio * 1.4) {
      out.push({
        id: 'mes-caro',
        severidad: 'media',
        titulo: `${u.periodo} gasto bastante mas que el promedio`,
        detalle: `Gastaste ${Math.round((u.gastoArs / promedio - 1) * 100)}% mas que el promedio de los meses anteriores. Puede ser real, o puede ser un consumo mal categorizado o duplicado.`,
        accion: 'Revisa los consumos del mes en Gastos.',
      });
    }
  }

  // --- Plata prestada que nadie devolvio -----------------------------------
  // Es lo que mas se olvida: no vence, no manda recordatorio y no aparece en
  // ningun resumen. Seis meses sin una sola devolucion ya no es "todavia no".
  const olvidados = (d.fiados ?? []).filter(
    f => f.pendiente > 0 && !f.huboDevolucion && f.diasDesde !== null && f.diasDesde >= 180,
  );
  for (const f of olvidados) {
    const meses = Math.floor((f.diasDesde as number) / 30);
    out.push({
      id: `fiado-${f.persona}`,
      severidad: 'media',
      titulo: `Le prestaste a ${f.persona} hace ${meses} meses y no devolvio nada`,
      detalle: `Quedan ${f.moneda} ${Math.round(f.pendiente).toLocaleString('es-AR')} sin devolver, sin ninguna devolucion anotada desde que prestaste.`,
      accion: 'Si ya te devolvio, anotalo en Gastos. Si no, es el momento de preguntar — o de darlo por perdido y dejar de contarlo.',
    });
  }

  const orden: Record<Severidad, number> = { alta: 0, media: 1, baja: 2 };
  return out.sort((a, b) => orden[a.severidad] - orden[b.severidad]);
}
