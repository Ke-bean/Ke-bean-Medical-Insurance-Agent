import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/jwt';
import { UserRole } from '../constants';
import { RegisterInput, LoginInput } from '../validation/auth.schemas'; // We'll need to export these types

export const registerAdminUser = async (input: RegisterInput['body']) => {
  // 1. Check if user already exists
  const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
  if (existingUser) {
    throw new Error('User already exists');
  }

  // 2. Hash the password
  const hashedPassword = await bcrypt.hash(input.password, 12);

  // 3. Create the user with the ADMIN role
  const user = await prisma.user.create({
    data: {
      email: input.email,
      fullName: input.fullName,
      password: hashedPassword,
      role: UserRole.ADMIN, // Assign the ADMIN role
    },
  });

  // We don't return the password hash
  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
};

export const loginAdminUser = async (input: LoginInput['body']) => {
  // 1. Find user by email
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !user.password) {
    throw new Error('Invalid credentials');
  }

  // 2. Verify the password
  const isValidPassword = await bcrypt.compare(input.password, user.password);
  if (!isValidPassword) {
    throw new Error('Invalid credentials');
  }

  // 3. Check if the user is an admin
  if (user.role !== UserRole.ADMIN) {
    throw new Error('Access denied. Not an administrator.');
  }
  
  // 4. Generate a JWT
  const token = signToken({ id: user.id, role: user.role });

  // 5. Return the token
  return { token };
};
