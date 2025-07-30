import { Router } from 'express';
import { registerAdmin, loginAdmin } from '../controllers/auth.controller';
import { validateRequest } from '../middleware/validateRequest';
import { registerSchema, loginSchema } from '../validation/auth.schemas';

const router = Router();

// Route for registering a new administrator.
// The `validateRequest` middleware ensures the request body matches the `registerSchema`.
router.post(
  '/register',
  validateRequest(registerSchema), // Validate input first
  registerAdmin
);

// Route for an administrator to log in.
// The `validateRequest` middleware ensures the request body matches the `loginSchema`.
router.post(
  '/login',
  validateRequest(loginSchema), // Validate input first
  loginAdmin
);

export default router;
