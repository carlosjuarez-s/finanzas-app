import Link from 'next/link';

/**
 * El aviso de que estas viendo una categoria sola.
 *
 * Sin esto, llegar desde el cierre a una lista corta parece un mes con pocos
 * gastos: la pantalla se ve igual, solo que con menos filas. El filtro tiene
 * que decirse, y tiene que poder soltarse de un toque.
 */
export default function FiltroCategoria({ categoria, periodo, cuantos, esCuotas }: {
  categoria: string; periodo: string; cuantos: number; esCuotas: boolean;
}) {
  return (
    <div className="filtro">
      <span>
        Mostrando solo <strong>{categoria}</strong>
        {' · '}
        {cuantos} {cuantos === 1 ? 'ítem' : 'ítems'}
      </span>
      <Link href={`/gastos?periodo=${periodo}`}>Ver todo el mes</Link>

      {/* La cuota de un prestamo no es una fila cargada: sale del plan. Sin
          este aviso, tocar "Cuotas" en el cierre lleva a una lista vacia y
          parece un bug. */}
      {esCuotas && cuantos === 0 && (
        <p className="nota" style={{ width: '100%', marginTop: 8 }}>
          La cuota del mes no es un gasto cargado: sale del plan del préstamo, más abajo en
          esta misma página. Por eso acá no hay filas que editar.
        </p>
      )}
    </div>
  );
}
