import jwt from 'jsonwebtoken';
import { config } from '../config';

interface UserPayload {
  id: string;
  role: string;
}

export const signToken = (payload: UserPayload): string => {
  return jwt.sign(payload, config.JWT_SECRET!, { expiresIn: '1d' }); // Token expires in 1 day
};
