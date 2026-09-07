'use client';

import { useState } from 'react';
import { Tabs } from 'antd';

export type Seccion = {
  clave: string;
  titulo: string;
  contenido: React.ReactNode;
  chip?: string;
  /** Un chip corto (un contador) sobrevive en el telefono; un monto no. */
  chipCorto?: boolean;
};

/**
 * Varias secciones en una pantalla, sin scrollear todas.
 *
 * La pagina del mes tenia diez secciones apiladas: para corregir un consumo de
 * tarjeta habia que pasar por los prestamos, lo que te deben y las categorias.
 * En un telefono eso son varias pantallas de pulgar.
 *
 * Lo que esto cuesta, y hay que saberlo: antd desmonta el panel inactivo. Un
 * formulario a medio escribir en otra pestaña se pierde al volver, y Ctrl+F no
 * encuentra lo que esta en una pestaña cerrada. Por eso el agrupamiento es por
 * pregunta y no por tabla: lo que se usa junto tiene que quedar junto, o el
 * corte se paga cada vez.
 */
export default function Secciones({ secciones, inicial }: {
  secciones: Seccion[];
  inicial?: string;
}) {
  // El default puede venir de afuera: al llegar desde el cierre filtrando por
  // una categoria, la pestaña util es la de los gastos, no la primera.
  const primera = secciones[0]?.clave;
  const [activa, setActiva] = useState(
    inicial && secciones.some(s => s.clave === inicial) ? inicial : primera,
  );

  return (
    <Tabs
      activeKey={activa}
      onChange={setActiva}
      className="secciones"
      items={secciones.map(s => ({
        key: s.clave,
        label: (
          <span>
            {s.titulo}
            {s.chip && <span className="chip" data-corto={s.chipCorto ? '' : undefined}>{s.chip}</span>}
          </span>
        ),
        children: s.contenido,
      }))}
    />
  );
}
