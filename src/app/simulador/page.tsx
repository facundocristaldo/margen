'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
    techo,
    simularCompraEnCuotas,
    mesActual,
    formatearMonto,
    formatearMes,
    sumarMeses,
} from '@/lib/reglas';
import clsx from 'clsx';
import Link from 'next/link';

const OPCIONES_CUOTAS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24];

export default function PaginaSimulador() {
    const [monto, setMonto] = useState('');
    const [cuotas, setCuotas] = useState(1);

    const perfil = useLiveQuery(() => db.perfilFinanciero.get('perfil'));
    const compromisos = useLiveQuery(() => db.compromisosRecurrentes.toArray());
    const planes = useLiveQuery(() => db.planesDeCuotas.where('estado').equals('activo').toArray());
    const tiposCambio = useLiveQuery(() => db.tiposDeCambio.toArray());
    const aportesAhorro = useLiveQuery(() => db.aportesAhorro.toArray());

    if (!perfil || !compromisos || !planes || !tiposCambio || !aportesAhorro) {
        return <div className="p-4 text-center" style={{ color: 'var(--muted)' }}>Cargando…</div>;
    }

    const perfilOk = perfil;
    const montoNum = parseFloat(monto) || 0;
    const mes = mesActual();

    function getDisponible(m: string): number {
        return techo({
            perfil: perfilOk,
            compromisosRecurrentes: compromisos!,
            planesDeCuotas: planes!,
            aportesAhorro: aportesAhorro!,
            tiposCambio: tiposCambio!,
            mes: m,
        });
    }

    const simulacion = montoNum > 0
        ? simularCompraEnCuotas(montoNum, cuotas, mes, getDisponible)
        : null;

    const hayRojo = simulacion ? simulacion.mesesEnRojo.length > 0 : false;
    const primerMesSeguro = simulacion?.proyectado.find(p => p.disponibleDespues >= (perfilOk.colchonObjetivo ?? 0))?.mes ?? null;

    const TECLAS = [
        ['7', '8', '9'],
        ['4', '5', '6'],
        ['1', '2', '3'],
        ['.', '0', '⌫'],
    ];

    function presionarTecla(tecla: string) {
        if (tecla === '⌫') {
            setMonto(prev => prev.slice(0, -1));
        } else if (tecla === '.') {
            if (!monto.includes('.')) setMonto(prev => prev + '.');
        } else {
            const partes = monto.split('.');
            if (partes[0].length >= 9) return;
            if (partes[1] && partes[1].length >= 2) return;
            setMonto(prev => prev + tecla);
        }
    }

    const moneda = perfilOk.monedaReferencia;

    return (
        <div className="max-w-lg mx-auto">
            <div className="px-4 pt-6 pb-2">
                <h1 className="text-xl font-bold tracking-tight">Simulador</h1>
                <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                    ¿Qué pasa si comprás esto en cuotas?
                </p>
            </div>

            <div className="px-4 pb-6">
                {/* Monto */}
                <div
                    className="rounded-xl p-4 mb-4"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                    <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
                        Monto
                    </div>
                    <div
                        className="tabnum font-bold leading-none"
                        style={{ fontSize: 'clamp(1.8rem, 8vw, 3rem)' }}
                    >
                        {moneda === 'USD' ? 'USD ' : '$ '}{monto || '0'}
                    </div>

                    {/* Teclado */}
                    <div className="grid grid-cols-3 gap-2 mt-4">
                        {TECLAS.flat().map(tecla => (
                            <button
                                key={tecla}
                                onClick={() => presionarTecla(tecla)}
                                className="rounded-lg font-mono text-lg font-medium min-h-[44px] transition-all active:opacity-50 flex items-center justify-center"
                                style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                aria-label={tecla === '⌫' ? 'Borrar' : tecla}
                            >
                                {tecla}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Selector de cuotas */}
                <div className="mb-4">
                    <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
                        Cuotas
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {OPCIONES_CUOTAS.map(n => (
                            <button
                                key={n}
                                onClick={() => setCuotas(n)}
                                className={clsx(
                                    'rounded-full px-3 py-1.5 text-sm font-medium min-h-[36px] transition-all',
                                    cuotas === n ? '' : 'opacity-50'
                                )}
                                style={
                                    cuotas === n
                                        ? { background: 'var(--foreground)', color: 'var(--background)' }
                                        : { background: 'var(--surface)', border: '1px solid var(--border)' }
                                }
                                aria-pressed={cuotas === n}
                                aria-label={`${n} cuota${n > 1 ? 's' : ''}`}
                            >
                                {n}x
                            </button>
                        ))}
                    </div>
                </div>

                {/* Resultado */}
                {simulacion && (
                    <div>
                        {/* Resumen */}
                        <div
                            className="rounded-xl p-4 mb-4"
                            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                        >
                            <div className="flex justify-between items-baseline">
                                <div className="text-sm" style={{ color: 'var(--muted)' }}>
                                    {formatearMonto(montoNum, moneda)} en {cuotas} cuota{cuotas > 1 ? 's' : ''}
                                </div>
                                <div className="tabnum font-bold">
                                    {formatearMonto(simulacion.cuotaMensual, moneda)}/mes
                                </div>
                            </div>
                            <div className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                                Libera en {formatearMes(simulacion.liberaEn)}
                            </div>
                        </div>

                        {/* Proyección por mes */}
                        <div className="flex flex-col gap-2 mb-4">
                            {simulacion.proyectado.map(p => {
                                const enRojo = p.disponibleDespues < 0;
                                const bajoColchon = p.disponibleDespues >= 0 && p.disponibleDespues < (perfilOk.colchonObjetivo ?? 0);
                                const maxVal = Math.max(Math.abs(p.disponibleAntes), 1);
                                const pct = Math.min(100, (Math.max(0, p.disponibleDespues) / maxVal) * 100);

                                return (
                                    <div
                                        key={p.mes}
                                        className="rounded-xl px-3 py-2"
                                        style={{ background: 'var(--surface)', border: `1px solid ${enRojo ? '#fca5a5' : 'var(--border)'}` }}
                                    >
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="font-semibold">{formatearMes(p.mes)}</span>
                                            <div className="tabnum flex items-center gap-2">
                                                <span style={{ color: 'var(--muted)' }}>
                                                    {p.disponibleAntes >= 0 ? '+' : ''}{formatearMonto(p.disponibleAntes, moneda)}
                                                </span>
                                                <span>→</span>
                                                <span className={clsx(
                                                    'font-semibold',
                                                    enRojo ? 'text-red-600 dark:text-red-400' :
                                                        bajoColchon ? 'text-orange-600 dark:text-orange-400' : ''
                                                )}>
                                                    {p.disponibleDespues >= 0 ? '+' : ''}{formatearMonto(p.disponibleDespues, moneda)}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="mt-1.5 rounded-full h-1.5 overflow-hidden" style={{ background: 'var(--border)' }}>
                                            <div
                                                className={clsx('h-full rounded-full', enRojo ? 'barra-danger' : bajoColchon ? 'barra-warn' : 'barra-ok')}
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Alerta y CTA */}
                        {hayRojo && (
                            <div
                                className="rounded-xl p-4 mb-4"
                                style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}
                            >
                                <p className="text-sm text-orange-800 dark:text-orange-200 mb-3">
                                    ⚠ Algunos meses quedan en rojo. La compra no cabe en {formatearMes(mes)}.
                                </p>
                                {primerMesSeguro && (
                                    <button
                                        className="w-full rounded-xl py-3 text-sm font-semibold transition-opacity active:opacity-70"
                                        style={{ background: 'var(--foreground)', color: 'var(--background)' }}
                                        onClick={() => {
                                            // TODO: agendar compra para primerMesSeguro
                                        }}
                                    >
                                        Agendar para {formatearMes(primerMesSeguro)}
                                    </button>
                                )}
                            </div>
                        )}

                        {!hayRojo && montoNum > 0 && (
                            <div
                                className="rounded-xl p-3 mb-4 text-sm"
                                style={{ background: '#f0fdf4', border: '1px solid #86efac', color: '#166534' }}
                            >
                                ✓ Esta compra cabe en el mes sin romper el margen.
                            </div>
                        )}

                        {/* Colchón warning */}
                        {simulacion.proyectado.some(p => p.disponibleDespues >= 0 && p.disponibleDespues < (perfilOk.colchonObjetivo ?? 0)) && !hayRojo && (
                            <div
                                className="rounded-xl p-3 mb-4 text-sm"
                                style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#92400e' }}
                            >
                                ⚠ {simulacion.proyectado.find(p => p.disponibleDespues >= 0 && p.disponibleDespues < (perfilOk.colchonObjetivo ?? 0))?.mes
                                    ? `${formatearMes(simulacion.proyectado.find(p => p.disponibleDespues >= 0 && p.disponibleDespues < (perfilOk.colchonObjetivo ?? 0))!.mes)} queda en ${formatearMonto(simulacion.proyectado.find(p => p.disponibleDespues >= 0 && p.disponibleDespues < (perfilOk.colchonObjetivo ?? 0))!.disponibleDespues, moneda)}, por debajo del colchón de ${formatearMonto(perfilOk.colchonObjetivo, moneda)}.`
                                    : 'Algunos meses quedan bajo el colchón objetivo.'}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
