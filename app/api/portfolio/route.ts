import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { portfolioSnapshots, positions } from '@/db/schema';
import { extractPortfolio } from '@/lib/extract';

export const maxDuration = 120;

// POST multipart/form-data con capturas (campo "images") y "periodo" YYYY-MM.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const periodo = (form.get('periodo') as string) || new Date().toISOString().slice(0, 7);
  const files = form.getAll('images') as File[];
  if (!files.length) return NextResponse.json({ error: 'Subi al menos una captura' }, { status: 400 });

  const images = await Promise.all(files.map(async f => ({
    base64: Buffer.from(await f.arrayBuffer()).toString('base64'),
    mediaType: f.type || 'image/png',
  })));

  const data = await extractPortfolio(images);

  const [snap] = await db.insert(portfolioSnapshots)
    .values({
      periodo, plataforma: data.plataforma,
      totalUsd: data.totalUsd != null ? String(data.totalUsd) : null,
      totalArs: data.totalArs != null ? String(data.totalArs) : null,
    })
    .onConflictDoUpdate({
      target: [portfolioSnapshots.periodo, portfolioSnapshots.plataforma],
      set: {
        totalUsd: data.totalUsd != null ? String(data.totalUsd) : null,
        totalArs: data.totalArs != null ? String(data.totalArs) : null,
      },
    })
    .returning({ id: portfolioSnapshots.id });

  await db.delete(positions).where(eq(positions.snapshotId, snap.id));
  if (data.positions.length) {
    await db.insert(positions).values(data.positions.map(p => ({
      snapshotId: snap.id, activo: p.activo, clase: p.clase,
      cantidad: String(p.cantidad),
      valorUsd: p.valorUsd != null ? String(p.valorUsd) : null,
      valorArs: p.valorArs != null ? String(p.valorArs) : null,
    })));
  }

  return NextResponse.json({ ok: true, plataforma: data.plataforma, positions: data.positions.length });
}
