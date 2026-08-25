import { NextRequest, NextResponse } from 'next/server';
import { guardarSupuestos } from '@/lib/supuestos';
import type { Supuestos } from '@/lib/proyeccion';

const CAMPOS: (keyof Supuestos)[] = [
  'tipoCambioArs', 'retornoRealPesos', 'retornoRealDolares', 'retornoRealIndice',
];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parcial: Partial<Supuestos> = {};

  for (const campo of CAMPOS) {
    const valor = Number(body?.[campo]);
    if (body?.[campo] === undefined || body?.[campo] === null) continue;
    if (!Number.isFinite(valor)) {
      return NextResponse.json({ error: `${campo} tiene que ser un numero.` }, { status: 400 });
    }
    // Un tipo de cambio en cero o negativo divide mal en todo el resto de la app.
    if (campo === 'tipoCambioArs' && valor <= 0) {
      return NextResponse.json({ error: 'El tipo de cambio tiene que ser mayor a cero.' }, { status: 400 });
    }
    parcial[campo] = valor;
  }

  return NextResponse.json({ supuestos: await guardarSupuestos(parcial) });
}
