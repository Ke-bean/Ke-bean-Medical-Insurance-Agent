// src/types/express.d.ts

// This declaration file allows us to add custom properties to the Express Request object.
declare namespace Express {
  export interface Request {
    rawBody?: string;
  }
}