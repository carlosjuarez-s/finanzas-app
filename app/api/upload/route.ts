import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { statements, salaries } from '@/db/schema';
import { clasificarDocumento, faltaProveedor } from '@/lib/extract';
import { guardarStatement, guardarSalary, guardarPortfolio } from '@/lib/guardar';
import { guardarCierres, periodoSiguiente } from '@/lib/cierre';
import { mensajeDeError } from '@/lib/errores';

import type { ResultadoArchivo } from '@/lib/tipos';

export const maxDuration = 300;

const TIPOS_ACEPTADOS = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

// El middleware exige el mismo Basic Auth que el dashboard (la ruta no empieza
// con /api/sync), asi que aca no hace falta autenticar de nuevo.
export async function POST(req: NextRequest) {
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
      if (!TIPOS_ACEPTADOS.includes(file.type)) {
        resultados.push({ nombre, estado: 'error', detalle: `Tipo no soportado (${file.type || 'desconocido'}). Se aceptan PDF, PNG, JPG y WEBP.` });
        continue;
      }

      const buf = Buffer.from(await file.arrayBuffer());
      // Sin id de Drive, la identidad del documento es su contenido: subir dos
      // veces el mismo archivo, aunque se llame distinto, no lo duplica.
      const fileId = `upload:${createHash('sha256').update(buf).digest('hex')}`;

      const [yaSt, yaSal] = await Promise.all([
        db.select({ fileId: statements.fileId }).from(statements).where(inArray(statements.fileId, [fileId])),
        db.select({ fileId: salaries.fileId }).from(salaries).where(inArray(salaries.fileId, [fileId])),
      ]);
      if (yaSt.length || yaSal.length) {
        resultados.push({ nombre, estado: 'duplicado', detalle: 'Ya estaba cargado.' });
        continue;
      }

      const doc = await clasificarDocumento({ base64: buf.toString('base64'), mediaType: file.type });

      switch (doc.tipo) {
        case 'STATEMENT': {
          const { periodo } = await guardarStatement(fileId, doc.datos);
          periodosTocados.add(periodo);
          resultados.push({ nombre, estado: 'cargado', tipo: 'Resumen de tarjeta', detalle: `${doc.datos.card} · ${periodo}` });
          break;
        }
        case 'SALARY': {
          if (!doc.datos.recibos?.length) {
            resultados.push({ nombre, estado: 'desconocido', detalle: 'Parece un recibo pero no se pudo leer ningun periodo.' });
            break;
          }
          const { cantidad, periodos } = await guardarSalary(fileId, doc.datos);
          // El sueldo de un mes paga los consumos del siguiente: los dos cierres cambian.
          periodos.forEach(p => { periodosTocados.add(p); periodosTocados.add(periodoSiguiente(p)); });
          resultados.push({ nombre, estado: 'cargado', tipo: 'Recibo de sueldo', detalle: `${cantidad} ${cantidad === 1 ? 'recibo' : 'recibos'} · ${periodos.join(', ')}` });
          break;
        }
        case 'PORTFOLIO': {
          const { posiciones } = await guardarPortfolio(periodoPortfolio, doc.datos);
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
      await guardarCierres([...periodosTocados]);
    } catch (e) {
      historico = `Los datos se guardaron, pero fallo el recalculo del historico. ${mensajeDeError(e)}`;
    }
  }

  return NextResponse.json({ resultados, historico });
}
