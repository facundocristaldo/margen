'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const LINKS = [
    { href: '/', label: 'Hoy', icon: '◉' },
    { href: '/horizonte', label: 'Horizonte', icon: '▦' },
    { href: '/captura', label: 'Captura', icon: '+' },
    { href: '/plan', label: 'Plan', icon: '◎' },
    { href: '/dashboard', label: 'Análisis', icon: '▤' },
];

export function BottomNav() {
    const pathname = usePathname();

    return (
        <nav
            className="fixed bottom-0 left-0 right-0 nav-bottom z-50"
            style={{ background: 'var(--background)', borderTop: '1px solid var(--border)' }}
        >
            <div className="flex items-stretch justify-around max-w-lg mx-auto">
                {LINKS.map(link => {
                    const activo = pathname === link.href;
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={clsx(
                                'flex flex-col items-center justify-center gap-0.5 py-2 flex-1 min-h-[56px] text-xs transition-colors',
                                activo
                                    ? 'font-semibold'
                                    : 'opacity-50'
                            )}
                            style={activo ? { color: 'var(--foreground)' } : {}}
                        >
                            {link.href === '/captura' ? (
                                <span
                                    className="w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold"
                                    style={{
                                        background: activo ? 'var(--foreground)' : 'var(--surface)',
                                        color: activo ? 'var(--background)' : 'var(--foreground)',
                                        border: '1px solid var(--border)',
                                    }}
                                >
                                    +
                                </span>
                            ) : (
                                <>
                                    <span className="text-lg leading-none">{link.icon}</span>
                                    <span>{link.label}</span>
                                </>
                            )}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
