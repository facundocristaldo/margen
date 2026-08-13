'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
    mesActual,
    consumoDelCiclo,
    formatearMonto,
    formatearMes,
    sumarMeses,
    generarMeses,
} from '@/lib/reglas';
import { useState } from 'react';
import clsx from 'clsx';

const COLOR_SLOTS = [
    'var(--viz-1)',
    'var(--viz-2)',
    'var(--viz-3)',
    'var(--viz-4)',
    'var(--viz-5)',
    'var(--viz-6)',
];

interface GastoPorCategoria {
    categoriaId: string;
    nombre: string;
    icono: string;
    colorSlot: number;
    esEsencial: boolean;
    monto: number;
    count: number;
}

export default function PaginaDashboard() {
    const perfil = useLiveQuery(() => db.perfilFinanciero.get('perfil'));
    const categorias = useLiveQuery(() => db.categorias.toArray());
    const tiposCambio = useLiveQuery(() => db.tiposDeCambio.toArray());

    const [vista, setVista] = useState<'categoria' | 'esencial' | 'tabla'>('categoria');

    // Movimientos del ciclo actual (últimos 30 días como aproximación)
    const movimientosCiclo = useLiveQuery(async () => {
        const hace35 = new Date();
        hace35.setDate(hace35.getDate() - 35);
        return db.movimientos
            .where('fecha').aboveOrEqual(hace35.toISOString().slice(0, 10))
            .filter(m => m.clase === 'gasto' && m.estado !== 'absorbido' && !m.revertidoPor)
            .toArray();
    });

    // Últimos 3 ciclos para comparación
    const movimientos3ciclos = useLiveQuery(async () => {
        const hace100 = new Date();
        hace100.setDate(hace100.getDate() - 100);
        return db.movimientos
            .where('fecha').aboveOrEqual(hace100.toISOString().slice(0, 10))
            .filter(m => m.clase === 'gasto' && m.estado !== 'absorbido' && !m.revertidoPor)
            .toArray();
    });

    // Histórico 12 meses
    const movimientosHistorico = useLiveQuery(async () => {
        const hace365 = new Date();
        hace365.setDate(hace365.getDate() - 365);
        return db.movimientos
            .where('fecha').aboveOrEqual(hace365.toISOString().slice(0, 10))
            .filter(m => m.clase === 'gasto' && m.estado !== 'absorbido' && !m.revertidoPor)
            .toArray();
    });

    if (!perfil || !categorias || !tiposCambio || !movimientosCiclo || !movimientos3ciclos) {
        return <div className="p-4 text-center" style={{ color: 'var(--muted)' }}>Cargando…</div>;
    }

    const moneda = perfil.monedaReferencia;
    const catMap = new Map(categorias.map(c => [c.id, c]));

    // Agrupar por categoría
    const porCategoria = new Map<string, GastoPorCategoria>();
    let totalCiclo = 0;

    for (const m of movimientosCiclo) {
        const catId = m.categoriaId ?? 'efectivo';
        const cat = catMap.get(catId);
        const monto = Math.abs(m.importe);
        totalCiclo += monto;

        if (!porCategoria.has(catId)) {
            porCategoria.set(catId, {
                categoriaId: catId,
                nombre: cat?.nombre ?? catId,
                icono: cat?.icono ?? '📦',
                colorSlot: cat?.colorSlot ?? 1,
                esEsencial: cat?.esEsencial ?? false,
                monto: 0,
                count: 0,
            });
        }
        const g = porCategoria.get(catId)!;
        g.monto += monto;
        g.count++;
    }

    const gastosOrdenados = Array.from(porCategoria.values())
        .sort((a, b) => b.monto - a.monto);

    // Top 6 llevan color, el resto va a "Otros"
    const top6 = gastosOrdenados.slice(0, 6);
    const otros = gastosOrdenados.slice(6);
    const totalOtros = otros.reduce((t, g) => t + g.monto, 0);

    // Media de 3 ciclos
    const total3ciclos = consumoDelCiclo(movimientos3ciclos, moneda, tiposCambio);
    const media3ciclos = total3ciclos / 3;
    const deltaPct = media3ciclos > 0
        ? Math.round(((totalCiclo - media3ciclos) / media3ciclos) * 100)
        : 0;

    // Esencial vs recortable
    const totalEsencial = gastosOrdenados.filter(g => g.esEsencial).reduce((t, g) => t + g.monto, 0);
    const totalRecortable = totalCiclo - totalEsencial;

    // Histórico 12 meses para mini chart
    const meses12 = generarMeses(sumarMeses(mesActual(), -11), 12);
    const historicoPorMes = meses12.map(m => {
        const movs = (movimientosHistorico ?? []).filter(mv => mv.fecha.slice(0, 7) === m);
        return movs.reduce((t, mv) => t + Math.abs(mv.importe), 0);
    });
    const maxHistorico = Math.max(...historicoPorMes, 1);

    return (
        <div className="max-w-lg mx-auto">
            <div className="px-4 pt-6 pb-2">
                <h1 className="text-xl font-bold tracking-tight">Análisis</h1>
                <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                    En qué se va la plata
                </p>
            </div>

            {/* Cifra principal */}
            <div className="px-4 pb-4">
                <div
                    className="rounded-xl p-4"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                    <div className="text-xs uppercase tracking-widest mb-1" style={{ color: 'var(--muted)' }}>
                        Gasto del ciclo
                    </div>
                    <div className="flex items-baseline gap-3">
                        <div className="tabnum font-bold text-2xl">
                            {formatearMonto(totalCiclo, moneda)}
                        </div>
                        {media3ciclos > 0 && (
                            <div
                                className={clsx('text-sm font-medium tabnum', deltaPct <= 0 ? 'estado-ok' : 'estado-warn')}
                            >
                                {deltaPct > 0 ? '▲' : '▼'} {Math.abs(deltaPct)}% vs media 3 ciclos
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabs de vista */}
            <div className="px-4 mb-4">
                <div
                    className="flex rounded-xl overflow-hidden"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                    role="tablist"
                >
                    {([
                        { id: 'categoria', label: 'Categorías' },
                        { id: 'esencial', label: 'Esencial' },
                        { id: 'tabla', label: 'Tabla' },
                    ] as const).map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setVista(tab.id)}
                            role="tab"
                            aria-selected={vista === tab.id}
                            className="flex-1 py-2 text-sm font-medium transition-all"
                            style={
                                vista === tab.id
                                    ? { background: 'var(--foreground)', color: 'var(--background)' }
                                    : {}
                            }
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="px-4 pb-8">
                {/* Vista: por categoría */}
                {vista === 'categoria' && (
                    <div className="flex flex-col gap-2">
                        {top6.map(g => {
                            const pct = totalCiclo > 0 ? (g.monto / totalCiclo) * 100 : 0;
                            const color = COLOR_SLOTS[(g.colorSlot - 1) % COLOR_SLOTS.length];
                            return (
                                <div key={g.categoriaId} className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 w-36 shrink-0">
                                        <span>{g.icono}</span>
                                        <span className="text-sm truncate">{g.nombre}</span>
                                    </div>
                                    <div className="flex-1 rounded-full h-3 overflow-hidden" style={{ background: 'var(--border)' }}>
                                        <div
                                            className="h-full rounded-full"
                                            style={{ width: `${pct}%`, background: color }}
                                        />
                                    </div>
                                    <div className="tabnum text-sm w-20 text-right">
                                        {formatearMonto(g.monto, moneda)}
                                    </div>
                                </div>
                            );
                        })}

                        {totalOtros > 0 && (
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 w-36 shrink-0">
                                    <span>📦</span>
                                    <span className="text-sm">Otros ({otros.length})</span>
                                </div>
                                <div className="flex-1 rounded-full h-3 overflow-hidden" style={{ background: 'var(--border)' }}>
                                    <div
                                        className="h-full rounded-full"
                                        style={{ width: `${totalCiclo > 0 ? (totalOtros / totalCiclo) * 100 : 0}%`, background: 'var(--viz-otros)' }}
                                    />
                                </div>
                                <div className="tabnum text-sm w-20 text-right" style={{ color: 'var(--muted)' }}>
                                    {formatearMonto(totalOtros, moneda)}
                                </div>
                            </div>
                        )}

                        {gastosOrdenados.length === 0 && (
                            <div className="text-center py-8" style={{ color: 'var(--muted)' }}>
                                <div className="text-3xl mb-2">▤</div>
                                <div className="text-sm">Sin movimientos en el ciclo</div>
                            </div>
                        )}
                    </div>
                )}

                {/* Vista: esencial vs recortable */}
                {vista === 'esencial' && (
                    <div>
                        <div className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
                            El gasto esencial no se puede recortar fácilmente
                        </div>
                        {/* Barra apilada única */}
                        <div className="rounded-full h-8 overflow-hidden flex mb-4" style={{ background: 'var(--border)' }}>
                            <div
                                className="h-full barra-ok flex items-center justify-center text-xs text-white font-medium px-2"
                                style={{ width: `${totalCiclo > 0 ? (totalEsencial / totalCiclo) * 100 : 0}%` }}
                            >
                                {totalCiclo > 0 && (totalEsencial / totalCiclo) > 0.15 && 'Esencial'}
                            </div>
                            <div
                                className="h-full flex items-center justify-center text-xs font-medium px-2"
                                style={{
                                    width: `${totalCiclo > 0 ? (totalRecortable / totalCiclo) * 100 : 0}%`,
                                    background: 'var(--viz-2)',
                                    color: 'white',
                                }}
                            >
                                {totalCiclo > 0 && (totalRecortable / totalCiclo) > 0.15 && 'Recortable'}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div
                                className="rounded-xl p-3"
                                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                            >
                                <div className="text-xs mb-1 estado-ok">Esencial</div>
                                <div className="tabnum font-bold">{formatearMonto(totalEsencial, moneda)}</div>
                                <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                                    {totalCiclo > 0 ? Math.round((totalEsencial / totalCiclo) * 100) : 0}% del total
                                </div>
                            </div>
                            <div
                                className="rounded-xl p-3"
                                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                            >
                                <div className="text-xs mb-1" style={{ color: 'var(--viz-2)' }}>Recortable</div>
                                <div className="tabnum font-bold">{formatearMonto(totalRecortable, moneda)}</div>
                                <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                                    {totalCiclo > 0 ? Math.round((totalRecortable / totalCiclo) * 100) : 0}% del total
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Vista: tabla */}
                {vista === 'tabla' && (
                    <div>
                        <div
                            className="grid text-xs font-semibold uppercase tracking-widest py-2"
                            style={{ gridTemplateColumns: '1fr 5rem 4rem 3rem', color: 'var(--muted)' }}
                        >
                            <div>Categoría</div>
                            <div className="text-right">Monto</div>
                            <div className="text-right">%</div>
                            <div className="text-right">Mov.</div>
                        </div>
                        {gastosOrdenados.map(g => {
                            const pct = totalCiclo > 0 ? (g.monto / totalCiclo) * 100 : 0;
                            return (
                                <div
                                    key={g.categoriaId}
                                    className="grid py-2.5 border-b text-sm items-center"
                                    style={{ gridTemplateColumns: '1fr 5rem 4rem 3rem', borderColor: 'var(--border)' }}
                                >
                                    <div className="flex items-center gap-2">
                                        <span>{g.icono}</span>
                                        <span className="truncate">{g.nombre}</span>
                                        {g.esEsencial && (
                                            <span className="text-xs px-1 rounded" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
                                                esencial
                                            </span>
                                        )}
                                    </div>
                                    <div className="tabnum text-right font-medium">
                                        {formatearMonto(g.monto, moneda)}
                                    </div>
                                    <div className="tabnum text-right" style={{ color: 'var(--muted)' }}>
                                        {pct.toFixed(1)}%
                                    </div>
                                    <div className="tabnum text-right" style={{ color: 'var(--muted)' }}>
                                        {g.count}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Evolución 12 meses */}
                <div className="mt-6">
                    <div className="text-xs uppercase tracking-widest mb-3" style={{ color: 'var(--muted)' }}>
                        Doce meses
                    </div>
                    <div className="flex gap-1 items-end h-16">
                        {historicoPorMes.map((val, i) => {
                            const pct = (val / maxHistorico) * 100;
                            return (
                                <div key={meses12[i]} className="flex-1 flex flex-col items-center gap-1">
                                    <div
                                        className="w-full rounded-sm"
                                        style={{
                                            height: `${Math.max(2, pct * 0.52)}px`,
                                            background: i === historicoPorMes.length - 1 ? 'var(--foreground)' : 'var(--border)',
                                        }}
                                        title={`${formatearMes(meses12[i])}: ${formatearMonto(val, moneda)}`}
                                    />
                                    {i % 3 === 0 && (
                                        <span className="text-xs" style={{ color: 'var(--muted)', fontSize: '9px' }}>
                                            {formatearMes(meses12[i]).slice(0, 3)}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
