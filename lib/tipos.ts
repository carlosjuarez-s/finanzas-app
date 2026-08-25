// Tipos compartidos entre los proveedores de extraccion (Anthropic, Gemini) y
// quienes los consumen. Viven aparte para que los proveedores no dependan del
// despachante ni entre si.

// Un PDF o una imagen en base64, listo para mandar a cualquiera de los dos.
export type Documento = { base64: string; mediaType: string };

export type StatementData = {
  card: string; periodo: string; vencimiento: string;
  totalArs: number; totalUsd: number; percepArs: number;
  cuotasAVencer: { mes: string; montoArs: number }[];
  consumos: { fecha: string; comercio: string; categoria: string; cuota: string | null; montoArs: number; montoUsd: number }[];
};

export type SalaryData = { recibos: { periodo: string; netoArs: number }[] };

export type PortfolioData = {
  plataforma: string; totalUsd: number | null; totalArs: number | null;
  positions: { activo: string; clase: string; cantidad: number; valorUsd: number | null; valorArs: number | null }[];
};
