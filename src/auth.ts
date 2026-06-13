/**
 * Autenticación: hash de contraseñas (bcrypt) y tokens de sesión (JWT).
 *
 * Identidad = número de WhatsApp. El JWT lleva { sub: phone }.
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { config, JWT_ISSUER, JWT_AUDIENCE } from './config.js';

const SALT_ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(phone: string): string {
  return jwt.sign({ sub: phone }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn,
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  } as jwt.SignOptions);
}

/** Extiende Request para llevar el número del usuario autenticado. */
export type AuthedRequest = Request & { userPhone?: string };

/**
 * Middleware: exige un Bearer token válido. Pone req.userPhone con el número.
 */
export function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }) as { sub?: string };
    if (!payload.sub) throw new Error('token sin sub');
    req.userPhone = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
