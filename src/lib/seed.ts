import { db } from './db';
import type { Categoria, ReglaClasificacion } from '@/types/domain';

export const CATEGORIAS_SEMILLA: Categoria[] = [
    { id: 'supermercado', nombre: 'Supermercado', colorSlot: 1, icono: '🛒', esEsencial: true, ordenFrecuencia: 1 },
    { id: 'comida', nombre: 'Comida fuera', colorSlot: 2, icono: '🍔', esEsencial: false, ordenFrecuencia: 2 },
    { id: 'obra', nombre: 'Obra y hogar', colorSlot: 3, icono: '🔧', esEsencial: false, ordenFrecuencia: 3 },
    { id: 'transporte', nombre: 'Transporte', colorSlot: 4, icono: '⛽', esEsencial: true, ordenFrecuencia: 4 },
    { id: 'ropa', nombre: 'Ropa', colorSlot: 5, icono: '👕', esEsencial: false, ordenFrecuencia: 5 },
    { id: 'salud', nombre: 'Salud', colorSlot: 6, icono: '💊', esEsencial: true, ordenFrecuencia: 6 },
    { id: 'seguros', nombre: 'Seguros', colorSlot: 1, icono: '🛡️', esEsencial: true, ordenFrecuencia: 7 },
    { id: 'servicios', nombre: 'Servicios', colorSlot: 2, icono: '💡', esEsencial: true, ordenFrecuencia: 8 },
    { id: 'suscripciones', nombre: 'Suscripciones', colorSlot: 3, icono: '📱', esEsencial: false, ordenFrecuencia: 9 },
    { id: 'impuestos', nombre: 'Impuestos', colorSlot: 4, icono: '🏛️', esEsencial: true, ordenFrecuencia: 10 },
    { id: 'deuda', nombre: 'Deuda', colorSlot: 5, icono: '🏦', esEsencial: true, ordenFrecuencia: 11 },
    { id: 'viajes', nombre: 'Viajes', colorSlot: 6, icono: '✈️', esEsencial: false, ordenFrecuencia: 12 },
    { id: 'online', nombre: 'Compras online', colorSlot: 1, icono: '📦', esEsencial: false, ordenFrecuencia: 13 },
    { id: 'efectivo', nombre: 'Efectivo', colorSlot: 2, icono: '💵', esEsencial: false, ordenFrecuencia: 14 },
];

export const REGLAS_SEMILLA: ReglaClasificacion[] = [
    { id: 'r1', patron: '^COMPRA', clase: 'gasto', categoriaId: undefined, comercio: undefined, prioridad: 10 },
    { id: 'r2', patron: '^REDIVA \\d+', clase: 'devolucion', categoriaId: undefined, comercio: undefined, prioridad: 20 },
    { id: 'r3', patron: '^TRASPASO (A|DE) \\d+', clase: 'traspaso', categoriaId: undefined, comercio: undefined, prioridad: 20 },
    { id: 'r4', patron: '^(DEB|CRE)\\. CAMBIOS', clase: 'pasamanos', categoriaId: undefined, comercio: undefined, prioridad: 20 },
    { id: 'r5', patron: '^DEB\\. CAMBIOSCOM\\.', clase: 'gasto', categoriaId: undefined, comercio: undefined, prioridad: 25 },
    { id: 'r6', patron: '^RETIRO', clase: 'gasto', categoriaId: 'efectivo', comercio: undefined, prioridad: 20 },
    { id: 'r7', patron: '^DEB\\. VARIOS VISA', clase: 'traspaso', categoriaId: undefined, comercio: undefined, prioridad: 20 },
    { id: 'r8', patron: '^DEB\\. VARIOS PAGO D\\.G\\.I\\.', clase: 'impuesto', categoriaId: 'impuestos', comercio: 'DGI', prioridad: 20 },
    { id: 'r9', patron: 'MERPAGO\\*(.+)', clase: 'gasto', categoriaId: 'online', comercio: undefined, prioridad: 15 },
    { id: 'r10', patron: 'SEGURO DE VIDA SOBRE SALDO', clase: 'gasto', categoriaId: 'seguros', comercio: 'Seguro Vida', prioridad: 15 },
    { id: 'r11', patron: 'UTE', clase: 'gasto', categoriaId: 'servicios', comercio: 'UTE', prioridad: 15 },
    { id: 'r12', patron: 'ANTEL', clase: 'gasto', categoriaId: 'servicios', comercio: 'ANTEL', prioridad: 15 },
    { id: 'r13', patron: 'SCOTIABANK|HSBC', clase: 'deuda', categoriaId: 'deuda', comercio: undefined, prioridad: 15 },
    { id: 'r14', patron: 'BPS', clase: 'impuesto', categoriaId: 'impuestos', comercio: 'BPS', prioridad: 15 },
];

// Mapa comercio → categoría para autocompletar captura
export const COMERCIOS_SEMILLA: Record<string, string> = {
    'Red Market': 'supermercado',
    'Supermercado Tres': 'supermercado',
    "McDonald's": 'comida',
    'Gustavo Mach': 'comida',
    'Alexandra': 'comida',
    'Ferretería LHC': 'obra',
    'Total Import': 'obra',
    'Santino Home': 'obra',
    'Tornillería': 'obra',
    'Pinturería': 'obra',
    'Cerámicas Castro': 'obra',
    'IDEC': 'obra',
    'Servicentro': 'transporte',
    'Cartoons': 'ropa',
    'Only Jack': 'ropa',
    'Óptica': 'salud',
    'SURA': 'seguros',
    'UTE': 'servicios',
    'ANTEL': 'servicios',
    'Apple': 'suscripciones',
    'Spotify': 'suscripciones',
    'Netflix': 'suscripciones',
    'GitHub': 'suscripciones',
    'Vercel': 'suscripciones',
    'DGI': 'impuestos',
    'BPS': 'impuestos',
    'Scotiabank': 'deuda',
    'HSBC': 'deuda',
    'Funtour': 'viajes',
    'Mercado Libre': 'online',
    'MercadoPago': 'online',
};

export async function sembrarDatosIniciales() {
    const cuentasCount = await db.cuentas.count();
    const categoriasCount = await db.categorias.count();
    // Re-sembrar categorías si la migración v1→v2 las dejó sin índice
    if (cuentasCount > 0 && categoriasCount > 0) return;

    await db.transaction('rw', [db.categorias, db.reglasClasificacion, db.cuentas, db.ciclosTarjeta, db.perfilFinanciero], async () => {
        await db.categorias.bulkPut(CATEGORIAS_SEMILLA);
        await db.reglasClasificacion.bulkPut(REGLAS_SEMILLA);

        // Cuentas de ejemplo vacías — el usuario las puede editar en Ajustes
        await db.cuentas.bulkPut([
            { id: 'cuenta-pesos', nombre: 'Cuenta Pesos', tipo: 'corriente', moneda: 'UYU' },
            { id: 'cuenta-dolares', nombre: 'Cuenta Dólares', tipo: 'corriente', moneda: 'USD' },
            { id: 'tarjeta-visa', nombre: 'VISA', tipo: 'tarjeta', moneda: 'multi', cicloId: 'ciclo-visa' },
        ]);

        await db.ciclosTarjeta.put({
            id: 'ciclo-visa',
            cuentaId: 'tarjeta-visa',
            diaCierre: 27,
            diaVencimiento: 7,
            cuentaDebitoId: 'cuenta-dolares',
        });

        // Perfil financiero vacío — usuario completa en onboarding
        const perfilExistente = await db.perfilFinanciero.get('perfil');
        if (!perfilExistente) {
            await db.perfilFinanciero.put({
                id: 'perfil',
                ingresoNeto: 0,
                monedaIngreso: 'USD',
                tasaIva: 0.22,
                diaFacturacion: 1,
                monedaReferencia: 'USD',
                consumoDebitoEstimado: 0,
                colchonObjetivo: 400,
            });
        }
    });
}
