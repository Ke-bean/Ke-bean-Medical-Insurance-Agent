// src/controllers/admin.controller.ts

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const userCount = await prisma.user.count();
    const quoteCount = await prisma.quote.count();
    res.status(200).json({ userCount, quoteCount });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching dashboard stats' });
  }
};

export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, fullName: true, email: true, role: true, createdAt: true },
    });
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users' });
  }
};

export const getUserDetails = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        quotes: true,
        documents: true,
        conversation: true,
      },
    });

    if (!user) {
      // REMOVED 'return'
      res.status(404).json({ message: 'User not found' });
      return; // Added bare return
    }

    const { password, ...userWithoutPassword } = user;
    res.status(200).json(userWithoutPassword);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user details' });
  }
};


















// import { Request, Response } from 'express';
// import { prisma } from '../lib/prisma';

// export const getDashboardStats = async (req: Request, res: Response) => {
//   try {
//     const userCount = await prisma.user.count();
//     const quoteCount = await prisma.quote.count();
//     // Add more stats as needed
//     res.status(200).json({ userCount, quoteCount });
//   } catch (error) {
//     res.status(500).json({ message: 'Error fetching dashboard stats' });
//   }
// };

// export const getAllUsers = async (req: Request, res: Response) => {
//   try {
//     const users = await prisma.user.findMany({
//       select: { id: true, fullName: true, email: true, role: true, createdAt: true },
//     });
//     res.status(200).json(users);
//   } catch (error) {
//     res.status(500).json({ message: 'Error fetching users' });
//   }
// };

// export const getUserDetails = async (req: Request, res: Response) => {
//   try {
//     const { userId } = req.params;
//     const user = await prisma.user.findUnique({
//       where: { id: userId },
//       include: {
//         quotes: true,
//         documents: true,
//         conversation: true,
//       },
//     });

//     if (!user) {
//       return res.status(404).json({ message: 'User not found' });
//     }

//     // Omit password before sending
//     const { password, ...userWithoutPassword } = user;
//     res.status(200).json(userWithoutPassword);
//   } catch (error) {
//     res.status(500).json({ message: 'Error fetching user details' });
//   }
// };
