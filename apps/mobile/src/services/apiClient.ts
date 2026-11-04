import { getApiBaseUrl } from '../config/api';
import { AuthStorage } from './authStorage';
import {
  StartLocationSessionInput,
  StopLocationSessionInput,
  UpdateLocationInput,
  LocationSessionDTO,
  DonorLatestLocationDTO,
} from '@raktasetu/shared';

export interface CampAssignmentDTO {
  campId: string;
  campCode: string;
  title: string;
  venue: string;
  targetDate: string;
  timeSlot?: string | null;
  status: string;
  isReadyForCollection: boolean;
  isOperational?: boolean;
  parentOrganisation?: {
    id: string;
    name: string;
    orgCode: string;
  } | null;
  role: 'CAMP_COORDINATOR' | 'CAMP_ADMIN' | 'CLINICAL_STAFF' | 'COLLECTION_STAFF' | 'ORG_ADMIN' | string;
  assignmentSource: 'CAMP_CREATOR' | 'EXPLICIT_ASSIGNMENT' | 'PARENT_BANK_STAFF' | string;
  assignedAt: string;
}

export interface CampDetailsDTO {
  camp: {
    id: string;
    campCode: string;
    title: string;
    organizerName?: string;
    targetDate: string;
    timeSlot?: string | null;
    venue: string;
    district?: string;
    districtCode: number;
    stateCode: number;
    expectedDonors?: number;
    coordinatorContact?: string;
    status: string;
    isReadyForCollection: boolean;
    readinessVerifiedAt?: string | null;
    readinessVerifiedBy?: string | null;
    readinessChecklist?: {
      staffAssigned?: boolean;
      coldChainVerified?: boolean;
      emergencyKitAvailable?: boolean;
      consumablesStocked?: boolean;
      spaceSanitized?: boolean;
    } | null;
    readinessNotes?: string | null;
    organisation?: {
      id: string;
      name: string;
      orgCode: string;
      status: string;
    } | null;
  };
  counts?: {
    registeredDonors: number;
    checkedInDonors: number;
    awaitingCounselling: number;
    awaitingScreening: number;
    clinicallyCleared: number;
    completedDonations: number;
  } | null;
  analytics?: CampAnalyticsDTO | null;
}

export interface CampAnalyticsDTO {
  registeredDonors: number;
  checkedInDonors: number;
  checkedIn?: number;
  awaitingCounselling?: number;
  awaitingScreening?: number;
  screenedDonors: number;
  clearedScreeningDonors?: number;
  clinicallyCleared?: number;
  deferredScreeningDonors?: number;
  completedDonations: number;
  totalVolumeMl: number;
  totalVolumeLiters?: number;
  confirmedUnits: number;
  totalConfirmedUnits?: number;
  awaitingDispatchUnits?: number;
  dispatchedUnits?: number;
  receivedUnits?: number;
  processingUnits?: number;
  releasedUnits?: number;
  expectedDonors: number;
  targetDonations?: number;
  targetCompletionPercentage?: number;
  targetProgressPercent?: number;
  handoverDiscrepancies?: number;
  byBloodGroup?: Array<{
    bloodGroup: string;
    label: string;
    registeredDonors: number;
    checkedInDonors: number;
    screenedDonors: number;
    completedDonations: number;
    totalVolumeMl: number;
    confirmedUnits: number;
  }>;
  bloodGroups?: Array<{
    bloodGroup: string;
    label: string;
    registeredDonors: number;
    checkedInDonors: number;
    screenedDonors: number;
    completedDonations: number;
    totalVolumeMl: number;
    confirmedUnits: number;
  }>;
  bloodGroupBreakdown?: Record<string, number>;
}

export interface VerifyCampReadinessInput {
  isReadyForCollection: boolean;
  readinessChecklist: {
    staffAssigned: boolean;
    coldChainVerified: boolean;
    emergencyKitAvailable: boolean;
    consumablesStocked: boolean;
    spaceSanitized: boolean;
  };
  readinessNotes?: string;
}

export interface EditCampInput {
  title?: string;
  venue?: string;
  targetDate?: string;
  timeSlot?: string;
  expectedDonors?: number;
  coordinatorContact?: string;
}

export interface CampStaffDTO {
  id: string;
  campId: string;
  userId: string;
  role: string;
  isActive: boolean;
  assignedAt: string;
  assignedBy?: string;
  user?: {
    id: string;
    name?: string | null;
    phoneNumber?: string | null;
  };
}

export interface DonorLookupResultDTO {
  found: boolean;
  alreadyRegistered: boolean;
  message?: string;
  normalizedPhone?: string;
  existingAttendance?: {
    id: string;
    status: 'REGISTERED' | 'CHECKED_IN' | 'CANCELLED' | string;
    registeredAt: string;
    checkedInAt?: string | null;
    hasScreening?: boolean;
    screeningStatus?: string | null;
    hasDonation?: boolean;
    donationOutcome?: string | null;
    unitNumber?: string | null;
    unitStatus?: string | null;
  } | null;
  donor?: {
    userId: string;
    name: string;
    maskedPhone: string;
    phoneNumber?: string;
    bloodGroup?: string | null;
    provenanceLabel?: string;
    isEligible: boolean;
    eligibilityWarning?: string | null;
    lastDonationDate?: string | null;
    nextEligibleDate?: string | null;
    daysRemaining?: number;
  } | null;
}

export interface RegisterAttendanceInput {
  phoneOrUserId: string;
  donorName?: string;
  bloodGroup?: string;
}

export interface CampAttendanceDTO {
  id: string;
  campId: string;
  userId: string;
  donorName: string;
  donorPhone: string;
  bloodGroup?: string | null;
  status: 'REGISTERED' | 'CHECKED_IN' | 'CANCELLED' | string;
  registeredAt: string;
  checkedInAt?: string | null;
  checkedInBy?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  screening?: {
    id: string;
    status: 'CLEARED' | 'DEFERRED' | string;
    eligibilityDecision?: string;
    createdAt?: string;
  } | null;
  donationEvent?: {
    id: string;
    outcome: 'COMPLETED' | 'ABORTED' | string;
    bloodGroup?: string;
    performedAt?: string;
    collectionUnit?: {
      id: string;
      unitNumber: string;
      status: string;
    } | null;
  } | null;
  eligibility?: {
    isEligible: boolean;
    status: string;
    nextEligibleDate?: string | null;
    daysRemaining?: number;
    lastDonationDate?: string | null;
    hasDonatedAtThisCamp?: boolean;
    policy?: string;
  } | null;
}

export interface BloodCentreDTO {
  hospitalCode: string;
  hospitalName: string;
  mobileNo: string | null;
  hasValidContact?: boolean;
  address: string | null;
  stateCode?: number;
  districtCode?: number | null;
  isParticipatingCentre?: boolean;
  sourceType?: 'INTERNAL' | 'EXTERNAL';
  sourceLabel?: string;
  orgCode?: string;
  lastFetchedAt?: string | null;
}

export interface BloodCentresResponse extends ApiResponse<BloodCentreDTO[]> {
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  meta?: {
    isLive?: boolean;
    source?: string;
    sourceType?: string;
    participatingCount?: number;
    externalCount?: number;
    stateCode?: number;
    districtCode?: number;
  };
}

/**
 * Normalizes input phone to +91XXXXXXXXXX format matching backend regex /^\+91[6-9]\d{9}$/
 */
export function normalizeIndianMobile(input: string): { valid: boolean; normalized: string; error?: string } {
  if (!input || typeof input !== 'string') {
    return { valid: false, normalized: '', error: 'Mobile number is required.' };
  }
  const clean = input.replace(/[^\d+]/g, '');
  const normalized = clean.startsWith('+')
    ? clean
    : clean.length === 10
    ? `+91${clean}`
    : clean.length === 12 && clean.startsWith('91')
    ? `+${clean}`
    : clean;

  if (!/^\+91[6-9]\d{9}$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Please enter a valid 10-digit Indian mobile number (e.g. 9876543210).',
    };
  }
  return { valid: true, normalized };
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: {
    message: string;
    code: string;
  };
}

export class ApiClient {
  private static async request<T = any>(
    path: string,
    options: {
      method?: string;
      body?: any;
      requiresAuth?: boolean;
    } = {}
  ): Promise<ApiResponse<T>> {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (options.requiresAuth !== false) {
      const token = await AuthStorage.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    try {
      const res = await fetch(url, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      const isJson = res.headers.get('content-type')?.includes('application/json');
      const data = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        // If session expired or unauthorized on protected endpoint, handle locally
        if (res.status === 401 && options.requiresAuth !== false) {
          console.warn('[ApiClient] Session expired or unauthorized.');
        }

        return {
          success: false,
          error: data?.error || {
            message: data?.message || `HTTP ${res.status}: Request failed`,
            code: data?.error?.code || 'REQUEST_FAILED',
          },
        };
      }

      return data as ApiResponse<T>;
    } catch (err: any) {
      return {
        success: false,
        error: {
          message: err.message || 'Network request failed. Please check connectivity.',
          code: 'NETWORK_ERROR',
        },
      };
    }
  }

  // --- Authentication Endpoints ---

  static async sendOtp(phoneNumber: string): Promise<ApiResponse<{ normalizedPhone: string; demoNotice: string; cooldownSeconds: number }>> {
    return this.request('/donor/auth/send-otp', {
      method: 'POST',
      body: { phoneNumber },
      requiresAuth: false,
    });
  }

  static async verifyOtp(phoneNumber: string, otp: string): Promise<ApiResponse<{ token: string; user: any }>> {
    const res = await this.request<{ token: string; user: any }>('/donor/auth/verify-otp', {
      method: 'POST',
      body: { phoneNumber, otp },
      requiresAuth: false,
    });

    if (res.success && res.data?.token) {
      await AuthStorage.saveToken(res.data.token);
      const u = res.data.user;
      await AuthStorage.saveUser({
        id: u.id,
        phoneNumber: u.phoneNumber,
        name: u.name,
        bloodGroup: u.donorProfile?.bloodGroup || null,
        stateCode: u.donorProfile?.stateCode ?? null,
        districtCode: u.donorProfile?.districtCode ?? null,
        cityOrLocality: u.donorProfile?.cityOrLocality ?? null,
      });
    }

    return res;
  }

  static async getProfile(): Promise<ApiResponse<any>> {
    return this.request('/profile/me', {
      method: 'GET',
    });
  }

  static async updateProfile(data: {
    fullName?: string;
    bloodGroup?: string;
    stateCode?: number;
    districtCode?: number;
    cityOrLocality?: string;
    isAvailable?: boolean;
    isSearchable?: boolean;
    lastDonationDate?: string | null;
  }): Promise<ApiResponse<any>> {
    return this.request('/profile/me', {
      method: 'PUT',
      body: data,
    });
  }

  static async registerDonor(data: {
    fullName: string;
    dateOfBirth: string;
    bloodGroup: string;
    districtCode: number;
    stateCode?: number;
    cityOrLocality?: string;
    isAvailable?: boolean;
    consentToSearch?: boolean;
    consentVersion?: string;
  }): Promise<ApiResponse<any>> {
    return this.request('/donors', {
      method: 'POST',
      body: data,
    });
  }

  // --- Donation History & Invitations ---

  static async getDonations(): Promise<ApiResponse<any[]>> {
    return this.request('/donors/me/donations', {
      method: 'GET',
    });
  }

  static async getEligibleRequests(): Promise<ApiResponse<{ requests: any[]; totalMatched: number }>> {
    return this.request('/donors/me/eligible-requests', {
      method: 'GET',
    });
  }

  static async respondToRequest(requestId: string, action: 'ACCEPT' | 'DECLINE'): Promise<ApiResponse<any>> {
    return this.request('/donors/me/responses', {
      method: 'POST',
      body: { requestId, action },
    });
  }

  static async getDonorResponses(): Promise<ApiResponse<any[]>> {
    return this.request('/donors/me/responses', {
      method: 'GET',
    });
  }

  // --- Public / Search Endpoints ---

  static async searchAvailability(params: {
    districtCode: number;
    stateCode?: number;
    bloodGroup?: string;
    component?: string;
  }): Promise<ApiResponse<{ results?: any[]; data?: any[]; meta?: any }>> {
    const q = new URLSearchParams();
    q.set('districtCode', String(params.districtCode));
    q.set('stateCode', String(params.stateCode || 27));
    if (params.bloodGroup) q.set('bloodGroup', params.bloodGroup);
    if (params.component) q.set('component', params.component);

    return this.request(`/blood-availability?${q.toString()}`, {
      method: 'GET',
      requiresAuth: false,
    });
  }

  static async searchBloodCentres(params: {
    districtCode?: number;
    stateCode?: number;
    search?: string;
    page?: number;
    limit?: number;
    source?: 'internal' | 'external' | 'all';
  }): Promise<BloodCentresResponse> {
    const q = new URLSearchParams();
    if (params.districtCode !== undefined && !isNaN(params.districtCode)) {
      q.set('districtCode', String(params.districtCode));
    }
    if (params.stateCode !== undefined && !isNaN(params.stateCode)) {
      q.set('stateCode', String(params.stateCode));
    }
    if (params.search && params.search.trim()) {
      q.set('search', params.search.trim());
    }
    if (params.page !== undefined && !isNaN(params.page)) {
      q.set('page', String(params.page));
    }
    if (params.limit !== undefined && !isNaN(params.limit)) {
      q.set('limit', String(params.limit));
    }
    if (params.source) {
      q.set('source', params.source);
    }

    return this.request(`/blood-centres?${q.toString()}`, {
      method: 'GET',
      requiresAuth: false,
    });
  }

  static async discoverDonors(params: {
    districtCode?: number;
    bloodGroup?: string;
    cityOrLocality?: string;
    stateCode?: number;
  }): Promise<ApiResponse<any[]>> {
    const q = new URLSearchParams();
    if (params.districtCode) q.set('districtCode', String(params.districtCode));
    if (params.bloodGroup) q.set('bloodGroup', params.bloodGroup);
    if (params.cityOrLocality) q.set('cityOrLocality', params.cityOrLocality);
    q.set('stateCode', String(params.stateCode || 27));

    return this.request(`/donors/discovery?${q.toString()}`, {
      method: 'GET',
      requiresAuth: false,
    });
  }

  // --- Blood Requests ---

  static async createBloodRequest(data: {
    patientName: string;
    bloodGroup: string;
    component: string;
    unitsRequested: number;
    hospitalName: string;
    hospitalCode?: string;
    admittedHospitalName?: string;
    urgency?: string;
    requiredBy?: string;
    message?: string;
    contactPhone?: string;
  }): Promise<ApiResponse<any>> {
    return this.request('/patient-requests', {
      method: 'POST',
      body: data,
    });
  }

  static async confirmBloodRequestReceipt(requestId: string, notes?: string): Promise<ApiResponse<any>> {
    return this.request(`/blood-requests/${requestId}/patient-acknowledge`, {
      method: 'POST',
      body: { notes },
    });
  }

  static async getPatientRequests(): Promise<ApiResponse<any[]>> {
    return this.request('/patient-requests', {
      method: 'GET',
    });
  }

  static async getPatientRequestDetails(id: string): Promise<ApiResponse<any>> {
    return this.request(`/patient-requests/${id}`, {
      method: 'GET',
    });
  }

  static async cancelPatientRequest(id: string, reason?: string): Promise<ApiResponse<any>> {
    return this.request(`/patient-requests/${id}/cancel`, {
      method: 'POST',
      body: { reason: reason || 'Cancelled by requester' },
    });
  }

  // --- Location Tracking Lifecycle Endpoints ---

  static async startLocationSession(input: StartLocationSessionInput): Promise<ApiResponse<LocationSessionDTO>> {
    const res = await this.request<LocationSessionDTO>('/donor/location/session/start', {
      method: 'POST',
      body: input,
    });

    if (res.success && res.data?.id) {
      await AuthStorage.saveActiveSessionId(res.data.id);
    }

    return res;
  }

  static async updateLocation(input: UpdateLocationInput): Promise<ApiResponse<DonorLatestLocationDTO>> {
    return this.request<DonorLatestLocationDTO>('/donor/location/update', {
      method: 'POST',
      body: input,
    });
  }

  static async stopLocationSession(input?: StopLocationSessionInput): Promise<ApiResponse<LocationSessionDTO>> {
    const activeSessionId = await AuthStorage.getActiveSessionId();
    const res = await this.request<LocationSessionDTO>('/donor/location/session/stop', {
      method: 'POST',
      body: {
        reason: input?.reason || 'DONOR_STOPPED',
        sessionId: activeSessionId || undefined,
      },
    });

    if (res.success) {
      await AuthStorage.removeActiveSessionId();
    }

    return res;
  }

  // --- Camp Staff Operations (Milestone 04B & 04C) ---

  static async getMyCampAssignments(): Promise<ApiResponse<CampAssignmentDTO[]>> {
    return this.request<CampAssignmentDTO[]>('/camps/me/assignments', {
      method: 'GET',
    });
  }

  static async getCampDetails(campId: string): Promise<ApiResponse<CampDetailsDTO>> {
    return this.request<CampDetailsDTO>(`/camps/${campId}`, {
      method: 'GET',
    });
  }

  static async getCampAnalytics(campId: string): Promise<ApiResponse<CampAnalyticsDTO>> {
    return this.request<CampAnalyticsDTO>(`/camps/${campId}/analytics`, {
      method: 'GET',
    });
  }

  static async verifyCampReadiness(
    campId: string,
    payload: VerifyCampReadinessInput
  ): Promise<ApiResponse<any>> {
    return this.request(`/camps/${campId}/readiness`, {
      method: 'POST',
      body: payload,
    });
  }

  static async editCamp(
    campId: string,
    payload: EditCampInput
  ): Promise<ApiResponse<any>> {
    return this.request(`/camps/${campId}`, {
      method: 'PATCH',
      body: payload,
    });
  }

  static async getCampStaff(campId: string): Promise<ApiResponse<CampStaffDTO[]>> {
    return this.request<CampStaffDTO[]>(`/camps/${campId}/staff`, {
      method: 'GET',
    });
  }

  // --- Milestone 04D: Donor Lookup, Walk-in Registration & Attendance ---

  static async lookupDonor(campId: string, phone: string): Promise<ApiResponse<DonorLookupResultDTO>> {
    const q = new URLSearchParams({ phone });
    return this.request<DonorLookupResultDTO>(`/camps/${campId}/donor-lookup?${q.toString()}`, {
      method: 'GET',
    });
  }

  static async registerCampAttendance(
    campId: string,
    payload: RegisterAttendanceInput
  ): Promise<ApiResponse<CampAttendanceDTO>> {
    return this.request<CampAttendanceDTO>(`/camps/${campId}/attendance`, {
      method: 'POST',
      body: payload,
    });
  }

  static async getCampAttendanceRoster(campId: string): Promise<ApiResponse<CampAttendanceDTO[]>> {
    return this.request<CampAttendanceDTO[]>(`/camps/${campId}/attendance`, {
      method: 'GET',
    });
  }

  static async checkInAttendance(campId: string, attendanceId: string): Promise<ApiResponse<CampAttendanceDTO>> {
    return this.request<CampAttendanceDTO>(`/camps/${campId}/attendance/${attendanceId}/check-in`, {
      method: 'POST',
    });
  }

  static async cancelCampAttendance(
    campId: string,
    attendanceId: string,
    reason?: string
  ): Promise<ApiResponse<CampAttendanceDTO>> {
    return this.request<CampAttendanceDTO>(`/camps/${campId}/attendance/${attendanceId}/cancel`, {
      method: 'POST',
      body: { reason },
    });
  }
}
