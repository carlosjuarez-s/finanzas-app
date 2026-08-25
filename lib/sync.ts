import { db } from '@/lib/db';
import { statements, consumos, salaries } from '@/db/schema';
import { findFolder, listPdfs, downloadBase64 } from '@/lib/drive';
import { extractStatement, extractSalary, faltaProveedor } from '@/lib/extract';

export type SyncResult = {
  statements: number;
  salaries: number;
  skipped: number;
  errors: string[];
};

// Logica compartida entre el cron (/api/sync, con CRON_SECRET) y el boton del
// dashboard (/api/run-sync, con el Basic Auth del middleware).
export async function runSync(): Promise<SyncResult> {
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
    db.select({ fileId: statements.fileId }).from(statements),
    db.select({ fileId: salaries.fileId }).from(salaries),
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
        const data = await extractStatement(await downloadBase64(f.id!));
        const [st] = await db.insert(statements).values({
          fileId: f.id!, card: data.card, periodo: data.periodo,
          vencimiento: data.vencimiento ? new Date(data.vencimiento) : null,
          totalArs: String(data.totalArs), totalUsd: String(data.totalUsd),
          percepArs: String(data.percepArs), raw: data,
        }).returning({ id: statements.id });
        if (data.consumos.length) {
          await db.insert(consumos).values(data.consumos.map(c => ({
            statementId: st.id, fecha: c.fecha, comercio: c.comercio,
            categoria: c.categoria, cuota: c.cuota,
            montoArs: String(c.montoArs), montoUsd: String(c.montoUsd),
          })));
        }
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
        for (const r of data.recibos) {
          await db.insert(salaries)
            .values({ periodo: r.periodo, netoArs: String(r.netoArs), fileId: f.id! })
            .onConflictDoUpdate({
              target: salaries.periodo,
              set: { netoArs: String(r.netoArs), fileId: f.id! },
            });
          result.salaries++;
        }
      } catch (e) { result.errors.push(`${f.name}: ${e}`); }
    }
  }

  return result;
}
