import type { PerfilFinanciero, Movimiento } from '@/types/domain';

export type SeveridadAlerta = 'critica' | 'alta' | 'media' | 'info';

export interface Alerta {
    id: string;
    codigo: 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7';
    severidad: SeveridadAlerta;
    mensaje: string;
    cierraFalla: string;
}

export interface InputAlertas {
    perfil: PerfilFinanciero;
    saldoLiquido: number;
    reservaFiscal: number;
    consumoCiclo: number;
    techo: number;
    colchon: number;
    vencimientoTarjeta?: { fecha: string; monto: number; diasRestantes: number };
    movimientosSinRevisar: number;
    planesQueTerminan: { nombre: string; importe: number }[];
}

export function evaluarAlertas(input: InputAlertas): Alerta[] {
    const alertas: Alerta[] = [];
    const {
        saldoLiquido,
        reservaFiscal,
        consumoCiclo,
        techo,
        colchon,
        vencimientoTarjeta,
        movimientosSinRevisar,
        planesQueTerminan,
    } = input;

    // A1 — IVA en riesgo
    if (saldoLiquido < reservaFiscal) {
        const faltante = Math.ceil(reservaFiscal - saldoLiquido);
        alertas.push({
            id: 'a1',
            codigo: 'A1',
            severidad: 'critica',
            mensaje: `Estás usando el IVA. Faltan USD ${faltante} para cubrir DGI.`,
            cierraFalla: 'F2',
        });
    }

    // A2 — Pasó el techo
    if (consumoCiclo > techo) {
        const exceso = Math.ceil(consumoCiclo - techo);
        alertas.push({
            id: 'a2',
            codigo: 'A2',
            severidad: 'alta',
            mensaje: `Pasaste el techo del ciclo por USD ${exceso}.`,
            cierraFalla: 'F3',
        });
    } else if (techo > 0 && consumoCiclo > techo * 0.8) {
        // A3 — Más del 80%
        const restante = Math.ceil(techo - consumoCiclo);
        alertas.push({
            id: 'a3',
            codigo: 'A3',
            severidad: 'media',
            mensaje: `Te quedan USD ${restante} hasta el cierre del ciclo.`,
            cierraFalla: 'F3',
        });
    }

    // A5 — Vencimiento próximo sin fondos suficientes
    if (vencimientoTarjeta && vencimientoTarjeta.diasRestantes <= 3 && saldoLiquido < vencimientoTarjeta.monto) {
        alertas.push({
            id: 'a5',
            codigo: 'A5',
            severidad: 'alta',
            mensaje: `VISA se debita el ${vencimientoTarjeta.fecha} por USD ${Math.ceil(vencimientoTarjeta.monto)}. Tenés USD ${Math.floor(saldoLiquido)}.`,
            cierraFalla: 'F5',
        });
    }

    // A6 — Plan que termina
    for (const plan of planesQueTerminan) {
        alertas.push({
            id: `a6-${plan.nombre}`,
            codigo: 'A6',
            severidad: 'info',
            mensaje: `Desde el próximo mes se liberan $${Math.ceil(plan.importe)}/mes (${plan.nombre}).`,
            cierraFalla: 'F1',
        });
    }

    // A7 — Movimientos sin revisar
    if (movimientosSinRevisar > 10) {
        alertas.push({
            id: 'a7',
            codigo: 'A7',
            severidad: 'info',
            mensaje: `Hay ${movimientosSinRevisar} movimientos sin clasificar. Tus números están incompletos.`,
            cierraFalla: 'F6',
        });
    }

    return alertas;
}
