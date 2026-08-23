import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { statements, consumos, salaries } from '@/db/schema';
import { findFolder, listPdfs, downloadBase64 } from '@/lib/drive';
import { extractStatement, extractSalary } from '@/lib/anthropic';

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

  // Resumenes de tarjeta
  const nombreTarjetas = process.env.DRIVE_FOLDER_TARJETAS!;
  const tarjetasId = await findFolder(nombreTarjetas);
  if (!tarjetasId) {
    result.errors.push(`No se encontro la carpeta "${nombreTarjetas}": compartila con el client_email de la service account.`);
  } else {
    for (const f of await listPdfs(tarjetasId)) {
      const existing = await db.query.statements.findFirst({ where: eq(statements.fileId, f.id!) });
      if (existing) { result.skipped++; continue; }
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
  const nombreSalarios = process.env.DRIVE_FOLDER_SALARIOS!;
  const salariosId = await findFolder(nombreSalarios);
  if (!salariosId) {
    result.errors.push(`No se encontro la carpeta "${nombreSalarios}": compartila con el client_email de la service account.`);
  } else {
    for (const f of await listPdfs(salariosId)) {
      try {
        const data = await extractSalary(await downloadBase64(f.id!));
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
