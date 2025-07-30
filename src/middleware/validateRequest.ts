import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

export const validateRequest = (schema: AnyZodObject) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // REMOVED 'return' from the line below
        res.status(400).json({
          status: 'error',
          message: 'Invalid request data',
          errors: error.errors.map(e => ({ path: e.path, message: e.message })),
        });
      } else {
        // REMOVED 'return' from the line below
        res.status(500).json({
          status: 'error',
          message: 'Internal Server Error',
        });
      }
    }
  };
};
