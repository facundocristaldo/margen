'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
    mesActual,
    generarMeses,
    proyectarHorizonte,
    formatearMonto,
    formatearMes,
    sumarMeses,
} from '@/lib/reglas';
import { useState } from 'react';
import clsx from 'clsx';

export default function PaginaHorizonte() {
    const perfil = useLiveQuery(() => db.perfilFinanciero.get('perfil'));
    const compromisos = useLiveQuery(() => db.compromisosRecurrentes.toArray());
    const planes = useLiveQuery(() => db.planesDeCuotas.where('estado').equals('activo').toArray());
    const tiposCambio = useLiveQuery(() => db.tiposDeCambio.toArray());
    const aportesAhorro = useLiveQuery(() => db.aportesAhorro.toArray());
    const gastosPlanificados = useLiveQuery(() => db.gastosPlanificados.where('estado').equals('activo').toArray());

    const [mesExpandido, setMesExpandido] = useState<string | null>(null);

    if (!perfil || !compromisos || !planes || !tiposCambio || !aportesAhorro || !gastosPlanificados) {
        return <div className="p-4 text-center" style={{ color: 'var(--muted)' }}>Cargando…</div>;
    }

    if (perfil.ingresoNeto === 0) {
        return (
            <div className="p-4 text-center" style={{ color: 'var(--muted)' }}>
                Configurá tu perfil en Ajustes para ver el horizonte.
            </div>
        );
    }

    const meses = generarMeses(mesActual(), 12);
    const proyeccion = proyectarHorizonte(
        perfil, compromisos, planes, aportesAhorro, tiposCambio, gastosPlanificados, meses,
    );

    const maxDisponible = Math.max(...proyeccion.map(m => Math.abs(m.disponible)), 1);

    return (
        <div className="max-w-lg mx-auto">
            <div className="px-4 pt-6 pb-4">
                <h1 className="text-xl font-bold tracking-tight">Horizonte</h1>
                <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                    12 meses — cuánto queda después de compromisos
                </p>
            </div>

            {/* Tabla */}
            <div className="px-4 pb-8">
                {/* Header */}
                <div
                    className="grid text-xs font-semibold uppercase tracking-widest py-2 mb-1"
                    style={{ gridTemplateColumns: '5rem 1fr 1fr 1fr', color: 'var(--muted)' }}
                >
                    <div>Mes</div>
                    <div className="text-right">Techo</div>
                    <div className="text-right">Compr.</div>
                    <div className="text-right">Disponible</div>
                </div>

                <div className="flex flex-col gap-1">
                    {proyeccion.map((m) => {
                        const enRojo = m.disponible < 0;
                        const tieneLibera = m.liberaciones.length > 0;
                        const expandido = mesExpandido === m.mes;

                        return (
                            <div key={m.mes}>
                                <button
                                    className={clsx(
                                        'w-full grid py-3 px-2 rounded-xl text-sm transition-all active:opacity-70',
                                        expandido && 'rounded-b-none',
                                        enRojo ? 'bg-red-50 dark:bg-red-950' : '',
                                    )}
                                    style={
                                        !enRojo
                                            ? { background: 'var(--surface)', border: '1px solid var(--border)' }
                                            : { border: '1px solid #fca5a5' }
                                    }
                                    onClick={() => setMesExpandido(expandido ? null : m.mes)}
                                    aria-expanded={expandido}
                                    aria-label={`${formatearMes(m.mes)}: disponible ${formatearMonto(m.disponible, perfil.monedaReferencia)}`}

                                >
                                    <div
                                        className="grid items-center"
                                        style={{ gridTemplateColumns: '5rem 1fr 1fr 1fr' }}
                                    >
                                        <div className="font-semibold text-left flex items-center gap-1">
                                            {formatearMes(m.mes)}
                                            {tieneLibera && (
                                                <span className="text-xs" style={{ color: 'var(--color-ok)' }} title="Se libera un compromiso">↑</span>
                                            )}
                                        </div>
                                        <div className="tabnum text-right text-xs" style={{ color: 'var(--muted)' }}>
                                            {formatearMonto(m.techo, perfil.monedaReferencia)}
                                        </div>
                                        <div className="tabnum text-right text-xs" style={{ color: 'var(--muted)' }}>
                                            {formatearMonto(m.comprometido, perfil.monedaReferencia)}
                                        </div>
                                        <div
                                            className={clsx('tabnum text-right font-semibold', enRojo ? 'text-red-600 dark:text-red-400' : '')}
                                        >
                                            {m.disponible >= 0 ? '+' : ''}{formatearMonto(m.disponible, perfil.monedaReferencia)}
                                        </div>
                                    </div>

                                    {/* Mini barra */}
                                    <div className="mt-2 rounded-full h-1 overflow-hidden" style={{ background: 'var(--border)' }}>
                                        <div
                                            className={clsx('h-full rounded-full', enRojo ? 'barra-danger' : 'barra-ok')}
                                            style={{ width: `${Math.min(100, (Math.max(0, m.disponible) / maxDisponible) * 100)}%` }}
                                        />
                                    </div>
                                </button>

                                {/* Detalle expandido */}
                                {expandido && (
                                    <div
                                        className="rounded-b-xl px-4 pb-3 pt-2 text-xs"
                                        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: 'none' }}
                                    >
                                        {m.cuotasDetalle.length > 0 && (
                                            <div className="mb-2">
                                                <div className="font-semibold mb-1" style={{ color: 'var(--muted)' }}>Cuotas activas</div>
                                                {m.cuotasDetalle.map(c => (
                                                    <div key={c.planId} className="flex justify-between py-0.5">
                                                        <span>{c.comercio} ({c.cuotaNro}/{c.cuotasTotal})</span>
                                                        <span className="tabnum">{formatearMonto(c.importe, perfil.monedaReferencia)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {m.compromisoDetalle.length > 0 && (
                                            <div className="mb-2">
                                                <div className="font-semibold mb-1" style={{ color: 'var(--muted)' }}>Compromisos</div>
                                                {m.compromisoDetalle.map(c => (
                                                    <div key={c.nombre} className="flex justify-between py-0.5">
                                                        <span>{c.nombre}</span>
                                                        <span className="tabnum">{formatearMonto(c.importe, perfil.monedaReferencia)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {m.liberaciones.length > 0 && (
                                            <div
                                                className="rounded-lg px-3 py-2 mt-1"
                                                style={{ background: '#f0fdf4', color: '#166534' }}
                                            >
                                                {m.liberaciones.map(l => (
                                                    <div key={l.nombre}>
                                                        ↑ Desde {formatearMes(sumarMeses(m.mes, 1))} se liberan {formatearMonto(l.importe, perfil.monedaReferencia)}/mes ({l.nombre})
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
