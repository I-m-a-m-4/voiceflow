'use client';

import emailjs from '@emailjs/browser';

// --- For User Invitations & General Contact ---
export interface ContactEmailParams {
    to_email: string;
    to_name: string;
    business_name: string;
    inviter_name: string;
    invitation_link: string;
}

export const sendInvitationEmail = async (params: ContactEmailParams) => {
    const serviceId = process.env.NEXT_PUBLIC_EMAILJS_INVITE_SERVICE_ID;
    const templateId = process.env.NEXT_PUBLIC_EMAILJS_INVITE_TEMPLATE_ID;
    const publicKey = process.env.NEXT_PUBLIC_EMAILJS_INVITE_PUBLIC_KEY;

    if (!serviceId || !templateId || !publicKey) {
        const missing = [
            !serviceId && 'NEXT_PUBLIC_EMAILJS_INVITE_SERVICE_ID',
            !templateId && 'NEXT_PUBLIC_EMAILJS_INVITE_TEMPLATE_ID',
            !publicKey && 'NEXT_PUBLIC_EMAILJS_INVITE_PUBLIC_KEY'
        ].filter(Boolean).join(', ');
        const errorMessage = `EmailJS invitation service is not fully configured. Missing keys: ${missing}. Please check your .env file and restart the server.`;
        console.error(errorMessage);
        throw new Error(errorMessage);
    }

    try {
        const response = await emailjs.send(serviceId, templateId, params as any, publicKey);
        return response;
    } catch (error) {
        console.error('[EmailJS] Failed to send invitation email:', error);
        throw error;
    }
};

// --- For Marketing Contact Form ---
export const sendContactFormEmail = async (form: HTMLFormElement) => {
    const serviceId = process.env.NEXT_PUBLIC_EMAILJS_CONTACT_SERVICE_ID;
    const templateId = process.env.NEXT_PUBLIC_EMAILJS_CONTACT_TEMPLATE_ID; // Often same as invitation
    const publicKey = process.env.NEXT_PUBLIC_EMAILJS_CONTACT_PUBLIC_KEY;

    if (!serviceId || !templateId || !publicKey) {
        const missing = [
            !serviceId && 'NEXT_PUBLIC_EMAILJS_CONTACT_SERVICE_ID',
            !templateId && 'NEXT_PUBLIC_EMAILJS_CONTACT_TEMPLATE_ID',
            !publicKey && 'NEXT_PUBLIC_EMAILJS_CONTACT_PUBLIC_KEY'
        ].filter(Boolean).join(', ');
        const errorMessage = `EmailJS contact form service is not fully configured. Missing keys: ${missing}. Please check your .env file and restart the server.`;
        console.error(errorMessage);
        throw new Error(errorMessage);
    }

    return emailjs.sendForm(serviceId, templateId, form, publicKey);
}
