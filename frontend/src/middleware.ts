import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'super-secret-key',
);

// Rutas que no requieren autenticación
const PUBLIC_PATHS = ['/login'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('auth_token')?.value;
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // ─── Sin token ──────────────────────────────────────────────
  if (!token) {
    // Si intenta acceder a ruta protegida → redirigir a login
    if (!isPublicPath) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // ─── Con token → validar ────────────────────────────────────
  try {
    await jwtVerify(token, JWT_SECRET);

    // Token válido + está en /login → redirigir al dashboard
    if (isPublicPath) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }

    return NextResponse.next();
  } catch {
    // Token inválido o expirado → limpiar cookie y redirigir
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.delete('auth_token');
    return response;
  }
}

// ─── Matcher ──────────────────────────────────────────────────
// Protege TODAS las rutas de la app excepto assets estáticos y API routes.
export const config = {
  matcher: [
    '/login',
    '/dashboard/:path*',
    '/pagos/:path*',
    '/cursos/:path*',
    '/alumnos/:path*',
    '/apoderados/:path*',
    '/reportes/:path*',
    '/',
  ],
};
