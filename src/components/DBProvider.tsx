'use client';

import { useEffect, useState } from 'react';
import { sembrarDatosIniciales } from '@/lib/seed';

export function DBProvider({ children }: { children: React.ReactNode }) {
    const [listo, setListo] = useState(false);

    useEffect(() => {
        sembrarDatosIniciales().then(() => setListo(true));
    }, []);

    if (!listo) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="text-2xl font-bold tracking-tight mb-2">Margen</div>
                    <div className="text-sm" style={{ color: 'var(--muted)' }}>Cargando…</div>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
