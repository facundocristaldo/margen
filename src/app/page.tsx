'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  techo,
  consumoDelCiclo,
  mesActual,
  formatearMonto,
  formatearMes,
  sumarMeses,
} from '@/lib/reglas';
import { evaluarAlertas } from '@/lib/alertas';
import { AlertaBanner } from '@/components/AlertaBanner';
import Link from 'next/link';
import clsx from 'clsx';

export default function PaginaHoy() {
  const perfil = useLiveQuery(() => db.perfilFinanciero.get('perfil'));
  const compromisos = useLiveQuery(() => db.compromisosRecurrentes.toArray());
  const planes = useLiveQuery(() => db.planesDeCuotas.where('estado').equals('activo').toArray());
  const tiposCambio = useLiveQuery(() => db.tiposDeCambio.toArray());
  const ciclosTarjeta = useLiveQuery(() => db.ciclosTarjeta.toArray());
  const cuentas = useLiveQuery(() => db.cuentas.toArray());
  const aportesAhorro = useLiveQuery(() => db.aportesAhorro.toArray());
  const movimientosSinRevisar = useLiveQuery(() =>
    db.movimientos.where('estado').equals('previsto').count()
  );
  const planesQueTerminan = useLiveQuery(() => {
    const mes = mesActual();
    return db.planesDeCuotas
      .where('estado').equals('activo')
      .toArray()
      .then(ps => ps.filter(p => sumarMeses(p.primeraCuota, p.cuotasTotal - 1) === mes));
  });

  const mes = mesActual();

  const movimientosCiclo = useLiveQuery(() => {
    const ciclo = ciclosTarjeta?.[0];
    if (!ciclo) return db.movimientos.toArray();
    const hoy = new Date();
    const año = hoy.getFullYear();
    const mesNum = hoy.getMonth() + 1;
    // inicio del ciclo: día de cierre del mes anterior
    const inicioCiclo = new Date(año, mesNum - 1, ciclo.diaCierre + 1);
    const inicioCicloStr = inicioCiclo.toISOString().slice(0, 10);
    return db.movimientos
      .where('fecha').aboveOrEqual(inicioCicloStr)
      .toArray();
  }, [ciclosTarjeta]);

  if (!perfil || !compromisos || !planes || !tiposCambio || !aportesAhorro) {
    return <div className="p-4 text-center" style={{ color: 'var(--muted)' }}>Cargando…</div>;
  }

  // Si no hay perfil configurado, mostrar onboarding
  if (perfil.ingresoNeto === 0) {
    return <Onboarding />;
  }

  const inputTecho = {
    perfil,
    compromisosRecurrentes: compromisos,
    planesDeCuotas: planes,
    aportesAhorro: aportesAhorro,
    tiposCambio,
    mes,
  };

  const techoMes = techo(inputTecho);
  const consumo = consumoDelCiclo(
    movimientosCiclo ?? [],
    perfil.monedaReferencia,
    tiposCambio,
  );
  const disponibleMes = techoMes - consumo;
  const porcentajeUsado = techoMes > 0 ? Math.min(100, (consumo / techoMes) * 100) : 0;

  // Ciclo actual
  const ciclo = ciclosTarjeta?.[0];
  const hoy = new Date();
  const fechaCierre = ciclo
    ? new Date(hoy.getFullYear(), hoy.getMonth(), ciclo.diaCierre)
    : null;
  const diasAlCierre = fechaCierre
    ? Math.max(0, Math.ceil((fechaCierre.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  // Reserva fiscal
  const bovedaFiscal = 0; // TODO: leer de estado guardado
  const reservaFiscal = perfil.ingresoNeto * perfil.tasaIva;

  // Comprometido a 12 meses (suma de cuotas futuras)
  const comprometido12m = planes.reduce((total, p) => {
    let sum = 0;
    for (let i = 0; i < p.cuotasTotal; i++) {
      const m = sumarMeses(p.primeraCuota, i);
      if (m >= mes && m <= sumarMeses(mes, 11)) sum += p.importeCuota;
    }
    return total + sum;
  }, 0);

  const alertas = evaluarAlertas({
    perfil,
    saldoLiquido: disponibleMes,
    reservaFiscal,
    consumoCiclo: consumo,
    techo: techoMes,
    colchon: perfil.colchonObjetivo,
    movimientosSinRevisar: movimientosSinRevisar ?? 0,
    planesQueTerminan: (planesQueTerminan ?? []).map(p => ({
      nombre: p.comercio,
      importe: p.importeCuota,
    })),
  });

  // Semáforo
  const estadoColor =
    disponibleMes < 0
      ? 'estado-danger'
      : porcentajeUsado > 80
        ? 'estado-warn'
        : 'estado-ok';

  const barraColor =
    disponibleMes < 0
      ? 'barra-danger'
      : porcentajeUsado > 80
        ? 'barra-warn'
        : 'barra-ok';

  return (
    <div className="max-w-lg mx-auto">
      {/* Header */}
      <div className="px-4 pt-6 pb-2 flex items-baseline justify-between">
        <h1 className="text-sm font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
          {ciclo && fechaCierre
            ? `CICLO · cierra en ${diasAlCierre}d`
            : `MES ${formatearMes(mes)}`}
        </h1>
        <Link href="/ajustes" className="text-sm" style={{ color: 'var(--muted)' }}>
          ⚙
        </Link>
      </div>

      {/* Alertas */}
      <AlertaBanner alertas={alertas} />

      {/* Número principal */}
      <div className="px-4 pt-6 pb-4">
        <div className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>
          Disponible
        </div>
        <div
          className={clsx('tabnum font-bold leading-none', estadoColor)}
          style={{ fontSize: 'clamp(2.5rem, 12vw, 4rem)' }}
          aria-label={`Disponible: ${formatearMonto(disponibleMes, perfil.monedaReferencia)}`}
        >
          {formatearMonto(disponibleMes, perfil.monedaReferencia)}
        </div>
        <div className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>
          de un techo de {formatearMonto(techoMes, perfil.monedaReferencia)} · {Math.round(porcentajeUsado)}% usado
        </div>

        {/* Barra de progreso */}
        <div
          className="mt-3 rounded-full overflow-hidden h-2"
          style={{ background: 'var(--border)' }}
          role="progressbar"
          aria-valuenow={Math.round(porcentajeUsado)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${Math.round(porcentajeUsado)}% del techo usado`}
        >
          <div
            className={clsx('h-full rounded-full transition-all', barraColor)}
            style={{ width: `${Math.min(100, porcentajeUsado)}%` }}
          />
        </div>
      </div>

      {/* Divider con info de débito */}
      {ciclo && (
        <div
          className="mx-4 rounded-lg px-4 py-3 flex justify-between items-center text-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <span style={{ color: 'var(--muted)' }}>
            Se debita el {ciclo.diaVencimiento}/{(hoy.getMonth() + 2) % 12 || 12}
          </span>
          <span className="tabnum font-semibold">
            {formatearMonto(consumo, perfil.monedaReferencia)}
          </span>
        </div>
      )}

      {/* Resumen inferior */}
      <div className="grid grid-cols-2 gap-3 px-4 pt-3">
        <MetricaCard
          label="Bóveda fiscal"
          valor={formatearMonto(reservaFiscal, perfil.monedaReferencia)}
          estado={bovedaFiscal >= reservaFiscal ? '✓ cubierto' : '⚠ revisar'}
          href="/boveda"
        />
        <MetricaCard
          label="Comprometido 12m"
          valor={formatearMonto(comprometido12m, perfil.monedaReferencia)}
          href="/horizonte"
        />
      </div>

      {/* Acciones rápidas */}
      <div className="px-4 pt-6 pb-4">
        <div className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
          Acciones rápidas
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/captura"
            className="flex flex-col items-center justify-center gap-1 rounded-xl py-4 text-sm font-medium transition-opacity active:opacity-70"
            style={{ background: 'var(--foreground)', color: 'var(--background)', minHeight: 64 }}
          >
            <span className="text-xl">+</span>
            <span>Registrar gasto</span>
          </Link>
          <Link
            href="/simulador"
            className="flex flex-col items-center justify-center gap-1 rounded-xl py-4 text-sm font-medium transition-opacity active:opacity-70"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', minHeight: 64 }}
          >
            <span className="text-xl">◐</span>
            <span>Simular compra</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

function MetricaCard({
  label,
  valor,
  estado,
  href,
}: {
  label: string;
  valor: string;
  estado?: string;
  href?: string;
}) {
  const content = (
    <div
      className="rounded-xl p-3 flex flex-col gap-1"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="text-xs" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="tabnum font-semibold text-base">{valor}</div>
      {estado && (
        <div className="text-xs" style={{ color: 'var(--muted)' }}>{estado}</div>
      )}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

function Onboarding() {
  return (
    <div className="max-w-lg mx-auto px-4 pt-12 pb-8">
      <h1 className="text-3xl font-bold tracking-tight mb-3">Margen</h1>
      <p className="text-base mb-8" style={{ color: 'var(--muted)' }}>
        ¿Cuánto podés gastar hoy sin romper los próximos doce meses?
      </p>
      <div
        className="rounded-xl p-5 mb-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="text-sm font-semibold mb-2">Para empezar necesitás:</div>
        <ol className="text-sm space-y-2 list-decimal list-inside" style={{ color: 'var(--muted)' }}>
          <li>Tu ingreso neto mensual</li>
          <li>Tus compromisos fijos (préstamos, servicios)</li>
          <li>Los planes de cuotas activos</li>
        </ol>
      </div>
      <Link
        href="/ajustes"
        className="block text-center rounded-xl py-4 font-semibold text-base transition-opacity active:opacity-70"
        style={{ background: 'var(--foreground)', color: 'var(--background)' }}
      >
        Configurar perfil →
      </Link>
    </div>
  );
}
