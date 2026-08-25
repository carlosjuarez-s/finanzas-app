'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Popconfirm } from 'antd';

export default function BorrarMeta({ id, nombre }: { id: string; nombre: string }) {
  const [borrando, setBorrando] = useState(false);
  const router = useRouter();

  async function borrar() {
    setBorrando(true);
    try {
      await fetch(`/api/metas?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setBorrando(false);
    }
  }

  return (
    <Popconfirm title={`¿Borrar "${nombre}"?`} onConfirm={borrar} okText="Borrar" cancelText="No">
      <Button size="small" danger loading={borrando}>Borrar</Button>
    </Popconfirm>
  );
}
