'use client';

import { useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { tcVentaPorFecha, consolidar } from '@/lib/reglas';
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
    categoriaId: string;
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
    const [comercio, setComercio] = useState<string | null>(null);
    const [cuentaId, setCuentaId] = useState<string | null>(null);
    const [guardado, setGuardado] = useState(false);
    const [undoTimer, setUndoTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
    const [ultimoId, setUltimoId] = useState<string | null>(null);
    const [mostrarConversion, setMostrarConversion] = useState(false);

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
                        categoriaId: m.categoriaId ?? 'efectivo',
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

    // Tipo de cambio vigente
    const hoy = new Date().toISOString().slice(0, 10);
    const tc = tiposCambio ? tcVentaPorFecha(hoy, tiposCambio) : 40;

    // Conversión del importe ingresado
    const importeNum = parseFloat(importe) || 0;
    const importeConvertido = importeNum > 0
        ? moneda === 'UYU'
            ? importeNum / tc          // UYU → USD
            : importeNum * tc          // USD → UYU
        : 0;
    const monedaConvertida: 'UYU' | 'USD' = moneda === 'UYU' ? 'USD' : 'UYU';

    // Cuenta activa
    const cuentaActiva = cuentas?.find(c => c.id === cuentaId)
        ?? cuentas?.find(c => c.tipo === 'tarjeta')
        ?? cuentas?.[0];

    // Categorías ordenadas por hora
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
        setCuentaId(r.cuentaId);
    }

    // Intercambiar moneda conservando el valor en la otra moneda
    function intercambiarMoneda() {
        if (importeNum > 0) {
            setImporte(importeConvertido.toFixed(monedaConvertida === 'UYU' ? 0 : 2));
        }
        setMoneda(m => m === 'UYU' ? 'USD' : 'UYU');
    }

    async function guardar() {
        if (!importeNum || importeNum <= 0) return;
        if (clase === 'gasto' && !categoriaId) return;

        const fecha = hoy;
        const cid = cuentaActiva?.id ?? 'cuenta-pesos';
        const nombreCom = comercio ?? '';
        const id = generarId(cid, fecha, nombreCom, importeNum);
        // gasto → negativo, ingreso → positivo
        const signo = clase === 'gasto' ? -1 : 1;

        const mov: Movimiento = {
            id,
            cuentaId: cid,
            fecha,
            conceptoRaw: nombreCom,
            comercio: nombreCom || undefined,
            importe: signo * importeNum,
            moneda,
            clase,
            categoriaId: clase === 'gasto' ? (categoriaId ?? undefined) : undefined,
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

    const puedeGuardar = importeNum > 0 && (clase === 'ingreso' || !!categoriaId);
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
            <div className="px-4 pt-5 pb-2 flex items-center justify-between">
                <h1 className="text-sm font-semibold tracking-widest uppercase" style={{ color: 'var(--muted)' }}>
                    Captura
                </h1>
                {/* Selector de cuenta */}
                <select
                    value={cuentaActiva?.id ?? ''}
                    onChange={e => setCuentaId(e.target.value)}
                    className="text-xs px-2 py-1 rounded-full min-h-[32px]"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
                    aria-label="Cuenta"
                >
                    {cuentas?.map(c => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                </select>
            </div>

            <div className="flex-1 flex flex-col px-4 gap-3">

                {/* Toggle gasto / ingreso */}
                <div
                    className="flex rounded-xl overflow-hidden self-center"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                    role="group"
                    aria-label="Tipo de movimiento"
                >
                    {(['gasto', 'ingreso'] as const).map(t => (
                        <button
                            key={t}
                            onClick={() => setClase(t)}
                            aria-pressed={clase === t}
                            className="px-5 py-2 text-sm font-medium capitalize transition-all min-h-11"
                            style={
                                clase === t
                                    ? {
                                        background: t === 'gasto' ? 'var(--foreground)' : 'var(--color-ok)',
                                        color: 'white',
                                    }
                                    : {}
                            }
                        >
                            {t === 'gasto' ? '↑ Gasto' : '↓ Ingreso'}
                        </button>
                    ))}
                </div>

                {/* Importe + selector de moneda */}
                <div className="text-center pt-2">
                    {/* Selector UYU / USD */}
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <button
                            onClick={() => setMoneda('UYU')}
                            aria-pressed={moneda === 'UYU'}
                            className="px-3 py-1 rounded-full text-sm font-semibold transition-all min-h-9"
                            style={
                                moneda === 'UYU'
                                    ? { background: 'var(--foreground)', color: 'var(--background)' }
                                    : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }
                            }
                        >
                            $ UYU
                        </button>
                        <button
                            onClick={intercambiarMoneda}
                            className="text-base px-2 transition-transform active:scale-110"
                            style={{ color: 'var(--muted)' }}
                            aria-label="Intercambiar moneda"
                            title={`TC: ${tc.toLocaleString('es-UY', { maximumFractionDigits: 2 })}`}
                        >
                            ⇄
                        </button>
                        <button
                            onClick={() => setMoneda('USD')}
                            aria-pressed={moneda === 'USD'}
                            className="px-3 py-1 rounded-full text-sm font-semibold transition-all min-h-9"
                            style={
                                moneda === 'USD'
                                    ? { background: 'var(--foreground)', color: 'var(--background)' }
                                    : { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }
                            }
                        >
                            USD
                        </button>
                    </div>

                    {/* Número grande */}
                    <div
                        className={clsx(
                            'tabnum font-bold leading-none transition-opacity',
                            importe ? 'opacity-100' : 'opacity-30',
                            clase === 'ingreso' ? 'estado-ok' : ''
                        )}
                        style={{ fontSize: 'clamp(2.5rem, 14vw, 5rem)' }}
                        aria-label={`Importe: ${importe || '0'} ${moneda}`}
                    >
                        {moneda === 'USD' ? 'USD ' : '$ '}
                        {importe || '0'}
                    </div>

                    {/* Conversión en vivo */}
                    {importeNum > 0 && (
                        <button
                            onClick={() => setMostrarConversion(v => !v)}
                            className="mt-1 text-sm tabnum"
                            style={{ color: 'var(--muted)' }}
                            aria-label="Ver conversión"
                        >
                            ≈ {monedaConvertida === 'USD' ? 'USD ' : '$ '}
                            {importeConvertido.toLocaleString('es-UY', {
                                minimumFractionDigits: monedaConvertida === 'USD' ? 2 : 0,
                                maximumFractionDigits: monedaConvertida === 'USD' ? 2 : 0,
                            })}
                            {' '}
                            <span className="text-xs">(TC {tc.toLocaleString('es-UY', { maximumFractionDigits: 2 })})</span>
                        </button>
                    )}

                    {/* Comercio / descripción */}
                    {(catActual || comercio) && (
                        <div className="mt-1 text-sm flex items-center justify-center gap-1" style={{ color: 'var(--muted)' }}>
                            {catActual && <span>{catActual.icono}</span>}
                            {catActual && <span>{catActual.nombre}</span>}
                            {comercio && <span>· {comercio}</span>}
                        </div>
                    )}
                </div>

                {/* Campo comercio / descripción */}
                <input
                    type="text"
                    placeholder={clase === 'ingreso' ? 'Descripción (ej: Factura cliente)' : 'Comercio (opcional)'}
                    value={comercio ?? ''}
                    onChange={e => setComercio(e.target.value || null)}
                    className="w-full rounded-xl px-4 py-3 text-sm min-h-11"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                    aria-label="Comercio o descripción"
                />

                {/* REPETIR */}
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
                                    aria-label={`Repetir: ${r.comercio} ${r.importe} ${r.moneda}`}
                                >
                                    <div className="font-medium truncate flex items-center gap-1">
                                        {r.clase === 'ingreso' && <span className="estado-ok text-xs">↓</span>}
                                        {r.comercio}
                                    </div>
                                    <div className="tabnum text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                                        {r.moneda === 'USD' ? 'USD ' : '$ '}
                                        {r.importe.toLocaleString('es-UY')}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Categorías — solo para gastos */}
                {clase === 'gasto' && (
                    <div className="flex flex-wrap gap-2">
                        {categoriasOrdenadas().slice(0, 6).map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => setCategoriaId(cat.id)}
                                className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition-all min-h-11"
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
                            className="rounded-full px-3 py-1.5 text-sm min-h-11"
                            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
                        >
                            ⋯ Más
                        </button>
                    </div>
                )}

                {/* Teclado numérico */}
                <div className="grid grid-cols-4 gap-2 pb-4">
                    {TECLAS.flat().map((tecla, i) => {
                        if (i === 11) {
                            return (
                                <button
                                    key="listo"
                                    onClick={guardar}
                                    disabled={!puedeGuardar || guardado}
                                    className={clsx(
                                        'col-span-1 rounded-xl font-semibold text-base transition-all min-h-14',
                                        'flex items-center justify-center',
                                        puedeGuardar && !guardado ? 'active:opacity-70' : 'opacity-30 cursor-not-allowed'
                                    )}
                                    style={
                                        puedeGuardar && !guardado
                                            ? { background: clase === 'ingreso' ? 'var(--color-ok)' : 'var(--foreground)', color: 'white' }
                                            : { background: 'var(--surface)' }
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
                                className="rounded-xl font-mono text-xl font-medium min-h-14 transition-all active:opacity-50 flex items-center justify-center"
                                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                                aria-label={tecla === '⌫' ? 'Borrar' : tecla}
                            >
                                {tecla}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Toast con undo */}
            {guardado && (
                <div
                    className="fixed bottom-24 left-4 right-4 max-w-lg mx-auto rounded-xl px-4 py-3 flex items-center justify-between z-50 shadow-lg"
                    style={{
                        background: clase === 'ingreso' ? 'var(--color-ok)' : 'var(--foreground)',
                        color: 'white',
                    }}
                    role="status"
                    aria-live="polite"
                >
                    <span className="text-sm">
                        {clase === 'ingreso' ? '↓ Ingreso' : '↑ Gasto'} guardado —{' '}
                        {moneda === 'USD' ? 'USD ' : '$ '}{importe}
                        {importeNum > 0 && (
                            <span className="opacity-70 ml-1 text-xs">
                                ≈ {monedaConvertida === 'USD' ? 'USD ' : '$ '}
                                {importeConvertido.toLocaleString('es-UY', { maximumFractionDigits: monedaConvertida === 'USD' ? 2 : 0 })}
                            </span>
                        )}
                    </span>
                    <button
                        onClick={deshacer}
                        className="text-sm font-semibold underline ml-4"
                        aria-label="Deshacer"
                    >
                        Deshacer
                    </button>
                </div>
            )}
        </div>
    );
}
