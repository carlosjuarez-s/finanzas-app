'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Upload, Typography, Space, Tag } from 'antd';
import type { UploadFile } from 'antd';
import type { ResultadoArchivo } from '@/lib/tipos';

const { Text } = Typography;

const COLOR: Record<ResultadoArchivo['estado'], string> = {
  cargado: 'green',
  duplicado: 'default',
  desconocido: 'orange',
  error: 'red',
};

export default function UploadPanel() {
  const [archivos, setArchivos] = useState<UploadFile[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [resultados, setResultados] = useState<ResultadoArchivo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function subir() {
    setSubiendo(true);
    setError(null);
    setResultados(null);
    try {
      const form = new FormData();
      for (const a of archivos) if (a.originFileObj) form.append('files', a.originFileObj);

      const res = await fetch('/api/upload', { method: 'POST', body: form });
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(cuerpo?.error ?? `El servidor respondio ${res.status}`);

      setResultados(cuerpo.resultados);
      if (cuerpo.historico) setError(cuerpo.historico);
      setArchivos([]);
      router.refresh(); // el dashboard es server component: recarga con lo nuevo
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <section>
      <h2>Subir documentos</h2>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Text type="secondary" className="resultado">
          Resúmenes, recibos, boletas de servicios, fotos de comprobantes, o el CSV de
          operaciones que exporta tu broker. Se detecta solo qué es cada uno.
        </Text>

        <Upload
          multiple
          // beforeUpload devuelve false: antd no sube nada por su cuenta, los
          // archivos van juntos en un solo POST cuando se toca el boton.
          beforeUpload={() => false}
          fileList={archivos}
          onChange={({ fileList }) => setArchivos(fileList)}
          accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.tsv"
        >
          <Button>Elegir archivos</Button>
        </Upload>

        <Space wrap align="center">
          <Button type="primary" onClick={subir} loading={subiendo} disabled={!archivos.length}>
            {archivos.length > 1 ? `Analizar ${archivos.length} archivos` : 'Analizar y guardar'}
          </Button>
          {subiendo && <Text type="secondary" className="resultado">Leyendo y clasificando, puede tardar un minuto.</Text>}
        </Space>

        {error && <Text type="danger" className="resultado">{error}</Text>}

        {resultados?.map((r, i) => (
          <div className="fila" key={`${r.nombre}-${i}`}>
            <span>
              {r.nombre} {r.tipo && <span className="chip">{r.tipo}</span>}
            </span>
            <Space size="small">
              <Text type="secondary" className="resultado">{r.detalle}</Text>
              <Tag color={COLOR[r.estado]}>{r.estado}</Tag>
            </Space>
          </div>
        ))}
      </Space>
    </section>
  );
}
