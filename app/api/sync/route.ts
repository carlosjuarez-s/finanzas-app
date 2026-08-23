import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { statements, consumos, salaries } from '@/db/schema';
import { findFolder, listPdfs, downloadBase64 } from '@/lib/drive';
import { extractStatement, extractSalary } from '@/lib/anthropic';

export const maxDuration = 300; // extraer varios PDFs lleva tiempo

// Corre por cron de Vercel (dia 22 de cada mes) o manualmente con POST.
export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }

async function run(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const result = { statements: 0, salaries: 0, skipped: 0, errors: [] as string[] };

  // Resumenes de tarjeta
  const tarjetasId = await findFolder(process.env.DRIVE_FOLDER_TARJETAS!);
  if (tarjetasId) {
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
  const salariosId = await findFolder(process.env.DRIVE_FOLDER_SALARIOS!);
  if (salariosId) {
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

  return NextResponse.json(result);
}
