// ── Tipos base ──────────────────────────────────────────────────────────────

export type Moneda = 'UYU' | 'USD';

export interface Cuenta {
    id: string;
    nombre: string; // "Itaú Pesos" · "VISA 7028"
    tipo: 'corriente' | 'tarjeta';
    moneda: Moneda | 'multi'; // la tarjeta liquida en ambas
    cicloId?: string; // solo tarjetas
}

export interface CicloTarjeta {
    id: string;
    cuentaId: string;
    diaCierre: number;       // 27
    diaVencimiento: number;  // 7 del mes siguiente
    cuentaDebitoId: string;  // de dónde sale el pago
}

// ── Movimientos ─────────────────────────────────────────────────────────────

export type ClaseMovimiento =
    | 'gasto'      // consume margen
    | 'ingreso'    // facturación propia
    | 'traspaso'   // entre cuentas propias — neutro
    | 'pasamanos'  // dinero de terceros — neutro
    | 'devolucion' // REDIVA, reversas — reduce un gasto previo
    | 'impuesto'   // DGI, BPS, Patrimonio
    | 'deuda';     // cuota de préstamo

export interface Movimiento {
    id: string; // hash(cuentaId, fecha, conceptoRaw, importe, saldo)
    cuentaId: string;
    fecha: string; // ISO 8601 date "2026-08-13"
    conceptoRaw: string;
    comercio?: string;
    importe: number; // negativo = sale
    moneda: Moneda;
    clase: ClaseMovimiento;
    categoriaId?: string;
    planId?: string;
    cuotaNro?: number;
    revertidoPor?: string;
    origen: 'import' | 'manual';
    loteImportId?: string;
    estado: 'previsto' | 'confirmado' | 'absorbido';
    absorbidoPor?: string;
    noAnticipado?: boolean;
}

// ── Planes de cuotas ────────────────────────────────────────────────────────

export interface PlanDeCuotas {
    id: string;
    comercio: string;
    cuentaId: string;
    moneda: Moneda;
    importeCuota: number;
    cuotasTotal: number;
    primeraCuota: string; // "2026-08"
    categoriaId?: string;
    estado: 'activo' | 'cancelado' | 'finalizado';
}

// ── Compromisos recurrentes ──────────────────────────────────────────────────

export interface CompromisoRecurrente {
    id: string;
    nombre: string;
    tipo: 'prestamo' | 'impuesto' | 'seguro' | 'servicio' | 'suscripcion';
    importe: number;
    moneda: Moneda;
    frecuencia: 'mensual' | 'bimestral' | 'anual';
    diaDelMes: number;
    desde: string;
    hasta?: string; // los préstamos terminan
    esEstimado: boolean;
    modoEstimacion?: 'fijo' | 'mediaMovil' | 'estacional';
    historial?: { mes: string; real: number }[];
    factorEstacional?: Record<number, number>; // { 6:1.45, 7:1.50, 8:1.40 }
    banda?: { min: number; max: number };
}

// ── Perfil financiero ────────────────────────────────────────────────────────

export interface PerfilFinanciero {
    id: string; // siempre "perfil"
    ingresoNeto: number;       // 5200
    monedaIngreso: Moneda;
    tasaIva: number;           // 0.22
    diaFacturacion: number;
    monedaReferencia: Moneda;
    consumoDebitoEstimado: number;
    colchonObjetivo: number;   // reserva mínima intocable
}

// ── Tipo de cambio ───────────────────────────────────────────────────────────

export interface TipoCambio {
    id: string; // fecha ISO
    fecha: string;
    compra: number;
    venta: number;
    fuente: 'bcu' | 'manual' | 'derivado';
}

// ── Metas de gasto ───────────────────────────────────────────────────────────

export interface GastoPlanificado {
    id: string;
    nombre: string;
    montoObjetivo: number;
    moneda: Moneda;
    fechaObjetivo?: string; // "2026-12"
    prioridad: number;
    estrategia: 'ahorrar' | 'financiar' | 'comparar';
    ahorrado: number;
    categoriaId?: string;
    estado: 'activo' | 'cumplido' | 'pausado';
}

export interface AporteAhorro {
    id: string;
    metaId: string;
    mes: string; // "2026-10"
    montoPlan: number;
    montoReal?: number;
}

// ── Categorías ───────────────────────────────────────────────────────────────

export interface Categoria {
    id: string;
    nombre: string;
    padreId?: string;
    colorSlot: number; // 1-6 fijo
    icono: string;
    esEsencial: boolean;
    ordenFrecuencia: number;
}

// ── Regla de clasificación ───────────────────────────────────────────────────

export interface ReglaClasificacion {
    id: string;
    patron: string; // regex
    clase: ClaseMovimiento;
    categoriaId?: string;
    comercio?: string;
    prioridad: number;
}

// ── Mes proyectado (calculado, no persistido) ────────────────────────────────

export interface MesProyectado {
    mes: string; // "2026-09"
    techo: number;
    comprometido: number;
    disponible: number;
    cuotasDetalle: { planId: string; comercio: string; cuotaNro: number; cuotasTotal: number; importe: number }[];
    compromisoDetalle: { nombre: string; importe: number }[];
    liberaciones: { nombre: string; importe: number }[];
}
