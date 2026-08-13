'use client';

import { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { COMERCIOS_SEMILLA } from '@/lib/seed';
import { mesActual } from '@/lib/reglas';
import type { Movimiento, Categoria } from '@/types/domain';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';

// Generar ID hash simple (no criptográfico, solo para unicidad)
function generarId(cuentaId: string, fecha: string, concepto: string, importe: number): string {
    const str = `${cuentaId}|${fecha}|${concepto}|${importe}|${Date.now()}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + c;
        hash |= 0;
    }
    return Math.abs(hash).toString(36) + Date.now().toString(36);
}

interface Repeticion {
    comercio: string;
    importe: number;
    categoriaId: string;
    cuentaId: string;
    moneda: 'UYU' | 'USD';
}

export default function PaginaCaptura() {
    const router = useRouter();
    const [importe, setImporte] = useState('');
    const [categoriaId, setCategoriaId] = useState<string | null>(null);
    const [comercio, setComercio] = useState<string | null>(null);
    const [guardado, setGuardado] = useState(false);
    const [undoTimer, setUndoTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
    const [ultimoId, setUltimoId] = useState<string | null>(null);

    const categorias = useLiveQuery(() => db.categorias.orderBy('ordenFrecuencia').toArray());
    const perfil = useLiveQuery(() => db.perfilFinanciero.get('perfil'));
    const cuentas = useLiveQuery(() => db.cuentas.toArray());

    // Repeticiones: 4 pares (comercio + monto) más frecuentes últimos 30 días
    const repeticiones = useLiveQuery(async (): Promise<Repeticion[]> => {
        const hace30dias = new Date();
        hace30dias.setDate(hace30dias.getDate() - 30);
        const fechaCorte = hace30dias.toISOString().slice(0, 10);

        const movs = await db.movimientos
            .where('fecha').aboveOrEqual(fechaCorte)
            .filter(m => m.clase === 'gasto' && !!m.comercio)
            .toArray();

        // Contar frecuencia de (comercio, importe)
        const mapa = new Map<string, { r: Repeticion; count: number }>();
        for (const m of movs) {
            if (!m.comercio) continue;
            const key = `${m.comercio}|${Math.abs(m.importe)}`;
            if (mapa.has(key)) {
                mapa.get(key)!.count++;
            } else {
                mapa.set(key, {
                    r: {
                        comercio: m.comercio,
                        importe: Math.abs(m.importe),
                        categoriaId: m.categoriaId ?? 'efectivo',
                        cuentaId: m.cuentaId,
                        moneda: m.moneda,
                    },
                    count: 1,
                });
            }
        }

        return Array.from(mapa.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 4)
            .map(v => v.r);
    });

    const cuentaDefault = cuentas?.find(c => c.tipo === 'tarjeta') ?? cuentas?.[0];
    const moneda: 'UYU' | 'USD' = perfil?.monedaReferencia ?? 'USD';

    // Orden de categorías por hora del día (heurística simple)
    const categoriasOrdenadas = useCallback(() => {
        if (!categorias) return [];
        const hora = new Date().getHours();
        return [...categorias].sort((a, b) => {
            // A las 11-15h comida va primero, a las 18-21h súper va primero
            if (hora >= 11 && hora <= 15) {
                if (a.id === 'comida') return -1;
                if (b.id === 'comida') return 1;
            } else if (hora >= 18 && hora <= 21) {
                if (a.id === 'supermercado') return -1;
                if (b.id === 'supermercado') return 1;
            }
            return a.ordenFrecuencia - b.ordenFrecuencia;
        });
    }, [categorias]);

    function presionarTecla(tecla: string) {
        if (guardado) return;
        if (tecla === '⌫') {
            setImporte(prev => prev.slice(0, -1));
        } else if (tecla === '.') {
            if (!importe.includes('.')) setImporte(prev => prev + '.');
        } else {
            // Máximo 8 dígitos antes del punto
            const partes = importe.split('.');
            if (partes[0].length >= 8) return;
            if (partes[1] && partes[1].length >= 2) return;
            setImporte(prev => prev + tecla);
        }
    }

    function usarRepeticion(r: Repeticion) {
        setImporte(String(r.importe));
        setCategoriaId(r.categoriaId);
        setComercio(r.comercio);
    }

    async function guardar() {
        const montoNum = parseFloat(importe);
        if (!montoNum || montoNum <= 0 || !categoriaId) return;

        const hoy = new Date().toISOString().slice(0, 10);
        const cuentaId = cuentaDefault?.id ?? 'cuenta-pesos';
        const nombreComercio = comercio ?? '';
        const id = generarId(cuentaId, hoy, nombreComercio, montoNum);

        const mov: Movimiento = {
            id,
            cuentaId,
            fecha: hoy,
            conceptoRaw: nombreComercio,
            comercio: nombreComercio || undefined,
            importe: -montoNum, // negativo = sale
            moneda,
            clase: 'gasto',
            categoriaId,
            origen: 'manual',
            estado: 'previsto',
        };

        await db.movimientos.put(mov);
        setUltimoId(id);
        setGuardado(true);

        // Actualizar frecuencia de la categoría
        if (categoriaId) {
            const cat = await db.categorias.get(categoriaId);
            if (cat) {
                await db.categorias.update(categoriaId, {
                    ordenFrecuencia: cat.ordenFrecuencia - 0.1,
                });
            }
        }

        // Undo de 5 segundos
        const timer = setTimeout(() => {
            setGuardado(false);
            setImporte('');
            setCategoriaId(null);
            setComercio(null);
            setUltimoId(null);
        }, 5000);
        setUndoTimer(timer);
    }

    async function deshacer() {
        if (undoTimer) clearTimeout(undoTimer);
        if (ultimoId) await db.movimientos.delete(ultimoId);
        setGuardado(false);
        setImporte('');
        setCategoriaId(null);
        setComercio(null);
        setUltimoId(null);
    }

    const importeNum = parseFloat(importe) || 0;
    const puedeGuardar = importeNum > 0 && !!categoriaId;
    const catActual = categorias?.find(c => c.id === categoriaId);

    const TECLAS = [
        ['7', '8', '9'],
        ['4', '5', '6'],
        ['1', '2', '3'],
        ['.', '0', '⌫'],
    ];

    return (
        <div className="max-w-lg mx-auto flex flex-col min-h-[calc(100vh-64px)]">
            {/* Header */}
            <div className="px-4 pt-6 pb-2 flex items-center justify-between">
                <h1 className="text-sm font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
                    Captura
                </h1>
                {cuentaDefault && (
                    <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--surface)', color: 'var(--muted)' }}>
                        {cuentaDefault.nombre}
                    </span>
                )}
            </div>

            <div className="flex-1 flex flex-col px-4 gap-4">
                {/* Importe */}
                <div className="text-center pt-4">
                    <div
                        className={clsx(
                            'tabnum font-bold leading-none transition-opacity',
                            importe ? 'opacity-100' : 'opacity-30'
                        )}
                        style={{ fontSize: 'clamp(2.5rem, 14vw, 5rem)', color: 'var(--foreground)' }}
                        aria-label={`Importe: ${importe || '0'}`}
                    >
                        {moneda === 'USD' ? 'USD ' : '$ '}
                        {importe || '0'}
                    </div>
                    {catActual && (
                        <div className="mt-2 text-sm flex items-center justify-center gap-1" style={{ color: 'var(--muted)' }}>
                            <span>{catActual.icono}</span>
                            <span>{catActual.nombre}</span>
                            {comercio && <span>· {comercio}</span>}
                        </div>
                    )}
                </div>

                {/* REPETIR — los 4 más frecuentes */}
                {repeticiones && repeticiones.length > 0 && (
                    <div>
                        <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
                            Repetir
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {repeticiones.map((r, i) => (
                                <button
                                    key={i}
                                    onClick={() => usarRepeticion(r)}
                                    className="text-left rounded-xl px-3 py-2 text-sm transition-opacity active:opacity-70"
                                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                                    aria-label={`Repetir: ${r.comercio} ${r.importe}`}
                                >
                                    <div className="font-medium truncate">{r.comercio}</div>
                                    <div className="tabnum text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                                        {r.moneda === 'USD' ? 'USD ' : '$ '}{r.importe.toLocaleString('es-UY')}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Categorías */}
                <div>
                    <div className="flex flex-wrap gap-2">
                        {categoriasOrdenadas().slice(0, 6).map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setCategoriaId(cat.id)}
                                className={clsx(
                                    'flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition-all',
                                    'min-h-[44px]'
                                )}
                                style={
                                    categoriaId === cat.id
                                        ? { background: 'var(--foreground)', color: 'var(--background)' }
                                        : { background: 'var(--surface)', border: '1px solid var(--border)' }
                                }
                                aria-pressed={categoriaId === cat.id}
                                aria-label={cat.nombre}
                            >
                                <span>{cat.icono}</span>
                                <span>{cat.nombre}</span>
                            </button>
                        ))}
                        <button
                            className="rounded-full px-3 py-1.5 text-sm min-h-[44px]"
                            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
                            aria-label="Más categorías"
                        >
                            ⋯ Más
                        </button>
                    </div>
                </div>

                {/* Teclado numérico propio */}
                <div className="grid grid-cols-4 gap-2 pb-4">
                    {TECLAS.flat().map((tecla, i) => {
                        // El botón Listo ocupa el lugar del ✓
                        if (i === 11) {
                            return (
                                <button
                                    key="listo"
                                    onClick={guardar}
                                    disabled={!puedeGuardar || guardado}
                                    className={clsx(
                                        'col-span-1 rounded-xl font-semibold text-base transition-all min-h-[56px]',
                                        'flex items-center justify-center',
                                        puedeGuardar && !guardado
                                            ? 'active:opacity-70'
                                            : 'opacity-30 cursor-not-allowed'
                                    )}
                                    style={
                                        puedeGuardar && !guardado
                                            ? { background: 'var(--foreground)', color: 'var(--background)' }
                                            : { background: 'var(--surface)' }
                                    }
                                    aria-label="Guardar gasto"
                                >
                                    ✓ Listo
                                </button>
                            );
                        }
                        return (
                            <button
                                key={tecla}
                                onClick={() => presionarTecla(tecla)}
                                className="rounded-xl font-mono text-xl font-medium min-h-[56px] transition-all active:opacity-50 flex items-center justify-center"
                                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                                aria-label={tecla === '⌫' ? 'Borrar' : tecla}
                            >
                                {tecla}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Toast de guardado con undo */}
            {guardado && (
                <div
                    className="fixed bottom-24 left-4 right-4 max-w-lg mx-auto rounded-xl px-4 py-3 flex items-center justify-between z-50 shadow-lg"
                    style={{ background: 'var(--foreground)', color: 'var(--background)' }}
                    role="status"
                    aria-live="polite"
                >
                    <span className="text-sm">
                        ✓ Guardado — {moneda === 'USD' ? 'USD ' : '$ '}{importe}
                    </span>
                    <button
                        onClick={deshacer}
                        className="text-sm font-semibold underline ml-4"
                        aria-label="Deshacer gasto"
                    >
                        Deshacer
                    </button>
                </div>
            )}
        </div>
    );
}
