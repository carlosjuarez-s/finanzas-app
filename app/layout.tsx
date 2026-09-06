import './globals.css';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import Theme from './theme';
import Sesion from './sesion';

export const metadata = { title: 'Finanzas — Cierre mensual' };

// El navegador pinta su propio fondo (barras, overscroll) segun esto: sin
// declararlo, en modo oscuro los bordes quedan blancos alrededor de una app
// oscura.
export const viewport = { colorScheme: 'light dark' as const };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@90,700;90,800&family=Inter:wght@400;600&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet" />
      </head>
      {/* AntdRegistry extrae los estilos en el server: sin el, antd los inyecta
          recien en el cliente y la pagina parpadea sin estilos al cargar. */}
      <body>
        <AntdRegistry>
          <Theme>
            {/* Con nueve secciones en el nav, llegar al contenido con teclado
                eran nueve tabulaciones en cada pantalla. */}
            <a className="saltar" href="#contenido">Saltar al contenido</a>
            <Sesion />
            <div id="contenido">{children}</div>
          </Theme>
        </AntdRegistry>
      </body>
    </html>
  );
}
