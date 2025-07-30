import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { UserRole } from '../constants';

// We'll add the user object to the Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: UserRole;
      };
    }
  }
}

export const requireAuth = (requiredRole: UserRole) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // REMOVED 'return'
      res.status(401).json({ message: 'Unauthorized: No token provided' });
      return; // Use a bare return to exit the function
    }
    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, config.JWT_SECRET!) as { id: string };
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, role: true },
      });

      if (!user) {
        // REMOVED 'return'
        res.status(401).json({ message: 'Unauthorized: User not found' });
        return; // Use a bare return
      }

      if (user.role !== requiredRole) {
        // REMOVED 'return'
        res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
        return; // Use a bare return
      }

      req.user = user;
      next();
    } catch (error) {
      // REMOVED 'return'
      res.status(401).json({ message: 'Unauthorized: Invalid token' });
    }
  };
};