/**
 * Motor de reglas R1–R4 (Fase 1 MVP)
 * Todas las funciones son puras y deterministas.
 */

import type {
    PerfilFinanciero,
    Movimiento,
    PlanDeCuotas,
    CompromisoRecurrente,
    TipoCambio,
    GastoPlanificado,
    MesProyectado,
} from '@/types/domain';

// ── Utilidades de fecha ──────────────────────────────────────────────────────

/** "2026-08" → { año: 2026, mes: 8 } */
export function parsearMes(mes: string): { año: number; mes: number } {
    const [a, m] = mes.split('-').map(Number);
    return { año: a, mes: m };
}

/** Sumar N meses a un string "YYYY-MM" */
export function sumarMeses(mes: string, n: number): string {
    const { año, mes: m } = parsearMes(mes);
    const total = m - 1 + n;
    const nuevoMes = (total % 12) + 1;
    const nuevoAño = año + Math.floor(total / 12);
    return `${nuevoAño}-${String(nuevoMes).padStart(2, '0')}`;
}

/** Mes actual en formato "YYYY-MM" */
export function mesActual(): string {
    const hoy = new Date();
    return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
}

/** Generar los próximos N meses desde uno dado (inclusive) */
export function generarMeses(desde: string, cantidad: number): string[] {
    return Array.from({ length: cantidad }, (_, i) => sumarMeses(desde, i));
}

/** Días entre dos fechas ISO */
export function diasEntre(fechaA: string, fechaB: string): number {
    const a = new Date(fechaA);
    const b = new Date(fechaB);
    return Math.abs((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

// ── R3 · Consolidación multimoneda ──────────────────────────────────────────

export function consolidar(
    monto: number,
    moneda: 'UYU' | 'USD',
    monedaReferencia: 'UYU' | 'USD',
    tc: number, // tipo de cambio venta a la fecha del movimiento
): number {
    if (moneda === monedaReferencia) return monto;
    if (monedaReferencia === 'USD' && moneda === 'UYU') return monto / tc;
    if (monedaReferencia === 'UYU' && moneda === 'USD') return monto * tc;
    return monto;
}

// ── TC por defecto cuando no hay dato ───────────────────────────────────────

export function tcVentaPorFecha(fecha: string, tiposCambio: TipoCambio[]): number {
    const exacto = tiposCambio.find(tc => tc.fecha === fecha);
    if (exacto) return exacto.venta;
    // buscar el más cercano anterior
    const anteriores = tiposCambio
        .filter(tc => tc.fecha <= fecha)
        .sort((a, b) => b.fecha.localeCompare(a.fecha));
    return anteriores[0]?.venta ?? 40; // fallback razonable
}

// ── R5 · Clasificación de movimientos ───────────────────────────────────────

export function consumoDelCiclo(
    movimientos: Movimiento[],
    monedaReferencia: 'UYU' | 'USD',
    tiposCambio: TipoCambio[],
): number {
    return movimientos
        .filter(m => ['gasto', 'deuda'].includes(m.clase))
        .filter(m => !m.revertidoPor)
        .filter(m => m.estado !== 'absorbido')
        .reduce((total, m) => {
            const tc = tcVentaPorFecha(m.fecha, tiposCambio);
            const monto = consolidar(Math.abs(m.importe), m.moneda, monedaReferencia, tc);
            return total + monto;
        }, 0);
}

// ── R1 · Techo del mes ──────────────────────────────────────────────────────

export interface InputTecho {
    perfil: PerfilFinanciero;
    compromisosRecurrentes: CompromisoRecurrente[];
    planesDeCuotas: PlanDeCuotas[];
    aportesAhorro: { mes: string; montoPlan: number }[];
    tiposCambio: TipoCambio[];
    mes: string; // "2026-09"
}

/** Cuánto paga un compromiso en un mes dado */
export function importeCompromisoEnMes(c: CompromisoRecurrente, mes: string): number {
    if (c.hasta && mes > c.hasta) return 0;
    if (mes < c.desde) return 0;

    const { mes: numMes } = parsearMes(mes);
    if (c.frecuencia === 'mensual') return c.importe;
    if (c.frecuencia === 'bimestral') {
        const { mes: desdeNum } = parsearMes(c.desde);
        const diff = (parsearMes(mes).mes - desdeNum + 12) % 12;
        return diff % 2 === 0 ? c.importe : 0;
    }
    if (c.frecuencia === 'anual') {
        const { mes: desdeNum } = parsearMes(c.desde);
        return numMes === desdeNum ? c.importe : 0;
    }
    return c.importe;
}

/** Total de cuotas comprometidas en un mes */
export function cuotasComprometidasEnMes(
    planes: PlanDeCuotas[],
    mes: string,
    monedaReferencia: 'UYU' | 'USD',
    tiposCambio: TipoCambio[],
): number {
    return planes
        .filter(p => p.estado === 'activo')
        .reduce((total, plan) => {
            const ultimaMes = sumarMeses(plan.primeraCuota, plan.cuotasTotal - 1);
            if (mes < plan.primeraCuota || mes > ultimaMes) return total;
            const tc = tcVentaPorFecha(mes + '-01', tiposCambio);
            return total + consolidar(plan.importeCuota, plan.moneda, monedaReferencia, tc);
        }, 0);
}

export function techo(input: InputTecho): number {
    const { perfil, compromisosRecurrentes, planesDeCuotas, aportesAhorro, tiposCambio, mes } = input;

    const compromisos = compromisosRecurrentes.reduce((total, c) => {
        const importe = importeCompromisoEnMes(c, mes);
        const tc = tcVentaPorFecha(mes + '-01', tiposCambio);
        return total + consolidar(importe, c.moneda, perfil.monedaReferencia, tc);
    }, 0);

    const cuotas = cuotasComprometidasEnMes(planesDeCuotas, mes, perfil.monedaReferencia, tiposCambio);

    const aportes = aportesAhorro
        .filter(a => a.mes === mes)
        .reduce((t, a) => t + a.montoPlan, 0);

    const tc = tcVentaPorFecha(mes + '-01', tiposCambio);
    const debitoEst = consolidar(perfil.consumoDebitoEstimado, perfil.monedaIngreso, perfil.monedaReferencia, tc);
    const ingreso = consolidar(perfil.ingresoNeto, perfil.monedaIngreso, perfil.monedaReferencia, tc);

    return ingreso - debitoEst - compromisos - cuotas - aportes - perfil.colchonObjetivo;
}

export function disponible(
    inputTecho: InputTecho,
    consumoNuevo: number,
): number {
    return techo(inputTecho) - consumoNuevo;
}

// ── R2 · Reserva fiscal ──────────────────────────────────────────────────────

export interface EstadoFiscal {
    ivaAReservar: number;
    reservaFiscal: number;
    ivaEnRiesgo: number; // > 0 → alerta A1
}

export function calcularReservaFiscal(
    facturacionDelPeriodo: number,
    tasaIva: number,
    saldoEnBoveda: number,
    anticipoPatrimonio = 0,
    bps = 0,
): EstadoFiscal {
    const ivaAReservar = facturacionDelPeriodo * tasaIva;
    const reservaFiscal = ivaAReservar + anticipoPatrimonio + bps;
    const ivaEnRiesgo = reservaFiscal - saldoEnBoveda;
    return { ivaAReservar, reservaFiscal, ivaEnRiesgo };
}

// ── R4 · Impacto de una compra en cuotas ─────────────────────────────────────

export interface SimulacionCuotas {
    proyectado: { mes: string; disponibleAntes: number; disponibleDespues: number }[];
    mesesEnRojo: string[];
    compromisoTotal: number;
    liberaEn: string;
    cuotaMensual: number;
}

export function simularCompraEnCuotas(
    monto: number,
    n: number,
    mesInicio: string,
    getDisponible: (mes: string) => number,
): SimulacionCuotas {
    const cuotaMensual = monto / n;
    const proyectado = [];
    const mesesEnRojo: string[] = [];

    for (let i = 0; i < n; i++) {
        const mes = sumarMeses(mesInicio, i);
        const disponibleAntes = getDisponible(mes);
        const disponibleDespues = disponibleAntes - cuotaMensual;
        proyectado.push({ mes, disponibleAntes, disponibleDespues });
        if (disponibleDespues < 0) mesesEnRojo.push(mes);
    }

    return {
        proyectado,
        mesesEnRojo,
        compromisoTotal: monto,
        liberaEn: sumarMeses(mesInicio, n),
        cuotaMensual,
    };
}

// ── Proyección de horizonte (12 meses) ──────────────────────────────────────

export function proyectarHorizonte(
    perfil: PerfilFinanciero,
    compromisosRecurrentes: CompromisoRecurrente[],
    planesDeCuotas: PlanDeCuotas[],
    aportesAhorro: { mes: string; montoPlan: number }[],
    tiposCambio: TipoCambio[],
    gastosPlanificados: GastoPlanificado[],
    meses: string[],
): MesProyectado[] {
    return meses.map((mes, idx) => {
        const mesAnterior = idx > 0 ? meses[idx - 1] : null;

        const input: InputTecho = {
            perfil,
            compromisosRecurrentes,
            planesDeCuotas,
            aportesAhorro,
            tiposCambio,
            mes,
        };

        const techoMes = techo(input);

        const cuotasDetalle: MesProyectado['cuotasDetalle'] = planesDeCuotas
            .filter(p => p.estado === 'activo')
            .filter(p => {
                const ultimaMes = sumarMeses(p.primeraCuota, p.cuotasTotal - 1);
                return mes >= p.primeraCuota && mes <= ultimaMes;
            })
            .map(p => {
                const cuotaNro = generarMeses(p.primeraCuota, p.cuotasTotal).indexOf(mes) + 1;
                return {
                    planId: p.id,
                    comercio: p.comercio,
                    cuotaNro,
                    cuotasTotal: p.cuotasTotal,
                    importe: p.importeCuota,
                };
            });

        const compromisoDetalle: MesProyectado['compromisoDetalle'] = compromisosRecurrentes
            .filter(c => importeCompromisoEnMes(c, mes) > 0)
            .map(c => ({ nombre: c.nombre, importe: importeCompromisoEnMes(c, mes) }));

        // Liberaciones: compromisos que terminan este mes
        const liberaciones: MesProyectado['liberaciones'] = [];
        for (const c of compromisosRecurrentes) {
            if (c.hasta === mes) {
                liberaciones.push({ nombre: c.nombre, importe: c.importe });
            }
        }
        // Planes que terminan este mes
        for (const p of planesDeCuotas) {
            if (p.estado === 'activo') {
                const ultimaMes = sumarMeses(p.primeraCuota, p.cuotasTotal - 1);
                if (ultimaMes === mes) {
                    liberaciones.push({ nombre: p.comercio, importe: p.importeCuota });
                }
            }
        }

        const comprometido = cuotasDetalle.reduce((t, c) => t + c.importe, 0)
            + compromisoDetalle.reduce((t, c) => t + c.importe, 0);

        return {
            mes,
            techo: techoMes,
            comprometido,
            disponible: techoMes,
            cuotasDetalle,
            compromisoDetalle,
            liberaciones,
        };
    });
}

// ── R6 · Ahorro hacia una meta ──────────────────────────────────────────────

export function aporteMensual(
    montoObjetivo: number,
    ahorrado: number,
    mesesRestantes: number,
): number {
    if (mesesRestantes <= 0) return montoObjetivo - ahorrado;
    return (montoObjetivo - ahorrado) / mesesRestantes;
}

export function fechaAlcanzable(
    meta: GastoPlanificado,
    capacidadPorMes: { mes: string; capacidad: number }[],
): string | null {
    let acumulado = meta.ahorrado;
    for (const { mes, capacidad } of capacidadPorMes) {
        acumulado += capacidad;
        if (acumulado >= meta.montoObjetivo) return mes;
    }
    return null;
}

// ── R8 · Ahorrar o financiar ─────────────────────────────────────────────────

export function calcularCuotaFinanciamiento(monto: number, n: number, tea: number): number {
    const i = Math.pow(1 + tea, 1 / 12) - 1;
    return (monto * i) / (1 - Math.pow(1 + i, -n));
}

export function costoDeFinanciar(monto: number, n: number, tea: number): number {
    const cuota = calcularCuotaFinanciamiento(monto, n, tea);
    return cuota * n - monto;
}

// ── R9 · Conciliación previsto ↔ confirmado ──────────────────────────────────

export interface ParConciliacion {
    previsto: Movimiento;
    confirmado: Movimiento;
}

export function encontrarCandidatosConciliacion(
    confirmado: Movimiento,
    previstos: Movimiento[],
): Movimiento[] {
    return previstos.filter(p => {
        if (p.cuentaId !== confirmado.cuentaId) return false;
        if (p.estado !== 'previsto') return false;
        const diferenciaImporte = Math.abs(Math.abs(p.importe) - Math.abs(confirmado.importe));
        const tolerancia = Math.max(1, Math.abs(confirmado.importe) * 0.01);
        if (diferenciaImporte > tolerancia) return false;
        if (diasEntre(p.fecha, confirmado.fecha) > 5) return false;
        return true;
    });
}

// ── Formateo de números ──────────────────────────────────────────────────────

const FMT_UYU = new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: 'UYU',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
});

const FMT_USD = new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
});

export function formatearMonto(monto: number, moneda: 'UYU' | 'USD'): string {
    return moneda === 'USD' ? FMT_USD.format(monto) : FMT_UYU.format(monto);
}

export function formatearMes(mes: string): string {
    const { año, mes: m } = parsearMes(mes);
    const fecha = new Date(año, m - 1, 1);
    return fecha.toLocaleDateString('es-UY', { month: 'short', year: '2-digit' }).toUpperCase();
}
