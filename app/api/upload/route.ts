import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { statements, salaries, gastos } from '@/db/schema';
import { clasificarDocumento, clasificarArchivoTexto, faltaProveedor, MAX_CARACTERES_TEXTO } from '@/lib/extract';
import { guardarStatement, guardarSalary, guardarPortfolio, guardarGasto, guardarMovimientos } from '@/lib/guardar';
import { guardarCierres, periodoSiguiente } from '@/lib/cierre';
import { mensajeDeError } from '@/lib/errores';

import { esArchivoTexto, esArchivoBinario, type ResultadoArchivo } from '@/lib/tipos';
import { idUsuarioActual } from '@/lib/usuario';
import { esArchivoExcel, excelATexto, ErrorExcel } from '@/lib/excel';

export const maxDuration = 300;


// El middleware exige el mismo Basic Auth que el dashboard (la ruta no empieza
// con /api/sync), asi que aca no hace falta autenticar de nuevo.
export async function POST(req: NextRequest) {
  const usuarioId = await idUsuarioActual();
  const sinProveedor = faltaProveedor();
  if (sinProveedor) return NextResponse.json({ error: sinProveedor }, { status: 400 });

  const form = await req.formData();
  const files = form.getAll('files').filter((f): f is File => f instanceof File);
  if (!files.length) return NextResponse.json({ error: 'No se recibio ningun archivo.' }, { status: 400 });

  // El periodo solo se usa si el documento resulta ser un portfolio: una foto de
  // tenencias no trae fecha propia, a diferencia de un resumen o un recibo.
  const periodoPortfolio = (form.get('periodo') as string) || new Date().toISOString().slice(0, 7);

  const resultados: ResultadoArchivo[] = [];
  const periodosTocados = new Set<string>();

  for (const file of files) {
    const nombre = file.name || 'archivo';
    try {
      // Una planilla no es texto ni se le puede mostrar al modelo como un PDF:
      // es un zip con XML adentro. Se convierte a tabla y entra por el mismo
      // camino que un CSV, reusando clasificacion, censura de PII y dedup.
      const archivoExcel = esArchivoExcel(file.name, file.type);
      const archivoTexto = archivoExcel || esArchivoTexto(file.name, file.type);

      if (!archivoTexto && !esArchivoBinario(file.type)) {
        resultados.push({ nombre, estado: 'error', detalle: `Tipo no soportado (${file.type || 'desconocido'}). Se aceptan PDF, PNG, JPG, WEBP, CSV, TXT y XLSX.` });
        continue;
      }

      const buf = Buffer.from(await file.arrayBuffer());
      // Sin id de Drive, la identidad del documento es su contenido: subir dos
      // veces el mismo archivo, aunque se llame distinto, no lo duplica.
      const fileId = `upload:${createHash('sha256').update(buf).digest('hex')}`;

      // La deduplicacion es por usuario. Si fuera global, subir un archivo que
      // otra persona ya subio se saltearia en silencio, y el que sube se
      // quedaria sin su gasto sin entender por que.
      const [yaSt, yaSal, yaGasto] = await Promise.all([
        db.select({ fileId: statements.fileId }).from(statements)
          .where(and(eq(statements.usuarioId, usuarioId), eq(statements.fileId, fileId))),
        db.select({ fileId: salaries.fileId }).from(salaries)
          .where(and(eq(salaries.usuarioId, usuarioId), eq(salaries.fileId, fileId))),
        db.select({ fileId: gastos.fileId }).from(gastos)
          .where(and(eq(gastos.usuarioId, usuarioId), eq(gastos.fileId, fileId))),
      ]);
      if (yaSt.length || yaSal.length || yaGasto.length) {
        resultados.push({ nombre, estado: 'duplicado', detalle: 'Ya estaba cargado.' });
        continue;
      }

      // --- Texto y planillas (CSV, TXT, XLSX) ---------------------------
      if (archivoTexto) {
        let contenido: string;
        try {
          contenido = archivoExcel ? await excelATexto(buf) : buf.toString('utf8');
        } catch (e) {
          // El error de una planilla dice que hacer (guardala como .xlsx,
          // exportala a CSV): vale mas que el mensaje generico del catch.
          if (e instanceof ErrorExcel) {
            resultados.push({ nombre, estado: 'error', detalle: e.message });
            continue;
          }
          throw e;
        }
        if (!contenido.trim()) {
          resultados.push({ nombre, estado: 'error', detalle: 'El archivo esta vacio.' });
          continue;
        }
        if (contenido.length > MAX_CARACTERES_TEXTO) {
          resultados.push({
            nombre, estado: 'error',
            detalle: `El archivo tiene ${Math.round(contenido.length / 1000)}k caracteres y el maximo es ${MAX_CARACTERES_TEXTO / 1000}k. Partilo por año o por trimestre.`,
          });
          continue;
        }

        const { resultado, hallazgos } = await clasificarArchivoTexto(contenido);
        const censurado = hallazgos.length ? ` · se censuro antes de enviar: ${hallazgos.join(', ')}` : '';

        if (resultado.tipo === 'MOVIMIENTOS') {
          const movs = resultado.datos?.movimientos ?? [];
          if (!movs.length) {
            resultados.push({ nombre, estado: 'desconocido', detalle: `Parece un export de operaciones pero no se pudo leer ninguna fila.${censurado}` });
            continue;
          }
          const { nuevos, repetidos, descartados } = await guardarMovimientos(usuarioId, movs, 'IMPORTADO');
          const partes = [`${nuevos} ${nuevos === 1 ? 'operacion nueva' : 'operaciones nuevas'}`];
          if (repetidos) partes.push(`${repetidos} ya estaban`);
          if (descartados) partes.push(`${descartados} sin datos suficientes`);
          resultados.push({ nombre, estado: 'cargado', tipo: 'Operaciones', detalle: partes.join(' · ') + censurado });
          continue;
        }

        if (resultado.tipo === 'GASTO') {
          const { periodo, monto } = await guardarGasto(usuarioId, resultado.datos, 'TEXTO', fileId);
          periodosTocados.add(periodo);
          resultados.push({ nombre, estado: 'cargado', tipo: 'Gasto', detalle: `${resultado.datos.concepto} · ${periodo} · $ ${monto.toLocaleString('es-AR')}${censurado}` });
          continue;
        }

        resultados.push({ nombre, estado: 'desconocido', detalle: (resultado.datos?.motivo ?? 'No se reconocio el contenido del archivo.') + censurado });
        continue;
      }

      const doc = await clasificarDocumento({ base64: buf.toString('base64'), mediaType: file.type });

      switch (doc.tipo) {
        case 'STATEMENT': {
          const { periodo } = await guardarStatement(usuarioId, fileId, doc.datos);
          periodosTocados.add(periodo);
          resultados.push({ nombre, estado: 'cargado', tipo: 'Resumen de tarjeta', detalle: `${doc.datos.card} · ${periodo}` });
          break;
        }
        case 'SALARY': {
          if (!doc.datos.recibos?.length) {
            resultados.push({ nombre, estado: 'desconocido', detalle: 'Parece un recibo pero no se pudo leer ningun periodo.' });
            break;
          }
          const { cantidad, periodos } = await guardarSalary(usuarioId, fileId, doc.datos);
          // El sueldo de un mes paga los consumos del siguiente: los dos cierres cambian.
          periodos.forEach(p => { periodosTocados.add(p); periodosTocados.add(periodoSiguiente(p)); });
          resultados.push({ nombre, estado: 'cargado', tipo: 'Recibo de sueldo', detalle: `${cantidad} ${cantidad === 1 ? 'recibo' : 'recibos'} · ${periodos.join(', ')}` });
          break;
        }
        case 'GASTO': {
          // Una boleta de servicio o un papel fotografiado: es el tipo de
          // documento que el mimetype no distingue, solo el contenido.
          const { periodo, monto } = await guardarGasto(usuarioId, 
            doc.datos, file.type === 'application/pdf' ? 'BOLETA' : 'FOTO', fileId,
          );
          periodosTocados.add(periodo);
          resultados.push({
            nombre, estado: 'cargado', tipo: 'Gasto',
            detalle: `${doc.datos.concepto} · ${periodo} · $ ${monto.toLocaleString('es-AR')}`,
          });
          break;
        }
        case 'PORTFOLIO': {
          const { posiciones } = await guardarPortfolio(usuarioId, periodoPortfolio, doc.datos);
          resultados.push({ nombre, estado: 'cargado', tipo: 'Portfolio', detalle: `${doc.datos.plataforma} · ${posiciones} posiciones` });
          break;
        }
        default:
          resultados.push({ nombre, estado: 'desconocido', detalle: doc.datos?.motivo ?? 'No se reconocio el tipo de documento.' });
      }
    } catch (e) {
      resultados.push({ nombre, estado: 'error', detalle: mensajeDeError(e) });
    }
  }

  // Los periodos afectados alcanzan: recalcular todos seria innecesario cuando
  // se sube un solo resumen.
  let historico: string | undefined;
  if (periodosTocados.size) {
    try {
      await guardarCierres(usuarioId, [...periodosTocados]);
    } catch (e) {
      historico = `Los datos se guardaron, pero fallo el recalculo del historico. ${mensajeDeError(e)}`;
    }
  }

  return NextResponse.json({ resultados, historico });
}
