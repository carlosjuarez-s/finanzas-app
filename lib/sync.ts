import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { statements, salaries } from '@/db/schema';
import { findFolder, listPdfs, downloadBase64 } from '@/lib/drive';
import { extractStatement, extractSalary, faltaProveedor } from '@/lib/extract';
import { guardarStatement, guardarSalary } from '@/lib/guardar';
import { guardarCierres } from '@/lib/cierre';
import { mensajeDeError } from '@/lib/errores';

export type SyncResult = {
  statements: number;
  salaries: number;
  skipped: number;
  errors: string[];
};

// Logica compartida entre el cron (/api/sync, con CRON_SECRET) y el boton del
// dashboard (/api/run-sync, con el Basic Auth del middleware).
export async function runSync(usuarioId: string): Promise<SyncResult> {
  const result: SyncResult = { statements: 0, salaries: 0, skipped: 0, errors: [] };

  // Chequeo instantaneo: sin proveedor todos los PDFs fallan igual, y bajarlos
  // de Drive para descubrirlo uno por uno solo repite el mismo error N veces.
  const sinProveedor = faltaProveedor();
  if (sinProveedor) {
    result.errors.push(sinProveedor);
    return result;
  }

  const nombreTarjetas = process.env.DRIVE_FOLDER_TARJETAS!;
  const nombreSalarios = process.env.DRIVE_FOLDER_SALARIOS!;

  // Resolver las dos carpetas juntas: si fallan las credenciales o Drive no
  // responde, el error es el mismo para ambas y conviene reportarlo una sola vez.
  let tarjetasId: string | null;
  let salariosId: string | null;
  try {
    tarjetasId = await findFolder(nombreTarjetas);
    salariosId = await findFolder(nombreSalarios);
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
    return result;
  }

  // Que archivos ya estan cargados, en dos consultas y no una por PDF: el caso
  // normal es que no haya nada nuevo, y preguntar de a uno son N round-trips a
  // Neon para descubrirlo. El fileId de Drive es la identidad del documento.
  const [cargadosTarjetas, cargadosSalarios] = await Promise.all([
    db.select({ fileId: statements.fileId }).from(statements)
      .where(eq(statements.usuarioId, usuarioId)),
    db.select({ fileId: salaries.fileId }).from(salaries)
      .where(eq(salaries.usuarioId, usuarioId)),
  ]);
  const procesados = {
    tarjetas: new Set(cargadosTarjetas.map(r => r.fileId)),
    salarios: new Set(cargadosSalarios.map(r => r.fileId)),
  };

  // Resumenes de tarjeta
  if (!tarjetasId) {
    result.errors.push(`No se encontro la carpeta "${nombreTarjetas}": compartila con el client_email de la service account.`);
  } else {
    for (const f of await listPdfs(tarjetasId)) {
      if (procesados.tarjetas.has(f.id!)) { result.skipped++; continue; }
      try {
        await guardarStatement(usuarioId, f.id!, await extractStatement(await downloadBase64(f.id!)));
        result.statements++;
      } catch (e) { result.errors.push(`${f.name}: ${e}`); }
    }
  }

  // Recibos de sueldo
  if (!salariosId) {
    result.errors.push(`No se encontro la carpeta "${nombreSalarios}": compartila con el client_email de la service account.`);
  } else {
    for (const f of await listPdfs(salariosId)) {
      if (procesados.salarios.has(f.id!)) { result.skipped++; continue; }
      try {
        const data = await extractSalary(await downloadBase64(f.id!));
        // Sin recibos no se guarda nada, asi que el archivo volveria a
        // procesarse (y a cobrarse) en cada sync: conviene avisar.
        if (!data.recibos.length) {
          result.errors.push(`${f.name}: no se reconocio ningun recibo en el PDF.`);
          continue;
        }
        const { cantidad } = await guardarSalary(usuarioId, f.id!, data);
        result.salaries += cantidad;
      } catch (e) { result.errors.push(`${f.name}: ${e}`); }
    }
  }

  // Refrescar el historico solo si entro algo. Va aparte del try de cada
  // archivo: si el recalculo falla, la extraccion ya hecha no se pierde.
  if (result.statements || result.salaries) {
    try {
      await guardarCierres(usuarioId);
    } catch (e) {
      result.errors.push(`Los datos se guardaron, pero fallo el recalculo del historico. ${mensajeDeError(e)}`);
    }
  }

  return result;
}
