'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { calcularReservaFiscal, formatearMonto } from '@/lib/reglas';
import clsx from 'clsx';

interface EntradaBoveda {
    id: string;
    tipo: 'facturacion' | 'pago_dgi' | 'ajuste';
    monto: number;
    fecha: string;
    descripcion: string;
}

export default function PaginaBoveda() {
    const perfil = useLiveQuery(() => db.perfilFinanciero.get('perfil'));

    const [facturaciones] = useState<EntradaBoveda[]>([]);
    const [saldoBoveda, setSaldoBoveda] = useState(0);
    const [mostrarForm, setMostrarForm] = useState(false);
    const [nuevaFacturacion, setNuevaFacturacion] = useState('');
    const [anticipoPatrimonio, setAnticipoPatrimonio] = useState('');
    const [bps, setBps] = useState('');

    if (!perfil) {
        return <div className="p-4 text-center" style={{ color: 'var(--muted)' }}>Cargando…</div>;
    }

    const moneda = perfil.monedaReferencia;

    // Cálculo de reserva fiscal basado en el ingreso configurado
    const facturacion = parseFloat(nuevaFacturacion) || perfil.ingresoNeto;
    const anticipoNum = parseFloat(anticipoPatrimonio) || 0;
    const bpsNum = parseFloat(bps) || 0;

    const estado = calcularReservaFiscal(
        facturacion,
        perfil.tasaIva,
        saldoBoveda,
        anticipoNum,
        bpsNum,
    );

    const cubierta = estado.ivaEnRiesgo <= 0;
    const porcentajeCubierto = estado.reservaFiscal > 0
        ? Math.min(100, (saldoBoveda / estado.reservaFiscal) * 100)
        : 0;

    const hoy = new Date();
    // Vencimiento próximo DGI: día 25 del mes siguiente aprox
    const vencimiento = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 25);
    const diasAlVencimiento = Math.ceil((vencimiento.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));

    return (
        <div className="max-w-lg mx-auto">
            <div className="px-4 pt-6 pb-4">
                <h1 className="text-xl font-bold tracking-tight">Bóveda fiscal</h1>
                <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                    El IVA que cobraste no es tuyo
                </p>
            </div>

            {/* Alerta crítica si ivaEnRiesgo > 0 */}
            {!cubierta && (
                <div className="mx-4 mb-4 rounded-xl px-4 py-3" style={{ background: '#fef2f2', border: '1px solid #fca5a5' }}>
                    <div className="text-sm font-semibold text-red-700 mb-1" role="alert" aria-live="assertive">
                        ⛔ Estás usando el IVA
                    </div>
                    <div className="text-sm text-red-600">
                        Faltan {formatearMonto(Math.abs(estado.ivaEnRiesgo), moneda)} para cubrir la reserva fiscal.
                    </div>
                </div>
            )}

            {/* Estado de cobertura */}
            <div className="px-4 pb-4">
                <div
                    className="rounded-xl p-4"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                    {/* Tres números distintos */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                        <div>
                            <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>Saldo líquido</div>
                            <div className="tabnum font-bold text-base">{formatearMonto(saldoBoveda, moneda)}</div>
                        </div>
                        <div>
                            <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>Reserva fiscal</div>
                            <div className="tabnum font-bold text-base">{formatearMonto(estado.reservaFiscal, moneda)}</div>
                        </div>
                        <div>
                            <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>Disponible real</div>
                            <div
                                className={clsx('tabnum font-bold text-base', cubierta ? 'estado-ok' : 'estado-danger')}
                            >
                                {formatearMonto(saldoBoveda - estado.reservaFiscal, moneda)}
                            </div>
                        </div>
                    </div>

                    {/* Barra de cobertura */}
                    <div className="rounded-full h-3 overflow-hidden mb-2" style={{ background: 'var(--border)' }}>
                        <div
                            className={clsx('h-full rounded-full', cubierta ? 'barra-ok' : 'barra-danger')}
                            style={{ width: `${porcentajeCubierto}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-xs" style={{ color: 'var(--muted)' }}>
                        <span>{Math.round(porcentajeCubierto)}% cubierto</span>
                        <span className={clsx(cubierta ? 'estado-ok' : 'estado-danger')}>
                            {cubierta ? '✓ Cubierto' : '⚠ Descubierto'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Cuenta regresiva al vencimiento */}
            <div className="px-4 mb-4">
                <div
                    className="rounded-xl px-4 py-3 flex items-center justify-between"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                >
                    <div>
                        <div className="text-xs" style={{ color: 'var(--muted)' }}>Próximo vencimiento DGI</div>
                        <div className="text-sm font-medium mt-0.5">
                            {vencimiento.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </div>
                    </div>
                    <div
                        className={clsx(
                            'tabnum text-2xl font-bold',
                            diasAlVencimiento <= 7 ? 'estado-danger' :
                                diasAlVencimiento <= 15 ? 'estado-warn' : 'estado-ok'
                        )}
                    >
                        {diasAlVencimiento}d
                    </div>
                </div>
            </div>

            {/* Desglose */}
            <div className="px-4 mb-4">
                <div className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
                    Composición de la reserva
                </div>
                <div
                    className="rounded-xl overflow-hidden divide-y"
                    style={{ border: '1px solid var(--border)' }}
                >
                    <div className="flex justify-between px-4 py-3 text-sm">
                        <span>IVA ({(perfil.tasaIva * 100).toFixed(0)}% sobre {formatearMonto(facturacion, moneda)})</span>
                        <span className="tabnum font-medium">{formatearMonto(estado.ivaAReservar, moneda)}</span>
                    </div>
                    {anticipoNum > 0 && (
                        <div className="flex justify-between px-4 py-3 text-sm">
                            <span>Anticipo patrimonio</span>
                            <span className="tabnum font-medium">{formatearMonto(anticipoNum, moneda)}</span>
                        </div>
                    )}
                    {bpsNum > 0 && (
                        <div className="flex justify-between px-4 py-3 text-sm">
                            <span>BPS</span>
                            <span className="tabnum font-medium">{formatearMonto(bpsNum, moneda)}</span>
                        </div>
                    )}
                    <div className="flex justify-between px-4 py-3 text-sm font-semibold" style={{ background: 'var(--surface)' }}>
                        <span>Total a reservar</span>
                        <span className="tabnum">{formatearMonto(estado.reservaFiscal, moneda)}</span>
                    </div>
                </div>
            </div>

            {/* Ajustar saldo de la bóveda */}
            <div className="px-4 pb-8">
                <button
                    onClick={() => setMostrarForm(v => !v)}
                    className="w-full rounded-xl py-3 text-sm font-medium mb-3"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                    aria-expanded={mostrarForm}
                >
                    {mostrarForm ? '▲ Cerrar' : '▼ Ajustar saldo de la bóveda'}
                </button>

                {mostrarForm && (
                    <div
                        className="rounded-xl p-4"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                    >
                        <div className="flex flex-col gap-3">
                            <div>
                                <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>
                                    Saldo en bóveda ({moneda})
                                </label>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={saldoBoveda || ''}
                                    onChange={e => setSaldoBoveda(parseFloat(e.target.value) || 0)}
                                    className="w-full rounded-lg px-3 py-2 text-sm min-h-[44px] tabnum"
                                    style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                    aria-label="Saldo en bóveda"
                                />
                            </div>
                            <div>
                                <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>
                                    Anticipo patrimonio ({moneda})
                                </label>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={anticipoPatrimonio}
                                    onChange={e => setAnticipoPatrimonio(e.target.value)}
                                    className="w-full rounded-lg px-3 py-2 text-sm min-h-[44px] tabnum"
                                    style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                    aria-label="Anticipo patrimonio"
                                />
                            </div>
                            <div>
                                <label className="text-xs mb-1 block" style={{ color: 'var(--muted)' }}>
                                    BPS ({moneda})
                                </label>
                                <input
                                    type="number"
                                    placeholder="0"
                                    value={bps}
                                    onChange={e => setBps(e.target.value)}
                                    className="w-full rounded-lg px-3 py-2 text-sm min-h-[44px] tabnum"
                                    style={{ background: 'var(--background)', border: '1px solid var(--border)' }}
                                    aria-label="BPS"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Instrucción */}
                <div
                    className="rounded-xl px-4 py-3 text-xs mt-3"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--muted)' }}
                >
                    <strong>Cómo funciona:</strong> Al registrar una facturación, el IVA se aparta aquí automáticamente. Al pagar DGI, conciliá el pago contra el apartado para liberar el excedente.
                </div>
            </div>
        </div>
    );
}
