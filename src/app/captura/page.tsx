'use client';

import { useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { tcVentaPorFecha } from '@/lib/reglas';
import type { Movimiento } from '@/types/domain';
import clsx from 'clsx';

function generarId(cuentaId: string, fecha: string, concepto: string, importe: number): string {
    const str = `${cuentaId}|${fecha}|${concepto}|${importe}|${Date.now()}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36) + Date.now().toString(36);
}

interface Repeticion {
    comercio: string;
    importe: number;
    categoriaId: string | null;
    cuentaId: string;
    moneda: 'UYU' | 'USD';
    clase: 'gasto' | 'ingreso';
}

type ClasePrincipal = 'gasto' | 'ingreso';

export default function PaginaCaptura() {
    const [importe, setImporte] = useState('');
    const [moneda, setMoneda] = useState<'UYU' | 'USD'>('UYU');
    const [clase, setClase] = useState<ClasePrincipal>('gasto');
    const [categoriaId, setCategoriaId] = useState<string | null>(null);
    const [comercio, setComercio] = useState('');
    const [cuentaSeleccionada, setCuentaSeleccionada] = useState<string | null>(null);
    const [guardado, setGuardado] = useState(false);
    const [undoTimer, setUndoTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
    const [ultimoId, setUltimoId] = useState<string | null>(null);

    const perfil = useLiveQuery(() => db.perfilFinanciero.get('perfil'));
    const categorias = useLiveQuery(() => db.categorias.orderBy('ordenFrecuencia').toArray());
    const cuentas = useLiveQuery(() => db.cuentas.toArray());
    const tiposCambio = useLiveQuery(() => db.tiposDeCambio.toArray());

    const repeticiones = useLiveQuery(async (): Promise<Repeticion[]> => {
        const corte = new Date();
        corte.setDate(corte.getDate() - 30);
        const movs = await db.movimientos
            .where('fecha').aboveOrEqual(corte.toISOString().slice(0, 10))
            .filter(m => (m.clase === 'gasto' || m.clase === 'ingreso') && !!m.comercio)
            .toArray();
        const mapa = new Map<string, { r: Repeticion; count: number }>();
        for (const m of movs) {
            if (!m.comercio) continue;
            const key = `${m.comercio}|${Math.abs(m.importe)}|${m.moneda}`;
            if (mapa.has(key)) {
                mapa.get(key)!.count++;
            } else {
                mapa.set(key, {
                    r: {
                        comercio: m.comercio,
                        importe: Math.abs(m.importe),
                        categoriaId: m.categoriaId ?? null,
                        cuentaId: m.cuentaId,
                        moneda: m.moneda,
                        clase: (m.clase === 'ingreso' ? 'ingreso' : 'gasto') as ClasePrincipal,
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

    const hoy = new Date().toISOString().slice(0, 10);
    const tc = tiposCambio ? tcVentaPorFecha(hoy, tiposCambio) : 40;

    const importeNum = parseFloat(importe) || 0;
    const monedaConvertida = moneda === 'UYU' ? 'USD' : 'UYU';
    const importeConvertido = importeNum > 0
        ? moneda === 'UYU' ? importeNum / tc : importeNum * tc
        : 0;

    const cuentaActiva = cuentas?.find(c => c.id === cuentaSeleccionada)
        ?? cuentas?.find(c => c.tipo === 'tarjeta')
        ?? cuentas?.[0];

    const categoriasOrdenadas = useCallback(() => {
        if (!categorias) return [];
        const hora = new Date().getHours();
        return [...categorias].sort((a, b) => {
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
            setImporte(p => p.slice(0, -1));
        } else if (tecla === '.') {
            if (!importe.includes('.')) setImporte(p => p + '.');
        } else {
            const partes = importe.split('.');
            if (partes[0].length >= 9) return;
            if (partes[1] && partes[1].length >= 2) return;
            setImporte(p => p + tecla);
        }
    }

    function usarRepeticion(r: Repeticion) {
        setImporte(String(r.importe));
        setCategoriaId(r.categoriaId);
        setComercio(r.comercio);
        setMoneda(r.moneda);
        setClase(r.clase);
        setCuentaSeleccionada(r.cuentaId);
    }

    function intercambiarMoneda() {
        if (importeNum > 0) {
            const convertido = moneda === 'UYU'
                ? (importeNum / tc).toFixed(2)
                : Math.round(importeNum * tc).toString();
            setImporte(convertido);
        }
        setMoneda(m => m === 'UYU' ? 'USD' : 'UYU');
    }

    async function guardar() {
        if (!importeNum || importeNum <= 0) return;

        const cid = cuentaActiva?.id ?? 'cuenta-pesos';
        const id = generarId(cid, hoy, comercio, importeNum);
        const signo = clase === 'gasto' ? -1 : 1;

        const mov: Movimiento = {
            id,
            cuentaId: cid,
            fecha: hoy,
            conceptoRaw: comercio,
            comercio: comercio || undefined,
            importe: signo * importeNum,
            moneda,
            clase,
            categoriaId: categoriaId ?? undefined,
            origen: 'manual',
            estado: 'previsto',
        };

        await db.movimientos.put(mov);
        setUltimoId(id);
        setGuardado(true);

        if (categoriaId) {
            const cat = await db.categorias.get(categoriaId);
            if (cat) await db.categorias.update(categoriaId, { ordenFrecuencia: cat.ordenFrecuencia - 0.1 });
        }

        const timer = setTimeout(() => {
            setGuardado(false);
            setImporte('');
            setCategoriaId(null);
            setComercio('');
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
        setComercio('');
        setUltimoId(null);
    }

    // "Listo" se habilita en cuanto hay un importe > 0
    // La categoría es opcional (si no se elige queda sin clasificar)
    const puedeGuardar = importeNum > 0 && !guardado;
    const catActual = categorias?.find(c => c.id === categoriaId);

    const esIngreso = clase === 'ingreso';
    const colorAccion = esIngreso ? '#16a34a' : 'var(--foreground)';

    const TECLAS = [
        ['7', '8', '9'],
        ['4', '5', '6'],
        ['1', '2', '3'],
        ['.', '0', '⌫'],
    ];

    return (
        <div className="max-w-lg mx-auto flex flex-col" style={{ minHeight: 'calc(100dvh - 64px)' }}>

            {/* ── Header ── */}
            <div className="px-4 pt-5 pb-2 flex items-center justify-between">
                <h1 className="text-sm font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
                    Captura
                </h1>
                <select
                    value={cuentaActiva?.id ?? ''}
                    onChange={e => setCuentaSeleccionada(e.target.value)}
                    className="text-xs px-2 py-1 rounded-full min-h-8"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
                    aria-label="Cuenta"
                >
                    {cuentas?.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
            </div>

            <div className="flex-1 flex flex-col px-4 gap-3 overflow-y-auto">

                {/* ── Toggle gasto / ingreso ── */}
                <div
                    className="flex rounded-xl overflow-hidden self-center w-full"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                    role="group"
                    aria-label="Tipo de movimiento"
                >
                    {(['gasto', 'ingreso'] as const).map(t => (
                        <button
                            key={t}
                            onClick={() => setClase(t)}
                            aria-pressed={clase === t}
                            className="flex-1 py-2.5 text-sm font-semibold transition-all min-h-11"
                            style={
                                clase === t
                                    ? { background: t === 'gasto' ? 'var(--foreground)' : '#16a34a', color: 'white' }
                                    : { color: 'var(--muted)' }
                            }
                        >
                            {t === 'gasto' ? '↑ Gasto' : '↓ Ingreso'}
                        </button>
                    ))}
                </div>

                {/* ── Display del importe ── */}
                <div
                    className="rounded-2xl px-4 py-4 text-center"
                    style={{
                        background: 'var(--surface)',
                        border: `2px solid ${puedeGuardar ? colorAccion : 'var(--border)'}`,
                        transition: 'border-color 0.15s',
                    }}
                >
                    {/* Selector moneda */}
                    <div className="flex items-center justify-center gap-2 mb-3">
                        {(['UYU', 'USD'] as const).map(m => (
                            <button
                                key={m}
                                onClick={() => m !== moneda && intercambiarMoneda()}
                                aria-pressed={moneda === m}
                                className="px-3 py-1 rounded-full text-sm font-semibold transition-all min-h-9"
                                style={
                                    moneda === m
                                        ? { background: colorAccion, color: 'white' }
                                        : { background: 'var(--background)', border: '1px solid var(--border)', color: 'var(--muted)' }
                                }
                            >
                                {m === 'UYU' ? '$ UYU' : 'USD'}
                            </button>
                        ))}
                    </div>

                    {/* Número principal */}
                    <div
                        className="tabnum font-bold leading-none"
                        style={{
                            fontSize: 'clamp(2.8rem, 15vw, 5rem)',
                            color: importeNum > 0 ? (esIngreso ? '#16a34a' : 'var(--foreground)') : 'var(--border)',
                        }}
                        aria-live="polite"
                        aria-label={`${importe || '0'} ${moneda}`}
                    >
                        {moneda === 'USD' ? 'USD ' : '$ '}
                        {importe || '0'}
                        {/* Cursor parpadeante */}
                        {!guardado && (
                            <span
                                className="inline-block w-0.5 h-[0.85em] ml-1 rounded-sm align-middle animate-pulse"
                                style={{ background: colorAccion, opacity: 0.8 }}
                                aria-hidden="true"
                            />
                        )}
                    </div>

                    {/* Equivalencia en la otra moneda */}
                    {importeNum > 0 && (
                        <div className="mt-2 text-sm tabnum" style={{ color: 'var(--muted)' }}>
                            ≈ {monedaConvertida === 'USD' ? 'USD ' : '$ '}
                            {importeConvertido.toLocaleString('es-UY', {
                                minimumFractionDigits: monedaConvertida === 'USD' ? 2 : 0,
                                maximumFractionDigits: monedaConvertida === 'USD' ? 2 : 0,
                            })}
                            <span className="text-xs ml-1 opacity-60">TC {tc.toLocaleString('es-UY', { maximumFractionDigits: 1 })}</span>
                        </div>
                    )}

                    {/* Categoría y comercio seleccionados */}
                    {(catActual || comercio) && (
                        <div className="mt-2 text-sm flex items-center justify-center gap-1" style={{ color: 'var(--muted)' }}>
                            {catActual && <span>{catActual.icono} {catActual.nombre}</span>}
                            {comercio && catActual && <span>·</span>}
                            {comercio && <span className="truncate max-w-[140px]">{comercio}</span>}
                        </div>
                    )}
                </div>

                {/* ── Campo comercio / descripción ── */}
                <input
                    type="text"
                    placeholder={esIngreso ? 'Descripción (ej: Factura cliente)' : 'Comercio (opcional)'}
                    value={comercio}
                    onChange={e => setComercio(e.target.value)}
                    className="w-full rounded-xl px-4 py-3 text-sm min-h-11"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                    aria-label={esIngreso ? 'Descripción' : 'Comercio'}
                />

                {/* ── REPETIR ── */}
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
                                    aria-label={`Repetir ${r.comercio} ${r.importe} ${r.moneda}`}
                                >
                                    <div className="font-medium truncate">
                                        {r.clase === 'ingreso' && <span className="text-green-600 mr-1">↓</span>}
                                        {r.comercio}
                                    </div>
                                    <div className="tabnum text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                                        {r.moneda === 'USD' ? 'USD ' : '$ '}{r.importe.toLocaleString('es-UY')}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Categorías (solo gastos) ── */}
                {clase === 'gasto' && (
                    <div>
                        {!categoriaId && importeNum > 0 && (
                            <div className="text-xs mb-2 font-medium" style={{ color: 'var(--color-warn)' }}>
                                Elegí una categoría o guardá sin clasificar
                            </div>
                        )}
                        <div className="flex flex-wrap gap-2">
                            {categoriasOrdenadas().slice(0, 6).map(cat => (
                                <button
                                    key={cat.id}
                                    onClick={() => setCategoriaId(prev => prev === cat.id ? null : cat.id)}
                                    aria-pressed={categoriaId === cat.id}
                                    className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition-all min-h-11"
                                    style={
                                        categoriaId === cat.id
                                            ? { background: 'var(--foreground)', color: 'var(--background)', outline: '2px solid var(--foreground)', outlineOffset: '2px' }
                                            : { background: 'var(--surface)', border: '1px solid var(--border)' }
                                    }
                                >
                                    <span>{cat.icono}</span>
                                    <span>{cat.nombre}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

            </div>

            {/* ── Teclado numérico — fijo al fondo ── */}
            <div className="px-4 pb-3 pt-2 shrink-0">
                <div className="grid grid-cols-4 gap-2">
                    {TECLAS.flat().map((tecla, i) => {
                        if (i === 11) {
                            return (
                                <button
                                    key="listo"
                                    onClick={guardar}
                                    disabled={!puedeGuardar}
                                    className={clsx(
                                        'col-span-1 rounded-xl font-semibold text-sm transition-all min-h-14',
                                        'flex items-center justify-center gap-1',
                                        puedeGuardar ? 'active:scale-95' : 'opacity-25 cursor-not-allowed'
                                    )}
                                    style={
                                        puedeGuardar
                                            ? { background: colorAccion, color: 'white' }
                                            : { background: 'var(--surface)', border: '1px solid var(--border)' }
                                    }
                                    aria-label="Guardar"
                                >
                                    ✓ Listo
                                </button>
                            );
                        }
                        return (
                            <button
                                key={tecla}
                                onClick={() => presionarTecla(tecla)}
                                className="rounded-xl font-mono text-xl font-medium min-h-14 transition-all active:scale-95 active:opacity-70 flex items-center justify-center select-none"
                                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                                aria-label={tecla === '⌫' ? 'Borrar' : tecla}
                            >
                                {tecla}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Toast con undo ── */}
            {guardado && (
                <div
                    className="fixed bottom-24 left-4 right-4 max-w-lg mx-auto rounded-xl px-4 py-3 flex items-center justify-between z-50 shadow-lg"
                    style={{ background: colorAccion, color: 'white' }}
                    role="status"
                    aria-live="polite"
                >
                    <span className="text-sm">
                        {esIngreso ? '↓ Ingreso' : '↑ Gasto'} guardado —{' '}
                        {moneda === 'USD' ? 'USD ' : '$ '}{importe}
                        {importeNum > 0 && (
                            <span className="opacity-70 ml-1 text-xs">
                                ≈ {monedaConvertida === 'USD' ? 'USD ' : '$ '}
                                {importeConvertido.toLocaleString('es-UY', { maximumFractionDigits: monedaConvertida === 'USD' ? 2 : 0 })}
                            </span>
                        )}
                    </span>
                    <button onClick={deshacer} className="text-sm font-semibold underline ml-4" aria-label="Deshacer">
                        Deshacer
                    </button>
                </div>
            )}
        </div>
    );
}
