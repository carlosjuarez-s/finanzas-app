'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SyncResult } from '@/lib/sync';

type Estado =
  | { fase: 'idle' }
  | { fase: 'corriendo' }
  | { fase: 'listo'; resultado: SyncResult }
  | { fase: 'error'; msg: string };

export default function SyncButton() {
  const [estado, setEstado] = useState<Estado>({ fase: 'idle' });
  const router = useRouter();

  async function sincronizar() {
    setEstado({ fase: 'corriendo' });
    try {
      const res = await fetch('/api/run-sync', { method: 'POST' });
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(cuerpo?.error ?? `El servidor respondio ${res.status}`);
      const resultado: SyncResult = cuerpo;
      setEstado({ fase: 'listo', resultado });
      router.refresh(); // el dashboard es un server component: recarga los datos
    } catch (e) {
      setEstado({ fase: 'error', msg: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className="acciones">
      <button className="boton" onClick={sincronizar} disabled={estado.fase === 'corriendo'}>
        {estado.fase === 'corriendo' ? 'Sincronizando…' : 'Sincronizar ahora'}
      </button>

      {estado.fase === 'corriendo' && (
        <span className="resultado">Leyendo Drive y extrayendo PDFs, puede tardar un minuto.</span>
      )}

      {estado.fase === 'error' && <span className="resultado alerta">{estado.msg}</span>}

      {estado.fase === 'listo' && (
        <span className={`resultado ${estado.resultado.errors.length ? 'alerta' : 'usd'}`}>
          {estado.resultado.statements} resumenes · {estado.resultado.salaries} recibos
          {estado.resultado.skipped > 0 && ` · ${estado.resultado.skipped} ya cargados`}
          {estado.resultado.errors.map((err, i) => <span key={i} style={{ display: 'block' }}>{err}</span>)}
        </span>
      )}
    </div>
  );
}
