'use client';

import type { Alerta } from '@/lib/alertas';
import clsx from 'clsx';

const COLORES: Record<string, string> = {
    critica: 'bg-red-50 border-red-400 text-red-800 dark:bg-red-950 dark:border-red-600 dark:text-red-200',
    alta: 'bg-orange-50 border-orange-400 text-orange-800 dark:bg-orange-950 dark:border-orange-600 dark:text-orange-200',
    media: 'bg-yellow-50 border-yellow-400 text-yellow-800 dark:bg-yellow-950 dark:border-yellow-600 dark:text-yellow-200',
    info: 'bg-blue-50 border-blue-400 text-blue-800 dark:bg-blue-950 dark:border-blue-600 dark:text-blue-200',
};

const ICONOS: Record<string, string> = {
    critica: '⛔',
    alta: '⚠️',
    media: '◐',
    info: 'ℹ',
};

export function AlertaBanner({ alertas }: { alertas: Alerta[] }) {
    if (alertas.length === 0) return null;

    return (
        <div className="flex flex-col gap-2 px-4 pt-3">
            {alertas.map(a => (
                <div
                    key={a.id}
                    className={clsx('border rounded-lg px-3 py-2 text-sm flex gap-2 items-start', COLORES[a.severidad])}
                    role="alert"
                    aria-live={a.severidad === 'critica' ? 'assertive' : 'polite'}
                >
                    <span aria-hidden="true">{ICONOS[a.severidad]}</span>
                    <span>{a.mensaje}</span>
                </div>
            ))}
        </div>
    );
}
