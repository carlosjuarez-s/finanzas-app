'use client';

import { ConfigProvider } from 'antd';
import type { ThemeConfig } from 'antd';

// Los tokens replican la paleta de globals.css ("resumen bancario en papel"),
// para que antd no arrastre su azul y sus bordes redondeados por defecto.
// Cuando llegue el mockup nuevo, este es el unico archivo a tocar para el look.
const tema: ThemeConfig = {
  token: {
    colorPrimary: '#2D5FA8',   // --peso, el azul de los montos en ARS
    colorSuccess: '#1E7A4F',   // --dolar
    colorWarning: '#B4690E',   // --alerta
    colorError: '#B4690E',
    colorTextBase: '#22262B',  // --tinta
    colorBgBase: '#F5F2EA',    // --papel
    colorBorder: '#D9D3C4',    // --linea
    borderRadius: 0,           // la estetica de imprenta no tiene esquinas
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: 15,
  },
  components: {
    // Los montos y etiquetas van en mono tabular, como un libro mayor.
    Button: { fontWeight: 600 },
  },
};

export default function Theme({ children }: { children: React.ReactNode }) {
  return <ConfigProvider theme={tema}>{children}</ConfigProvider>;
}
