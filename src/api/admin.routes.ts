import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { UserRole } from '../constants'; // We will create this file next
import {
  getDashboardStats,
  getAllUsers,
  getUserDetails,
} from '../controllers/admin.controller'; // We will create this controller next

const router = Router();

/**
 * These routes are protected and can only be accessed by authenticated users
 * with the 'ADMIN' role. The requireAuth middleware enforces this.
 */

// A route to get high-level statistics for a dashboard.
router.get(
  '/dashboard-stats',
  requireAuth(UserRole.ADMIN), // Protect: Only Admins can access
  getDashboardStats
);

// A route to get a list of all users in the system.
router.get(
  '/users',
  requireAuth(UserRole.ADMIN), // Protect: Only Admins can access
  getAllUsers
);

// A route to get the full details of a single user, including their conversation history.
router.get(
  '/users/:userId',
  requireAuth(UserRole.ADMIN), // Protect: Only Admins can access
  getUserDetails
);

export default router;
