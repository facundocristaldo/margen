'use client';

import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import type { CompromisoRecurrente, PlanDeCuotas } from '@/types/domain';
import { formatearMonto, mesActual, sumarMeses } from '@/lib/reglas';
import clsx from 'clsx';
import Link from 'next/link';

export default function PaginaAjustes() {
    const perfil = useLiveQuery(() => db.perfilFinanciero.get('perfil'));
    const compromisos = useLiveQuery(() => db.compromisosRecurrentes.toArray());
    const planes = useLiveQuery(() => db.planesDeCuotas.toArray());
    const cuentas = useLiveQuery(() => db.cuentas.toArray());
    const tiposCambio = useLiveQuery(() => db.tiposDeCambio.toArray());

    const [tab, setTab] = useState<'perfil' | 'compromisos' | 'planes' | 'cambio'>('perfil');

    // Perfil form
    const [ingresoNeto, setIngresoNeto] = useState('');
    const [monedaIngreso, setMonedaIngreso] = useState<'UYU' | 'USD'>('USD');
    const [tasaIva, setTasaIva] = useState('22');
    const [colchon, setColchon] = useState('400');
    const [consumoDebito, setConsumoDebito] = useState('');
    const [guardandoPerfil, setGuardandoPerfil] = useState(false);

    // Compromiso form
    const [mostrarFormCompromiso, setMostrarFormCompromiso] = useState(false);
    const [nuevoC, setNuevoC] = useState({
        nombre: '', tipo: 'prestamo' as CompromisoRecurrente['tipo'],
        importe: '', moneda: 'USD' as 'UYU' | 'USD',
        frecuencia: 'mensual' as CompromisoRecurrente['frecuencia'],
        diaDelMes: '1', desde: mesActual(), hasta: '',
        esEstimado: false,
    });

    // Plan form
    const [mostrarFormPlan, setMostrarFormPlan] = useState(false);
    const [nuevoP, setNuevoP] = useState({
        comercio: '', importeCuota: '', cuotasTotal: '',
        primeraCuota: mesActual(), moneda: 'UYU' as 'UYU' | 'USD',
        cuentaId: 'tarjeta-visa',
    });

    // TC form
    const [tcFecha, setTcFecha] = useState(new Date().toISOString().slice(0, 10));
    const [tcVenta, setTcVenta] = useState('');

    useEffect(() => {
        if (perfil) {
            setIngresoNeto(String(perfil.ingresoNeto || ''));
            setMonedaIngreso(perfil.monedaIngreso);
            setTasaIva(String((perfil.tasaIva * 100).toFixed(0)));
            setColchon(String(perfil.colchonObjetivo));
            setConsumoDebito(String(perfil.consumoDebitoEstimado || ''));
        }
    }, [perfil]);

    async function guardarPerfil() {
        setGuardandoPerfil(true);
        await db.perfilFinanciero.put({
            id: 'perfil',
            ingresoNeto: parseFloat(ingresoNeto) || 0,
            monedaIngreso,
            tasaIva: parseFloat(tasaIva) / 100,
            diaFacturacion: 1,
            monedaReferencia: monedaIngreso,
            consumoDebitoEstimado: parseFloat(consumoDebito) || 0,
            colchonObjetivo: parseFloat(colchon) || 400,
        });
        setGuardandoPerfil(false);
    }

    async function crearCompromiso() {
        const id = `comp-${Date.now()}`;
        const c: CompromisoRecurrente = {
            id,
            nombre: nuevoC.nombre,
            tipo: nuevoC.tipo,
            importe: parseFloat(nuevoC.importe) || 0,
            moneda: nuevoC.moneda,
            frecuencia: nuevoC.frecuencia,
            diaDelMes: parseInt(nuevoC.diaDelMes) || 1,
            desde: nuevoC.desde,
            hasta: nuevoC.hasta || undefined,
            esEstimado: nuevoC.esEstimado,
            modoEstimacion: 'fijo',
        };
        await db.compromisosRecurrentes.put(c);
        setMostrarFormCompromiso(false);
        setNuevoC({ nombre: '', tipo: 'prestamo', importe: '', moneda: 'USD', frecuencia: 'mensual', diaDelMes: '1', desde: mesActual(), hasta: '', esEstimado: false });
    }

    async function eliminarCompromiso(id: string) {
        await db.compromisosRecurrentes.delete(id);
    }

    async function crearPlan() {
        const id = `plan-${Date.now()}`;
        const p: PlanDeCuotas = {
            id,
            comercio: nuevoP.comercio,
            cuentaId: nuevoP.cuentaId,
            moneda: nuevoP.moneda,
            importeCuota: parseFloat(nuevoP.importeCuota) || 0,
            cuotasTotal: parseInt(nuevoP.cuotasTotal) || 1,
            primeraCuota: nuevoP.primeraCuota,
            estado: 'activo',
        };
        await db.planesDeCuotas.put(p);
        setMostrarFormPlan(false);
        setNuevoP({ comercio: '', importeCuota: '', cuotasTotal: '', primeraCuota: mesActual(), moneda: 'UYU', cuentaId: 'tarjeta-visa' });
    }

    async function eliminarPlan(id: string) {
        await db.planesDeCuotas.update(id, { estado: 'cancelado' });
    }

    async function guardarTC() {
        const venta = parseFloat(tcVenta);
        if (!venta) return;
        await db.tiposDeCambio.put({
            id: tcFecha,
            fecha: tcFecha,
            compra: venta * 0.99,
            venta,
            fuente: 'manual',
        });
        setTcVenta('');
    }

    const TABS = [
        { id: 'perfil', label: 'Perfil' },
        { id: 'compromisos', label: 'Compromisos' },
        { id: 'planes', label: 'Planes' },
        { id: 'cambio', label: 'TC' },
    ] as const;

    return (
        <div className="max-w-lg mx-auto">
            <div className="px-4 pt-6 pb-2">
                <h1 className="text-xl font-bold tracking-tight">Ajustes</h1>
            </div>

            {/* Tabs */}
            <div className="px-4 mb-4">
                <div
                    className="flex rounded-xl overflow-hidden"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                    role="tablist"
                >
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            role="tab"
                            aria-selected={tab === t.id}
                            className="flex-1 py-2 text-sm font-medium transition-all"
                            style={
                                tab === t.id
                                    ? { background: 'var(--foreground)', color: 'var(--background)' }
                                    : {}
                            }
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="px-4 pb-8">

                {/* ── PERFIL ── */}
                {tab === 'perfil' && (
                    <div className="flex flex-col gap-4">
                        <Campo label="Ingreso neto mensual">
                            <div className="flex gap-2">
                                <select
                                    value={monedaIngreso}
                                    onChange={e => setMonedaIngreso(e.target.value as 'UYU' | 'USD')}
                                    className="rounded-lg px-3 py-2 text-sm min-h-[44px] w-20"
                                    style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                    aria-label="Moneda del ingreso"
                                >
                                    <option value="USD">USD</option>
                                    <option value="UYU">UYU</option>
                                </select>
                                <input
                                    type="number"
                                    placeholder="5200"
                                    value={ingresoNeto}
                                    onChange={e => setIngresoNeto(e.target.value)}
                                    className="flex-1 rounded-lg px-3 py-2 text-sm min-h-[44px] tabnum"
                                    style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                    aria-label="Ingreso neto"
                                />
                            </div>
                        </Campo>

                        <Campo label="Tasa de IVA (%)">
                            <input
                                type="number"
                                value={tasaIva}
                                onChange={e => setTasaIva(e.target.value)}
                                className="w-full rounded-lg px-3 py-2 text-sm min-h-[44px] tabnum"
                                style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                aria-label="Tasa IVA"
                            />
                        </Campo>

                        <Campo label={`Colchón objetivo (${monedaIngreso})`} desc="Reserva mínima intocable. El techo se calcula dejando este margen libre.">
                            <input
                                type="number"
                                placeholder="400"
                                value={colchon}
                                onChange={e => setColchon(e.target.value)}
                                className="w-full rounded-lg px-3 py-2 text-sm min-h-[44px] tabnum"
                                style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                aria-label="Colchón objetivo"
                            />
                        </Campo>

                        <Campo label={`Consumo débito estimado (${monedaIngreso})`} desc="Gasto mensual con débito (supermercado, nafta, etc.) — se resta del techo de la tarjeta.">
                            <input
                                type="number"
                                placeholder="0"
                                value={consumoDebito}
                                onChange={e => setConsumoDebito(e.target.value)}
                                className="w-full rounded-lg px-3 py-2 text-sm min-h-[44px] tabnum"
                                style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                aria-label="Consumo débito estimado"
                            />
                        </Campo>

                        <button
                            onClick={guardarPerfil}
                            disabled={guardandoPerfil}
                            className="w-full rounded-xl py-3 text-sm font-semibold min-h-[48px] transition-opacity active:opacity-70"
                            style={{ background: 'var(--foreground)', color: 'var(--background)' }}
                        >
                            {guardandoPerfil ? 'Guardando…' : 'Guardar perfil'}
                        </button>

                        {perfil && perfil.ingresoNeto > 0 && (
                            <div
                                className="rounded-xl px-4 py-3 text-xs"
                                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
                            >
                                El IVA nunca entra en el ingreso neto — es dinero en tránsito que va a la Bóveda.
                            </div>
                        )}
                    </div>
                )}

                {/* ── COMPROMISOS ── */}
                {tab === 'compromisos' && (
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-sm font-medium">
                                {compromisos?.length ?? 0} compromisos
                            </div>
                            <button
                                onClick={() => setMostrarFormCompromiso(v => !v)}
                                className="rounded-full px-3 py-1.5 text-sm font-medium min-h-[36px]"
                                style={{ background: 'var(--foreground)', color: 'var(--background)' }}
                                aria-label="Agregar compromiso"
                            >
                                + Agregar
                            </button>
                        </div>

                        {mostrarFormCompromiso && (
                            <div
                                className="rounded-xl p-4 mb-4"
                                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                            >
                                <div className="flex flex-col gap-3">
                                    <input
                                        type="text"
                                        placeholder="Nombre (ej: Scotiabank)"
                                        value={nuevoC.nombre}
                                        onChange={e => setNuevoC(v => ({ ...v, nombre: e.target.value }))}
                                        className="w-full rounded-lg px-3 py-2 text-sm min-h-[44px]"
                                        style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                        aria-label="Nombre del compromiso"
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                        <select
                                            value={nuevoC.tipo}
                                            onChange={e => setNuevoC(v => ({ ...v, tipo: e.target.value as CompromisoRecurrente['tipo'] }))}
                                            className="rounded-lg px-3 py-2 text-sm min-h-[44px]"
                                            style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                            aria-label="Tipo de compromiso"
                                        >
                                            <option value="prestamo">Préstamo</option>
                                            <option value="impuesto">Impuesto</option>
                                            <option value="seguro">Seguro</option>
                                            <option value="servicio">Servicio</option>
                                            <option value="suscripcion">Suscripción</option>
                                        </select>
                                        <select
                                            value={nuevoC.frecuencia}
                                            onChange={e => setNuevoC(v => ({ ...v, frecuencia: e.target.value as CompromisoRecurrente['frecuencia'] }))}
                                            className="rounded-lg px-3 py-2 text-sm min-h-[44px]"
                                            style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                            aria-label="Frecuencia"
                                        >
                                            <option value="mensual">Mensual</option>
                                            <option value="bimestral">Bimestral</option>
                                            <option value="anual">Anual</option>
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Importe</label>
                                            <div className="flex gap-1">
                                                <select
                                                    value={nuevoC.moneda}
                                                    onChange={e => setNuevoC(v => ({ ...v, moneda: e.target.value as 'UYU' | 'USD' }))}
                                                    className="rounded-lg px-2 py-2 text-xs min-h-[44px] w-16"
                                                    style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                                    aria-label="Moneda"
                                                >
                                                    <option value="USD">USD</option>
                                                    <option value="UYU">UYU</option>
                                                </select>
                                                <input
                                                    type="number"
                                                    placeholder="0"
                                                    value={nuevoC.importe}
                                                    onChange={e => setNuevoC(v => ({ ...v, importe: e.target.value }))}
                                                    className="flex-1 rounded-lg px-3 py-2 text-sm min-h-[44px] tabnum"
                                                    style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                                    aria-label="Importe"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Desde (YYYY-MM)</label>
                                            <input
                                                type="month"
                                                value={nuevoC.desde}
                                                onChange={e => setNuevoC(v => ({ ...v, desde: e.target.value }))}
                                                className="w-full rounded-lg px-3 py-2 text-sm min-h-[44px]"
                                                style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                                aria-label="Desde"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>
                                            Hasta (opcional — para préstamos con fin)
                                        </label>
                                        <input
                                            type="month"
                                            value={nuevoC.hasta}
                                            onChange={e => setNuevoC(v => ({ ...v, hasta: e.target.value }))}
                                            className="w-full rounded-lg px-3 py-2 text-sm min-h-[44px]"
                                            style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                            aria-label="Hasta"
                                        />
                                    </div>
                                    <label className="flex items-center gap-2 text-sm min-h-[44px]">
                                        <input
                                            type="checkbox"
                                            checked={nuevoC.esEstimado}
                                            onChange={e => setNuevoC(v => ({ ...v, esEstimado: e.target.checked }))}
                                            className="w-4 h-4"
                                            aria-label="Es estimado (variable)"
                                        />
                                        Es estimado (variable, como UTE o ANTEL)
                                    </label>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setMostrarFormCompromiso(false)}
                                            className="flex-1 rounded-lg py-2 text-sm min-h-[44px]"
                                            style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={crearCompromiso}
                                            disabled={!nuevoC.nombre || !nuevoC.importe}
                                            className="flex-1 rounded-lg py-2 text-sm font-semibold min-h-[44px]"
                                            style={{ background: 'var(--foreground)', color: 'var(--background)' }}
                                        >
                                            Agregar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col gap-2">
                            {compromisos?.map(c => (
                                <div
                                    key={c.id}
                                    className="rounded-xl px-4 py-3 flex items-center justify-between"
                                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                                >
                                    <div>
                                        <div className="text-sm font-medium">{c.nombre}</div>
                                        <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                                            {formatearMonto(c.importe, c.moneda)}/{c.frecuencia === 'mensual' ? 'mes' : c.frecuencia}
                                            {c.hasta && ` · hasta ${c.hasta}`}
                                            {c.esEstimado && ' · estimado'}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => eliminarCompromiso(c.id)}
                                        className="text-sm px-2 py-1 rounded-full min-h-[32px]"
                                        style={{ color: 'var(--color-danger)' }}
                                        aria-label={`Eliminar compromiso ${c.nombre}`}
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                            {compromisos?.length === 0 && (
                                <div className="text-center py-6 text-sm" style={{ color: 'var(--muted)' }}>
                                    Sin compromisos. Agregá tus préstamos y servicios fijos.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── PLANES DE CUOTAS ── */}
                {tab === 'planes' && (
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-sm font-medium">
                                {planes?.filter(p => p.estado === 'activo').length ?? 0} planes activos
                            </div>
                            <button
                                onClick={() => setMostrarFormPlan(v => !v)}
                                className="rounded-full px-3 py-1.5 text-sm font-medium min-h-[36px]"
                                style={{ background: 'var(--foreground)', color: 'var(--background)' }}
                                aria-label="Agregar plan de cuotas"
                            >
                                + Agregar
                            </button>
                        </div>

                        {mostrarFormPlan && (
                            <div
                                className="rounded-xl p-4 mb-4"
                                style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                            >
                                <div className="flex flex-col gap-3">
                                    <input
                                        type="text"
                                        placeholder="Comercio (ej: Total Import)"
                                        value={nuevoP.comercio}
                                        onChange={e => setNuevoP(v => ({ ...v, comercio: e.target.value }))}
                                        className="w-full rounded-lg px-3 py-2 text-sm min-h-[44px]"
                                        style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                        aria-label="Comercio"
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Importe por cuota</label>
                                            <div className="flex gap-1">
                                                <select
                                                    value={nuevoP.moneda}
                                                    onChange={e => setNuevoP(v => ({ ...v, moneda: e.target.value as 'UYU' | 'USD' }))}
                                                    className="rounded-lg px-2 py-2 text-xs min-h-[44px] w-16"
                                                    style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                                    aria-label="Moneda"
                                                >
                                                    <option value="UYU">$</option>
                                                    <option value="USD">USD</option>
                                                </select>
                                                <input
                                                    type="number"
                                                    placeholder="5088"
                                                    value={nuevoP.importeCuota}
                                                    onChange={e => setNuevoP(v => ({ ...v, importeCuota: e.target.value }))}
                                                    className="flex-1 rounded-lg px-3 py-2 text-sm min-h-[44px] tabnum"
                                                    style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                                    aria-label="Importe por cuota"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Total de cuotas</label>
                                            <input
                                                type="number"
                                                placeholder="5"
                                                value={nuevoP.cuotasTotal}
                                                onChange={e => setNuevoP(v => ({ ...v, cuotasTotal: e.target.value }))}
                                                className="w-full rounded-lg px-3 py-2 text-sm min-h-[44px] tabnum"
                                                style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                                aria-label="Total de cuotas"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>Primera cuota (mes)</label>
                                        <input
                                            type="month"
                                            value={nuevoP.primeraCuota}
                                            onChange={e => setNuevoP(v => ({ ...v, primeraCuota: e.target.value }))}
                                            className="w-full rounded-lg px-3 py-2 text-sm min-h-[44px]"
                                            style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                            aria-label="Primera cuota"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setMostrarFormPlan(false)}
                                            className="flex-1 rounded-lg py-2 text-sm min-h-[44px]"
                                            style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={crearPlan}
                                            disabled={!nuevoP.comercio || !nuevoP.importeCuota || !nuevoP.cuotasTotal}
                                            className="flex-1 rounded-lg py-2 text-sm font-semibold min-h-[44px]"
                                            style={{ background: 'var(--foreground)', color: 'var(--background)' }}
                                        >
                                            Agregar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex flex-col gap-2">
                            {planes?.filter(p => p.estado === 'activo').map(p => {
                                const ultimaMes = sumarMeses(p.primeraCuota, p.cuotasTotal - 1);
                                const cuotaNroActual = Math.max(1,
                                    Array.from({ length: p.cuotasTotal }, (_, i) => sumarMeses(p.primeraCuota, i))
                                        .filter(m => m <= mesActual()).length
                                );
                                return (
                                    <div
                                        key={p.id}
                                        className="rounded-xl px-4 py-3 flex items-center justify-between"
                                        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                                    >
                                        <div>
                                            <div className="text-sm font-medium">{p.comercio}</div>
                                            <div className="text-xs mt-0.5 tabnum" style={{ color: 'var(--muted)' }}>
                                                {formatearMonto(p.importeCuota, p.moneda)}/mes · cuota {cuotaNroActual}/{p.cuotasTotal}
                                                {' · '}termina {ultimaMes}
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => eliminarPlan(p.id)}
                                            className="text-sm px-2 py-1 rounded-full min-h-[32px]"
                                            style={{ color: 'var(--color-danger)' }}
                                            aria-label={`Cancelar plan ${p.comercio}`}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                );
                            })}
                            {planes?.filter(p => p.estado === 'activo').length === 0 && (
                                <div className="text-center py-6 text-sm" style={{ color: 'var(--muted)' }}>
                                    Sin planes activos. Agregá tus compras en cuotas.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── TIPO DE CAMBIO ── */}
                {tab === 'cambio' && (
                    <div>
                        <div className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
                            El tipo de cambio se congela a la fecha del movimiento. Un gasto pasado no cambia de tamaño porque se movió el dólar.
                        </div>

                        <div
                            className="rounded-xl p-4 mb-4"
                            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                        >
                            <div className="text-sm font-semibold mb-3">Cargar cotización manual</div>
                            <div className="flex gap-2">
                                <input
                                    type="date"
                                    value={tcFecha}
                                    onChange={e => setTcFecha(e.target.value)}
                                    className="flex-1 rounded-lg px-3 py-2 text-sm min-h-[44px]"
                                    style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                    aria-label="Fecha del tipo de cambio"
                                />
                                <input
                                    type="number"
                                    placeholder="Venta"
                                    value={tcVenta}
                                    onChange={e => setTcVenta(e.target.value)}
                                    className="w-28 rounded-lg px-3 py-2 text-sm min-h-[44px] tabnum"
                                    style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                    aria-label="Tipo de cambio venta"
                                />
                                <button
                                    onClick={guardarTC}
                                    disabled={!tcVenta}
                                    className="rounded-lg px-4 py-2 text-sm font-semibold min-h-[44px]"
                                    style={{ background: 'var(--foreground)', color: 'var(--background)' }}
                                    aria-label="Guardar tipo de cambio"
                                >
                                    OK
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1">
                            {tiposCambio?.slice(-10).reverse().map(tc => (
                                <div
                                    key={tc.id}
                                    className="flex justify-between items-center px-4 py-2.5 rounded-lg text-sm"
                                    style={{ background: 'var(--surface)' }}
                                >
                                    <span style={{ color: 'var(--muted)' }}>{tc.fecha}</span>
                                    <span className="tabnum font-medium">
                                        {tc.venta.toLocaleString('es-UY', { minimumFractionDigits: 2 })}
                                        <span className="text-xs ml-1" style={{ color: 'var(--muted)' }}>{tc.fuente}</span>
                                    </span>
                                </div>
                            ))}
                            {!tiposCambio?.length && (
                                <div className="text-center py-6 text-sm" style={{ color: 'var(--muted)' }}>
                                    Sin cotizaciones cargadas. Sin TC, se usa 40 como fallback.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function Campo({
    label, desc, children,
}: {
    label: string;
    desc?: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            <label className="text-sm font-medium block mb-1">{label}</label>
            {desc && <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>{desc}</p>}
            {children}
        </div>
    );
}
