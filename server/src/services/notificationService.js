import nodemailer from 'nodemailer';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';
import { Notification } from '../models/index.js';
import path from 'path';
import fs from 'fs/promises';
import { Resend } from 'resend';
import { toObjectIdOrNull } from '../utils/mongo.js';

export class NotificationService {
  static transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    auth: {
      user: config.smtp.auth.user,
      pass: config.smtp.auth.pass,
    },
  });

  static async sendEmail(params) {
    // Save notification record to DB
    const dbNotification = await Notification.create({
      userId: toObjectIdOrNull(params.userId),
      email: params.email,
      subject: params.subject,
      body: params.body,
      type: params.type,
      status: 'PENDING',
    });

    try {
      logger.info(`[Notification] Preparing ${params.type} email for ${params.email}`);
      let attachments = [];
      if (params.attachmentPath) {
        attachments.push({
          filename: params.attachmentFilename || path.basename(params.attachmentPath),
          path: params.attachmentPath,
          contentType: params.attachmentContentType || 'application/pdf',
        });
      }

      if (params.pdfUrl) {
        const filename = path.basename(new URL(params.pdfUrl).pathname) || 'certificate.pdf';
        attachments.push({
          filename: `Medical_Certificate_${filename}`,
          path: params.pdfUrl,
        });
      }

      // Check for Resend API Key
      if (config.resendApiKey) {
        const resend = new Resend(config.resendApiKey);
        const resendAttachments = await Promise.all(attachments.map(async (att) => {
          if (att.path && !/^https?:\/\//i.test(att.path)) {
            return {
              filename: att.filename,
              content: await fs.readFile(att.path),
              contentType: att.contentType,
            };
          }

          return {
            filename: att.filename,
            path: att.path,
            contentType: att.contentType,
          };
        }));

        const sendResult = await resend.emails.send({
          from: config.smtp.from,
          to: params.email,
          subject: params.subject,
          html: params.body,
          attachments: resendAttachments,
        });

        if (sendResult?.error) {
          throw new Error(`Resend email failed: ${JSON.stringify(sendResult.error)}`);
        }

        await Notification.findByIdAndUpdate(dbNotification.id, { status: 'SENT', sentAt: new Date() });
        logger.info(`Email successfully sent via Resend to ${params.email} [${params.type}]`);
        return { success: true, provider: 'resend', id: sendResult?.data?.id || null };
      } else if (config.smtp.auth.user && config.smtp.auth.pass) {
        // Fallback to SMTP
        await this.transporter.sendMail({
          from: config.smtp.from,
          to: params.email,
          subject: params.subject,
          html: params.body,
          attachments: attachments,
        });
        
        await Notification.findByIdAndUpdate(dbNotification.id, { status: 'SENT', sentAt: new Date() });
        logger.info(`Email successfully sent via SMTP to ${params.email} [${params.type}]`);
        return { success: true, provider: 'smtp', id: null };
      } else {
        let attachmentInfo = '';
        if (attachments.length > 0) {
          attachmentInfo = `\nAttachment: ${attachments[0].filename} (Path: ${attachments[0].path})`;
        }
        logger.warn(`Resend or SMTP credentials not configured. Simulation email logged:\nTo: ${params.email}\nSubject: ${params.subject}${attachmentInfo}\nBody: ${params.body.substring(0, 300)}...`);
        await Notification.findByIdAndUpdate(dbNotification.id, { status: 'SENT', sentAt: new Date() });
        return { success: true, provider: 'simulation', id: null };
      }
    } catch (error) {
      logger.error('========== NOTIFICATION ERROR ==========');
      logger.error(`Message: ${error?.message}`);
      logger.error(`Status: ${error?.response?.status || error?.statusCode || 'N/A'}`);
      logger.error(`Data: ${error?.response?.data ? JSON.stringify(error.response.data) : 'N/A'}`);
      logger.error(error?.stack || error);
      logger.error(`Failed to send email to ${params.email}:`, error);
      await Notification.findByIdAndUpdate(dbNotification.id, { status: 'FAILED' });
      return { success: false, provider: null, error };
    }
  }

  static getCertificateCreatedTemplate(
    clinicName,
    patientName,
    certNo,
    validity,
    verifyUrl
  ) {
    return `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <div style="text-align: center; border-bottom: 2px solid #0F6FFF; padding-bottom: 20px; margin-bottom: 20px;">
          <h2 style="color: #0F6FFF; margin: 0;">${clinicName}</h2>
          <p style="color: #64748b; font-size: 14px; margin: 5px 0 0 0;">Medical Document Notification</p>
        </div>
        <div style="color: #334155; line-height: 1.6;">
          <p>Dear <strong>${patientName}</strong>,</p>
          <p>Your medical certificate has been successfully issued by ${clinicName}.</p>
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Certificate Number:</strong> ${certNo}</p>
            <p style="margin: 0;"><strong>Validity Period:</strong> ${validity}</p>
          </div>
          <p>To verify the authenticity of this certificate, please click the link below or scan the printed QR code:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verifyUrl}" style="background-color: #0F6FFF; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Verify Certificate</a>
          </div>
          <p style="color: #64748b; font-size: 12px;">If you did not request this certificate, please contact the clinic immediately.</p>
        </div>
        <div style="text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px; color: #94a3b8; font-size: 12px;">
          <p>© 2026 HealthVerify SaaS. All rights reserved.</p>
        </div>
      </div>
    `;
  }

  static getCertificateRevokedTemplate(
    clinicName,
    patientName,
    certNo,
    reason
  ) {
    return `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <div style="text-align: center; border-bottom: 2px solid #DC2626; padding-bottom: 20px; margin-bottom: 20px;">
          <h2 style="color: #DC2626; margin: 0;">Certificate Revocation Alert</h2>
          <p style="color: #64748b; font-size: 14px; margin: 5px 0 0 0;">${clinicName}</p>
        </div>
        <div style="color: #334155; line-height: 1.6;">
          <p>Dear <strong>${patientName}</strong>,</p>
          <p>Please be informed that the medical certificate listed below has been <strong>REVOKED</strong> by the clinic.</p>
          <div style="background-color: #fef2f2; border-left: 4px solid #DC2626; padding: 15px; border-radius: 0 6px 6px 0; margin: 20px 0;">
            <p style="margin: 0 0 10px 0; color: #991b1b;"><strong>Certificate Number:</strong> ${certNo}</p>
            <p style="margin: 0; color: #991b1b;"><strong>Reason for Revocation:</strong> ${reason}</p>
          </div>
          <p>This certificate is no longer valid for verification. Any validation attempts will show a "Revoked" status.</p>
        </div>
        <div style="text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px; color: #94a3b8; font-size: 12px;">
          <p>© 2026 HealthVerify SaaS. All rights reserved.</p>
        </div>
      </div>
    `;
  }

  static getUserInvitationTemplate(
    clinicName,
    name,
    role,
    loginUrl
  ) {
    return `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <div style="text-align: center; border-bottom: 2px solid #00C896; padding-bottom: 20px; margin-bottom: 20px;">
          <h2 style="color: #00C896; margin: 0;">Welcome to HealthVerify</h2>
          <p style="color: #64748b; font-size: 14px; margin: 5px 0 0 0;">Invited to join ${clinicName}</p>
        </div>
        <div style="color: #334155; line-height: 1.6;">
          <p>Hi <strong>${name}</strong>,</p>
          <p>You have been invited to join the clinic team at <strong>${clinicName}</strong> as a <strong>${role}</strong>.</p>
          <p>Click the button below to complete your setup and sign in to your dashboard:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}" style="background-color: #00C896; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Accept Invitation & Sign In</a>
          </div>
          <p style="color: #64748b; font-size: 12px;">If you didn't expect this invite, please ignore this email.</p>
        </div>
        <div style="text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px; color: #94a3b8; font-size: 12px;">
          <p>© 2026 HealthVerify SaaS. All rights reserved.</p>
        </div>
      </div>
    `;
  }

  static getPasswordResetTemplate(name, resetUrl) {
    return `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <div style="text-align: center; border-bottom: 2px solid #F59E0B; padding-bottom: 20px; margin-bottom: 20px;">
          <h2 style="color: #F59E0B; margin: 0;">Password Reset Request</h2>
        </div>
        <div style="color: #334155; line-height: 1.6;">
          <p>Hi <strong>${name}</strong>,</p>
          <p>We received a request to reset the password for your HealthVerify account. Click the button below to choose a new one:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #F59E0B; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
          </div>
          <p>This link will expire in 1 hour. If you did not make this request, you can safely ignore this email.</p>
        </div>
        <div style="text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 30px; color: #94a3b8; font-size: 12px;">
          <p>© 2026 HealthVerify SaaS. All rights reserved.</p>
        </div>
      </div>
    `;
  }
}

export default NotificationService;
