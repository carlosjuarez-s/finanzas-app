'use client';

import { useEffect, useState } from 'react';
import { ConfigProvider, theme as antdTheme } from 'antd';
import type { ThemeConfig } from 'antd';

// Los tokens replican la paleta de globals.css ("resumen bancario en papel"),
// para que antd no arrastre su azul y sus bordes redondeados por defecto.
//
// Van los dos temas y no solo el claro: antd no lee variables CSS, asi que si
// aca quedaran los colores del tema claro clavados, en modo oscuro los inputs y
// los botones seguirian sobre fondo papel mientras el resto de la app se
// oscurece. Los valores son los mismos que globals.css, medidos en
// scripts/contraste.mjs.
const comun: ThemeConfig['token'] = {
  borderRadius: 0,           // la estetica de imprenta no tiene esquinas
  fontFamily: "'Inter', system-ui, sans-serif",
  fontSize: 15,
};

const CLARO: ThemeConfig = {
  token: {
    ...comun,
    colorPrimary: '#2D5FA8',   // --peso, el azul de los montos en ARS
    colorSuccess: '#1E7A4F',   // --dolar
    colorWarning: '#A25E0D',   // --alerta
    colorError: '#A25E0D',
    colorTextBase: '#22262B',  // --tinta
    colorBgBase: '#F5F2EA',    // --papel
    colorBorder: '#D9D3C4',    // --linea
  },
  components: { Button: { fontWeight: 600 } },
};

const OSCURO: ThemeConfig = {
  algorithm: antdTheme.darkAlgorithm,
  token: {
    ...comun,
    colorPrimary: '#3E83E8',
    colorSuccess: '#259661',
    colorWarning: '#C1700F',
    colorError: '#C1700F',
    colorTextBase: '#E9E5DB',
    colorBgBase: '#1A1D21',
    colorBorder: '#343B42',
  },
  components: { Button: { fontWeight: 600 } },
};

export default function Theme({ children }: { children: React.ReactNode }) {
  // Arranca en claro y se corrige al montar. El server no sabe que tema tiene
  // el navegador, y adivinar produciria un parpadeo al revertir.
  const [oscuro, setOscuro] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setOscuro(mq.matches);
    // Cambiar el tema del sistema con la app abierta tiene que verse: en un
    // telefono el modo oscuro se activa solo al anochecer.
    const alCambiar = (e: MediaQueryListEvent) => setOscuro(e.matches);
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);

  return <ConfigProvider theme={oscuro ? OSCURO : CLARO}>{children}</ConfigProvider>;
}
