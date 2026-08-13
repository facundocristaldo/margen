'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
    techo,
    mesActual,
    generarMeses,
    aporteMensual,
    fechaAlcanzable,
    formatearMonto,
    formatearMes,
    sumarMeses,
    parsearMes,
} from '@/lib/reglas';
import type { GastoPlanificado } from '@/types/domain';
import clsx from 'clsx';

export default function PaginaPlan() {
    const perfil = useLiveQuery(() => db.perfilFinanciero.get('perfil'));
    const compromisos = useLiveQuery(() => db.compromisosRecurrentes.toArray());
    const planes = useLiveQuery(() => db.planesDeCuotas.where('estado').equals('activo').toArray());
    const tiposCambio = useLiveQuery(() => db.tiposDeCambio.toArray());
    const aportesAhorro = useLiveQuery(() => db.aportesAhorro.toArray());
    const metas = useLiveQuery(() => db.gastosPlanificados.orderBy('prioridad').toArray());

    const [mostrarFormMeta, setMostrarFormMeta] = useState(false);
    const [nuevaMeta, setNuevaMeta] = useState({
        nombre: '',
        montoObjetivo: '',
        fechaObjetivo: '',
        estrategia: 'ahorrar' as GastoPlanificado['estrategia'],
    });

    if (!perfil || !compromisos || !planes || !tiposCambio || !aportesAhorro || !metas) {
        return <div className="p-4 text-center" style={{ color: 'var(--muted)' }}>Cargando…</div>;
    }

    const mes = mesActual();
    const meses12 = generarMeses(mes, 24);
    const moneda = perfil.monedaReferencia;

    function getTecho(m: string): number {
        return techo({
            perfil: perfil!,
            compromisosRecurrentes: compromisos!,
            planesDeCuotas: planes!,
            aportesAhorro: aportesAhorro!,
            tiposCambio: tiposCambio!,
            mes: m,
        });
    }

    const capacidadPorMes = meses12.map(m => ({
        mes: m,
        capacidad: Math.max(0, getTecho(m) - perfil.colchonObjetivo),
    }));

    async function crearMeta() {
        const monto = parseFloat(nuevaMeta.montoObjetivo);
        if (!nuevaMeta.nombre || !monto) return;

        const metasActivas = metas?.filter(m => m.estado === 'activo') ?? [];
        const maxPrioridad = metasActivas.reduce((max, m) => Math.max(max, m.prioridad), 0);

        const id = `meta-${Date.now()}`;
        const meta: GastoPlanificado = {
            id,
            nombre: nuevaMeta.nombre,
            montoObjetivo: monto,
            moneda: perfil!.monedaReferencia,
            fechaObjetivo: nuevaMeta.fechaObjetivo || undefined,
            prioridad: maxPrioridad + 1,
            estrategia: nuevaMeta.estrategia,
            ahorrado: 0,
            estado: 'activo',
        };

        await db.gastosPlanificados.put(meta);
        setNuevaMeta({ nombre: '', montoObjetivo: '', fechaObjetivo: '', estrategia: 'ahorrar' });
        setMostrarFormMeta(false);
    }

    async function cambiarEstado(id: string, estado: GastoPlanificado['estado']) {
        await db.gastosPlanificados.update(id, { estado });
    }

    const metasActivas = metas.filter(m => m.estado === 'activo');
    const metasPausadas = metas.filter(m => m.estado === 'pausado');

    return (
        <div className="max-w-lg mx-auto">
            <div className="px-4 pt-6 pb-2 flex items-baseline justify-between">
                <div>
                    <h1 className="text-xl font-bold tracking-tight">Plan</h1>
                    <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                        El margen con destino
                    </p>
                </div>
                <button
                    onClick={() => setMostrarFormMeta(v => !v)}
                    className="rounded-full px-3 py-1.5 text-sm font-medium min-h-[36px]"
                    style={{ background: 'var(--foreground)', color: 'var(--background)' }}
                    aria-label="Nueva meta"
                >
                    + Meta
                </button>
            </div>

            {/* Formulario nueva meta */}
            {mostrarFormMeta && (
                <div
                    className="mx-4 mb-4 rounded-xl p-4"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                    <div className="text-sm font-semibold mb-3">Nueva meta</div>
                    <div className="flex flex-col gap-3">
                        <input
                            type="text"
                            placeholder="Nombre (ej: Terminar la obra)"
                            value={nuevaMeta.nombre}
                            onChange={e => setNuevaMeta(v => ({ ...v, nombre: e.target.value }))}
                            className="w-full rounded-lg px-3 py-2 text-sm min-h-[44px]"
                            style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                            aria-label="Nombre de la meta"
                        />
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>
                                    Monto ({moneda})
                                </label>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={nuevaMeta.montoObjetivo}
                                    onChange={e => setNuevaMeta(v => ({ ...v, montoObjetivo: e.target.value }))}
                                    className="w-full rounded-lg px-3 py-2 text-sm min-h-[44px] tabnum"
                                    style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                    aria-label="Monto objetivo"
                                />
                            </div>
                            <div>
                                <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>
                                    Fecha objetivo (opcional)
                                </label>
                                <input
                                    type="month"
                                    value={nuevaMeta.fechaObjetivo}
                                    onChange={e => setNuevaMeta(v => ({ ...v, fechaObjetivo: e.target.value }))}
                                    className="w-full rounded-lg px-3 py-2 text-sm min-h-[44px]"
                                    style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                    aria-label="Fecha objetivo"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {(['ahorrar', 'financiar', 'comparar'] as const).map(e => (
                                <button
                                    key={e}
                                    onClick={() => setNuevaMeta(v => ({ ...v, estrategia: e }))}
                                    className="flex-1 rounded-lg py-2 text-xs font-medium min-h-[36px] capitalize"
                                    style={
                                        nuevaMeta.estrategia === e
                                            ? { background: 'var(--foreground)', color: 'var(--background)' }
                                            : { background: 'var(--background)', border: '1px solid var(--border)' }
                                    }
                                    aria-pressed={nuevaMeta.estrategia === e}
                                >
                                    {e}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setMostrarFormMeta(false)}
                                className="flex-1 rounded-lg py-2 text-sm min-h-[44px]"
                                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={crearMeta}
                                className="flex-1 rounded-lg py-2 text-sm font-semibold min-h-[44px]"
                                style={{ background: 'var(--foreground)', color: 'var(--background)' }}
                            >
                                Crear
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Capacidad de ahorro mini-chart */}
            {metasActivas.length > 0 && (
                <div className="px-4 mb-4">
                    <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
                        Capacidad de ahorro próximos 6m
                    </div>
                    <div className="flex gap-1 items-end h-8">
                        {capacidadPorMes.slice(0, 6).map(({ mes: m, capacidad }) => {
                            const maxCap = Math.max(...capacidadPorMes.slice(0, 6).map(x => x.capacidad), 1);
                            const pct = (capacidad / maxCap) * 100;
                            return (
                                <div key={m} className="flex-1 flex flex-col items-center gap-0.5">
                                    <div
                                        className="w-full rounded-sm barra-ok"
                                        style={{ height: `${Math.max(4, pct * 0.28)}px` }}
                                        title={`${formatearMes(m)}: ${formatearMonto(capacidad, moneda)}`}
                                    />
                                    <span className="text-xs" style={{ color: 'var(--muted)', fontSize: '9px' }}>
                                        {formatearMes(m).slice(0, 3)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Metas activas */}
            <div className="px-4 pb-8">
                {metasActivas.length === 0 && !mostrarFormMeta && (
                    <div
                        className="rounded-xl p-6 text-center"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                    >
                        <div className="text-2xl mb-2">◎</div>
                        <div className="text-sm font-medium mb-1">Sin metas aún</div>
                        <div className="text-xs" style={{ color: 'var(--muted)' }}>
                            Creá una meta para que el margen tenga destino
                        </div>
                    </div>
                )}

                <div className="flex flex-col gap-3">
                    {metasActivas.map(meta => {
                        const pct = meta.montoObjetivo > 0
                            ? Math.min(100, (meta.ahorrado / meta.montoObjetivo) * 100)
                            : 0;

                        const fechaCalc = meta.fechaObjetivo
                            ? null
                            : fechaAlcanzable(meta, capacidadPorMes);

                        const mesTarget = meta.fechaObjetivo ?? fechaCalc;
                        const mesesRestantes = mesTarget
                            ? Math.max(1, generarMeses(mes, 60).indexOf(mesTarget) + 1)
                            : 12;
                        const aporteCalc = aporteMensual(meta.montoObjetivo, meta.ahorrado, mesesRestantes);

                        return (
                            <div
                                key={meta.id}
                                className="rounded-xl p-4"
                                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                            >
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <div className="font-semibold text-sm">{meta.nombre}</div>
                                        <div className="tabnum text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                                            {formatearMonto(meta.ahorrado, moneda)} de {formatearMonto(meta.montoObjetivo, moneda)}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => cambiarEstado(meta.id, 'pausado')}
                                        className="text-xs px-2 py-1 rounded-full min-h-[28px]"
                                        style={{ background: 'var(--border)', color: 'var(--muted)' }}
                                        aria-label="Pausar meta"
                                    >
                                        Pausar
                                    </button>
                                </div>

                                {/* Barra de progreso */}
                                <div className="rounded-full h-2 overflow-hidden mb-2" style={{ background: 'var(--border)' }}>
                                    <div className="h-full barra-ok rounded-full" style={{ width: `${pct}%` }} />
                                </div>

                                <div className="flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
                                    <span>
                                        Aporte {formatearMonto(aporteCalc, moneda)}/mes
                                    </span>
                                    <span className="font-medium">
                                        {mesTarget ? `listo en ${formatearMes(mesTarget)}` : 'calculando…'}
                                    </span>
                                </div>

                                {/* Info financiamiento */}
                                {meta.estrategia === 'comparar' && (
                                    <div
                                        className="mt-2 rounded-lg px-3 py-2 text-xs"
                                        style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                    >
                                        ⓘ Financiarlo en 12 cuotas al 32% TEA costaría ~USD 487 más.{' '}
                                        <button className="underline" aria-label="Ver comparación">Comparar</button>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Metas pausadas */}
                    {metasPausadas.map(meta => (
                        <div
                            key={meta.id}
                            className="rounded-xl p-4 opacity-60"
                            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-semibold text-sm">{meta.nombre}</div>
                                    <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>En pausa</div>
                                </div>
                                <button
                                    onClick={() => cambiarEstado(meta.id, 'activo')}
                                    className="text-xs px-2 py-1 rounded-full min-h-[28px]"
                                    style={{ background: 'var(--border)' }}
                                    aria-label="Reactivar meta"
                                >
                                    Reactivar
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
