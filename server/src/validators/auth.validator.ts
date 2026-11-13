import { z } from 'zod';

export const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]).{8,}$/;

export const signupSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, 'Business name must be at least 2 characters')
    .max(100, 'Business name cannot exceed 100 characters'),
  businessType: z.enum(['RESTAURANT', 'CAFE', 'BAR', 'OTHER'], {
    message: 'Please select a valid business type',
  }),
  address: z.string().trim().max(255).optional(),
  email: z
    .string()
    .trim()
    .email('Please enter a valid email address')
    .max(191, 'Email address is too long'),
  countryCode: z
    .string()
    .trim()
    .regex(/^\+[0-9]{1,4}$/, 'Invalid country code (e.g. +977, +1, +44)'),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^[0-9\s\-()]{6,16}$/, 'Please enter a valid phone number')
    .transform((val) => val.replace(/[^0-9]/g, '')),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/, 'Password must contain at least one special character'),
  confirmPassword: z.string().min(1, 'Confirm password is required'),
  termsAccepted: z.boolean().refine((val) => val === true, {
    message: 'You must accept the Terms of Service and Privacy Policy',
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export const verifyOtpSchema = z.object({
  email: z.string().trim().email('Invalid email address').optional().or(z.literal('')),
  phone_e164: z.string().trim().optional().or(z.literal('')),
  otp: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, 'Verification code must be exactly 6 digits'),
}).refine((data) => (data.email && data.email.length > 0) || (data.phone_e164 && data.phone_e164.length > 0), {
  message: 'Either email or phone number is required to verify OTP',
  path: ['email'],
});

export const resendOtpSchema = z.object({
  email: z.string().trim().email('Invalid email address').optional().or(z.literal('')),
  phone_e164: z.string().trim().optional().or(z.literal('')),
}).refine((data) => (data.email && data.email.length > 0) || (data.phone_e164 && data.phone_e164.length > 0), {
  message: 'Either email or phone number is required to resend OTP',
  path: ['email'],
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required'),
  rememberMe: z.boolean().optional(),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Please enter a valid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10, 'Invalid token'),
  email: z.string().trim().email('Valid email is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/, 'Password must contain at least one special character'),
  confirmPassword: z.string().min(1, 'Confirm password is required'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
