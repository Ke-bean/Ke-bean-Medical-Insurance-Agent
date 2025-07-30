// src/controllers/auth.controller.ts

import { Request, Response } from 'express';
import { registerAdminUser, loginAdminUser } from '../services/auth.service';

export const registerAdmin = async (req: Request, res: Response) => {
  try {
    const { email, password, fullName } = req.body;
    const result = await registerAdminUser({ email, password, fullName });
    res.status(201).json(result);
  } catch (error: any) {
    if (error.message === 'User already exists') {
      // REMOVED 'return'
      res.status(409).json({ message: error.message });
      return; // Added bare return
    }
    res.status(500).json({ message: 'Error registering user' });
  }
};

export const loginAdmin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await loginAdminUser({ email, password });
    res.status(200).json(result);
  } catch (error: any) {
    res.status(401).json({ message: error.message || 'Invalid credentials' });
  }
};
























// import { Request, Response } from 'express';
// import { registerAdminUser, loginAdminUser } from '../services/auth.service';

// export const registerAdmin = async (req: Request, res: Response) => {
//   try {
//     const { email, password, fullName } = req.body;
//     const result = await registerAdminUser({ email, password, fullName });
//     res.status(201).json(result);
//   } catch (error: any) {
//     // Check for a specific error message from the service
//     if (error.message === 'User already exists') {
//       return res.status(409).json({ message: error.message });
//     }
//     res.status(500).json({ message: 'Error registering user' });
//   }
// };

// export const loginAdmin = async (req: Request, res: Response) => {
//   try {
//     const { email, password } = req.body;
//     const result = await loginAdminUser({ email, password });
//     res.status(200).json(result);
//   } catch (error: any) {
//     res.status(401).json({ message: error.message || 'Invalid credentials' });
//   }
// };
