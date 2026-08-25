import './globals.css';
import { AntdRegistry } from '@ant-design/nextjs-registry';
import Theme from './theme';

export const metadata = { title: 'Finanzas — Cierre mensual' };

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
          <Theme>{children}</Theme>
        </AntdRegistry>
      </body>
    </html>
  );
}
