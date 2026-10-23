import { Router, Request, Response } from 'express';
import { emailService } from '../services/email.service';
import { db } from '../services/db.service';
import { contactLimiter } from '../middleware/rateLimit.middleware';

const router = Router();

// Apply contact & enquiry rate limiting
router.use(contactLimiter);

/**
 * POST /api/contact/demo
 * Handles "Book Demo" submissions and routes details directly to info@namasteqr.com
 */
router.post('/demo', async (req: Request, res: Response) => {
  try {
    const { name, businessName, email, phone, location, queries } = req.body;

    if (!name || !businessName || !email || !phone || !location) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please provide all required fields: Your Name, Business Name, Email, Phone, and Location.',
        },
      });
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(email).trim())) {
      return res.status(400).json({
        error: {
          code: 'INVALID_EMAIL',
          message: 'Please provide a valid email address.',
        },
      });
    }

    const demoPayload = {
      id: `demo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: String(name).trim(),
      businessName: String(businessName).trim(),
      email: String(email).trim().toLowerCase(),
      phone: String(phone).trim(),
      location: String(location).trim(),
      queries: queries ? String(queries).trim() : '',
      createdAt: new Date().toISOString(),
      status: 'PENDING',
      routedTo: 'info@namasteqr.com',
    };

    // 1. Record demo booking in database store
    db.saveDemoBooking(demoPayload);

    // 2. Dispatch email notification to info@namasteqr.com
    const emailResult = await emailService.sendDemoBookingNotification(demoPayload);

    return res.status(200).json({
      success: true,
      message: 'Demo request successfully booked and routed to info@namasteqr.com',
      demoId: demoPayload.id,
      emailDispatched: emailResult.success,
    });
  } catch (error: any) {
    console.error('❌ [DEMO BOOKING ERROR]:', error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to process demo booking. Please try again or email info@namasteqr.com directly.',
      },
    });
  }
});

/**
 * POST /api/contact/enquiry
 * Handles "Send Enquiry" submissions and routes details directly to info@namasteqr.com
 */
router.post('/enquiry', async (req: Request, res: Response) => {
  try {
    const { name, email, message, phone } = req.body;

    if (!email || !message) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Email address and message are required.',
        },
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(email).trim())) {
      return res.status(400).json({
        error: {
          code: 'INVALID_EMAIL',
          message: 'Please provide a valid email address.',
        },
      });
    }

    const enquiryPayload = {
      id: `enquiry_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: name ? String(name).trim() : 'Prospective Customer',
      email: String(email).trim().toLowerCase(),
      message: String(message).trim(),
      phone: phone ? String(phone).trim() : '',
      createdAt: new Date().toISOString(),
      routedTo: 'info@namasteqr.com',
    };

    // 1. Record enquiry in database store
    db.saveContactEnquiry(enquiryPayload);

    // 2. Dispatch email notification to info@namasteqr.com
    const emailResult = await emailService.sendContactEnquiryNotification(enquiryPayload);

    return res.status(200).json({
      success: true,
      message: 'Enquiry successfully submitted and routed to info@namasteqr.com',
      enquiryId: enquiryPayload.id,
      emailDispatched: emailResult.success,
    });
  } catch (error: any) {
    console.error('❌ [ENQUIRY ERROR]:', error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to send enquiry. Please try again or email info@namasteqr.com directly.',
      },
    });
  }
});

export default router;
