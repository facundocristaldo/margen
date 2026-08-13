import Dexie, { type EntityTable } from 'dexie';
import type {
    Cuenta,
    CicloTarjeta,
    Movimiento,
    PlanDeCuotas,
    CompromisoRecurrente,
    PerfilFinanciero,
    TipoCambio,
    GastoPlanificado,
    AporteAhorro,
    Categoria,
    ReglaClasificacion,
} from '@/types/domain';

export class MargenDB extends Dexie {
    cuentas!: EntityTable<Cuenta, 'id'>;
    ciclosTarjeta!: EntityTable<CicloTarjeta, 'id'>;
    movimientos!: EntityTable<Movimiento, 'id'>;
    planesDeCuotas!: EntityTable<PlanDeCuotas, 'id'>;
    compromisosRecurrentes!: EntityTable<CompromisoRecurrente, 'id'>;
    perfilFinanciero!: EntityTable<PerfilFinanciero, 'id'>;
    tiposDeCambio!: EntityTable<TipoCambio, 'id'>;
    gastosPlanificados!: EntityTable<GastoPlanificado, 'id'>;
    aportesAhorro!: EntityTable<AporteAhorro, 'id'>;
    categorias!: EntityTable<Categoria, 'id'>;
    reglasClasificacion!: EntityTable<ReglaClasificacion, 'id'>;

    constructor() {
        super('MargenDB');
        this.version(1).stores({
            cuentas: 'id, tipo, moneda',
            ciclosTarjeta: 'id, cuentaId',
            movimientos: 'id, cuentaId, fecha, clase, estado, categoriaId, planId, origen',
            planesDeCuotas: 'id, cuentaId, estado, primeraCuota',
            compromisosRecurrentes: 'id, tipo, frecuencia',
            perfilFinanciero: 'id',
            tiposDeCambio: 'id, fecha',
            gastosPlanificados: 'id, estado, prioridad',
            aportesAhorro: 'id, metaId, mes',
            categorias: 'id, padreId, colorSlot',
            reglasClasificacion: 'id, prioridad',
        });
    }
}

export const db = new MargenDB();
