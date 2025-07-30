// src/lib/prisma.ts

import { PrismaClient } from '@prisma/client';

/**
 * PrismaClient is re-exported from this module.
 * This is the standard way to use Prisma in a project.
 * It ensures that you are only using one instance of PrismaClient across your entire application.
 *
 * Why is this important?
 * 1. Connection Pooling: Each PrismaClient instance manages a pool of database connections.
 *    Creating a new client for every database request would be inefficient and could quickly
 *    exhaust the database connection limit.
 * 2. Performance: Reusing a single client instance is much more performant.
 * 3. Consistency: It provides a single, consistent point of access to the database.
 *
 * We declare it as a global to avoid re-initialization during hot-reloads in development.
 */

// Add prisma to the NodeJS global type
declare global {
  var prisma: PrismaClient | undefined;
}

// Instantiate a single instance of PrismaClient and export it.
// If 'global.prisma' already exists (in development with hot-reloading), use it.
// Otherwise, create a new one.
export const prisma = global.prisma || new PrismaClient({
    // Optional: You can add logging to see the queries Prisma is running.
    // This is very useful for debugging during development.
    // log: ['query', 'info', 'warn', 'error'],
});

// In a development environment, assign the prisma instance to the global object.
// This prevents multiple instances of PrismaClient from being created when
// Next.js (or a similar framework with hot-reloading) reloads modules.
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}