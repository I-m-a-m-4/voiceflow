export type UserRole = 'admin' | 'manager' | 'member';

export interface UserProfile {
    onboardingStep?: number;
    id: string;
    businessId: string;
    currentBusinessId?: string;
    name: string;
    email: string;
    phone?: string;
    role: UserRole;
    createdAt?: any;
    surveyCompleted?: boolean;
    status?: 'active' | 'inactive' | 'suspended' | 'deleted';
    suspendedAt?: any;
    suspendedBy?: string;
    lastSeen?: any;
    permissions?: Record<string, boolean>;
    platformsUsed?: string[];
    totalUsageSeconds?: number;
    pagesVisited?: number;
    pageViews?: Record<string, number>;
    featureUsage?: Record<string, number>;
    pageDwell?: Record<string, { ms: number; n: number }>;
    pagePerf?: Record<string, { ms: number; n: number }>;
    lastPage?: string;
    appVersion?: string;
    deviceType?: string;
    country?: string;
    ip?: string;
    userAgent?: string;
    language?: string;
    invitationCode?: string;
    authProvider?: 'google' | 'email';
    branchId?: string;
    marketingOptOut?: boolean;
    marketingOptOutAt?: any;
    lifecycleNotifications?: Record<string, any>;
}

// --- AI Meeting & Check-in Data Models ---

export interface Meeting {
    id: string;
    businessId: string;
    title: string;
    date: any; // Timestamp or ISO string
    durationMinutes?: number;
    participants: string[];
    summary?: string;
    actionItems?: string[];
    transcript?: string;
    audioUrl?: string;
    createdById: string;
    createdByName: string;
    createdAt: any;
    updatedAt?: any;
}

export interface MeetingCheckIn {
    id: string;
    meetingId: string;
    userId: string;
    userName: string;
    userEmail: string;
    checkInTime: any;
    notes?: string;
    location?: string;
}

export interface BusinessInstance {
    id: string;
    name: string;
    address?: string;
    ownerId: string;
    ownerEmail?: string;
    ownerName?: string;
    createdAt: any;
    trialExpiresAt?: any;
    plan?: 'starter' | 'pro' | 'business';
    accessLevel?: 'lifetime';
    status?: 'active' | 'deleted';
    deletedAt?: any;
    aiUsageCurrentDate?: string;
    aiUsageCount?: number;
    aiBonusCredits?: number;
    aiToolUsageCounts?: Record<string, number>;
    subscriptionReference?: string;
    isVerified?: boolean;
    featureOverrides?: Record<string, boolean>;
    settings?: {
        phone?: string;
        email?: string;
        currency?: string;
        timezone?: string;
        industry?: string;
        defaultTaxRate?: number;
        country?: string;
        state?: string;
        productCategories?: string[];
        primaryColor?: string;
        logoUrl?: string;
        language?: string;
        terminalAccountNumber?: string;
        terminalAccountName?: string;
        paymentBankAccountId?: string;
        kycStatus?: string;
        [key: string]: any;
    };
}

export interface Invitation {
    id: string;
    businessId: string;
    branchId?: string;
    email: string;
    name: string;
    role: 'manager' | 'member';
    createdAt: any;
}

export interface Purchase {
    id: string;
    userId?: string;
    businessId: string;
    plan: string;
    kind?: 'subscription' | 'credits';
    packId?: string;
    credits?: number;
    amount: number;
    currency: 'NGN' | 'USD';
    timestamp: any;
    reference?: string;
    gateway?: 'paystack' | 'dodopayments';
    verifiedServerSide?: boolean;
    userProfile?: UserProfile;
}

export interface SubscriptionHistory {
    id: string;
    action: string;
    amount: number;
    currency: 'NGN' | 'USD';
    timestamp: any;
}

export interface BlogPost {
    id: string;
    title: string;
    slug: string;
    content: string;
    excerpt?: string;
    imageUrl?: string;
    authorId: string;
    authorName: string;
    published: boolean;
    category?: string;
    createdAt: any;
    updatedAt: any;
}

export interface AdminNotification {
    id: string;
    title: string;
    body: string;
    sentBy: string;
    createdAt: any;
    link?: string | null;
    targetEmail?: string | null;
    deleted?: boolean;
    deletedAt?: any;
}

export interface UserNotification {
    id: string;
    title: string;
    body: string;
    read: boolean;
    createdAt: any;
    isGlobal?: boolean;
    queuedActionId?: string;
}

export interface PushCampaign {
    id: string;
    title: string;
    body: string;
    link: string;
    source: 'broadcast' | 'alert' | 'test' | 'system';
    audience: 'all' | 'user';
    audienceLabel?: string | null;
    sentBy?: string | null;
    sentByEmail?: string | null;
    sentAt: any;
    deviceCount: number;
    successCount: number;
    failureCount: number;
    recipientCount: number;
    clickCount?: number;
    lastClickAt?: any;
}

export interface PushRecipient {
    id: string;
    userId: string;
    userName?: string | null;
    userEmail?: string | null;
    deviceCount: number;
    successCount: number;
    failureCount: number;
    sentAt: any;
    clickedAt?: any;
    lastClickedAt?: any;
    clickCount?: number;
}

export interface SystemBroadcast {
    id: string;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'alert';
    expiresAt: any;
    createdAt: any;
    isActive: boolean;
    createdBy: string;
    link?: string;
}

export interface SupportThread {
    id: string;
    userId: string;
    userName: string;
    userEmail?: string;
    subject: string;
    status: 'open' | 'closed';
    lastMessageAt: any;
    lastMessageSnippet?: string;
    lastMessage?: any;
    lastMessageSender?: string;
    lastMessageSenderId?: string;
    isReadByAdmin: boolean;
    isReadByUser?: boolean;
    createdAt: any;
}

export interface SupportMessage {
    id: string;
    senderId: string;
    senderName: string;
    text: string;
    createdAt: any;
}

export interface PressArticle {
    title: string;
    publication: string;
    logoUrl?: string;
    url: string;
}

export interface AuditLog {
    id: string;
    businessId: string;
    userId: string;
    userName: string;
    userEmail: string;
    userRole?: string;
    action: string;
    entityType: string;
    entityId: string;
    details: Record<string, any>;
    createdAt: any;
}

export type PromoToastColor = 'blue' | 'orange' | 'emerald' | 'purple' | 'amber';
export type PromoToastMode = 'poster' | 'card';
export type PromoToastTargetPlatform = 'all' | 'desktop' | 'web';

export interface PromoToastConfig {
    id: string;
    enabled: boolean;
    displayMode: PromoToastMode;
    imageUrl: string;
    badgeText: string;
    title: string;
    description: string;
    buttonText: string;
    targetUrl: string;
    themeColor: PromoToastColor;
    targetPlatform: PromoToastTargetPlatform;
    cooldownHours: number;
    autoShowDelaySec: number;
    updatedAt?: any;
}

export type Product = any;
export type Receipt = any;
