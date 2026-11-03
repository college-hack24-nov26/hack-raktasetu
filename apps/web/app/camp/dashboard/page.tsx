'use client';

import { useState, useEffect, useCallback, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { notifyAuthChange } from '../../components/Header';
import { authFetch, getAuthToken } from '../../config/api';
import { useRealtime } from '../../hooks/useRealtime';
import {
  IconDashboard,
  IconStaff,
  IconScreening,
  IconCollection,
  IconHandover,
  IconReports,
  IconApplications,
  IconSettings,
  IconLogOut,
  IconMenu,
  IconPlus,
} from '../../components/ui/Icons';

interface CampAssignment {
  campId: string;
  campCode: string;
  title: string;
  venue: string;
  targetDate: string;
  timeSlot?: string | null;
  status: string;
  isReadyForCollection: boolean;
  parentOrganisation?: {
    id: string;
    name: string;
    orgCode: string;
  } | null;
  role: 'CAMP_ADMIN' | 'CAMP_COORDINATOR' | 'CLINICAL_STAFF' | 'COLLECTION_STAFF';
  assignmentSource: string;
  assignedAt: string;
  isOperational?: boolean;
}

interface CampDetails {
  id: string;
  campCode: string;
  title: string;
  organizerName: string;
  targetDate: string;
  timeSlot?: string | null;
  venue: string;
  district?: string | null;
  expectedDonors: number;
  coordinatorContact?: string;
  status: string;
  isReadyForCollection: boolean;
  readinessVerifiedAt?: string | null;
  readinessChecklist?: any;
  readinessNotes?: string | null;
  organisation?: {
    id: string;
    name: string;
    orgCode: string;
    status: string;
  } | null;
  rejectionReason?: string | null;
  createdById?: string | null;
}

interface AttendanceItem {
  id: string;
  campId: string;
  userId: string;
  donorName: string;
  donorPhone: string;
  bloodGroup: string | null;
  status: 'REGISTERED' | 'CHECKED_IN' | 'CANCELLED';
  registeredAt: string;
  checkedInAt?: string | null;
  screening?: {
    id: string;
    status: string;
    consentGiven: boolean;
    eligibilityDecision: string;
    deferralCategory?: string | null;
    deferralDurationDays?: number | null;
    clinicalNotes?: string | null;
  } | null;
  donationEvent?: {
    id: string;
    outcome: string;
    bloodGroup: string;
    volumeMl?: number | null;
    adverseReaction: boolean;
    performedAt: string;
    collectionUnit?: {
      id: string;
      unitNumber: string;
      status: string;
      volumeMl?: number | null;
      collectedAt?: string | null;
      handoverStatus?: string | null;
      manifestNumber?: string | null;
      receiptOutcome?: string | null;
    } | null;
  } | null;
  eligibility?: {
    isEligible: boolean;
    status: 'ELIGIBLE' | 'TEMPORARILY_INELIGIBLE' | 'REVIEW_REQUIRED';
    nextEligibleDate?: string | null;
    daysRemaining?: number;
    hasDonatedAtThisCamp?: boolean;
  };
}

type CampNavPage = 'overview' | 'donors' | 'screening' | 'collection' | 'handover' | 'reports' | 'team' | 'settings';

function CampDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedCampId = searchParams.get('campId');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [confirmingUnitId, setConfirmingUnitId] = useState<string | null>(null);

  // Navigation state
  const [activePage, setActivePage] = useState<CampNavPage>('overview');
  const [showMobileMore, setShowMobileMore] = useState(false);

  useEffect(() => {
    if (actionSuccess) {
      const timer = setTimeout(() => setActionSuccess(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [actionSuccess]);

  const [assignedCamps, setAssignedCamps] = useState<CampAssignment[]>([]);
  const [currentCamp, setCurrentCamp] = useState<CampDetails | null>(null);
  const [currentRole, setCurrentRole] = useState<string>('CAMP_COORDINATOR');
  const [counts, setCounts] = useState<{
    registeredDonors: number;
    checkedInDonors: number;
    clinicallyCleared: number;
    completedDonations: number;
  } | null>(null);

  const [roster, setRoster] = useState<AttendanceItem[]>([]);
  const [loadingRoster, setLoadingRoster] = useState(false);

  // Blood Collection Overview & Blood-Group-Wise Analytics
  const [analytics, setAnalytics] = useState<any>(null);

  // Roster Filters and Sorting State
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBloodGroup, setFilterBloodGroup] = useState('ALL');
  const [filterAttendanceStatus, setFilterAttendanceStatus] = useState('ALL');
  const [filterScreeningStatus, setFilterScreeningStatus] = useState('ALL');
  const [filterDonationStatus, setFilterDonationStatus] = useState('ALL');
  const [filterUnitStatus, setFilterUnitStatus] = useState('ALL');
  const [filterHandoverStatus, setFilterHandoverStatus] = useState('ALL');
  const [sortBy, setSortBy] = useState<'name' | 'time' | 'bloodGroup' | 'volume'>('time');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Walk-in & Phone-First Lookup state
  const [showWalkinCard, setShowWalkinCard] = useState(false);
  const [walkinPhone, setWalkinPhone] = useState('');
  const [walkinName, setWalkinName] = useState('');
  const [walkinBloodGroup, setWalkinBloodGroup] = useState('UNKNOWN');
  const [submittingWalkin, setSubmittingWalkin] = useState(false);
  const [lookingUpDonor, setLookingUpDonor] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<{
    found: boolean;
    alreadyRegistered: boolean;
    existingAttendance?: {
      id: string;
      status: string;
      registeredAt: string;
      checkedInAt?: string | null;
      hasScreening: boolean;
      screeningStatus?: string | null;
      hasDonation: boolean;
      donationOutcome?: string | null;
      unitNumber?: string | null;
      unitStatus?: string | null;
    } | null;
    donor?: {
      userId: string;
      name: string;
      maskedPhone: string;
      phoneNumber: string;
      bloodGroup: string | null;
      provenanceLabel: string;
      isEligible: boolean;
      eligibilityWarning?: string | null;
      lastDonationDate?: string | null;
      nextEligibleDate?: string | null;
      daysRemaining?: number;
    } | null;
    message?: string;
  } | null>(null);

  // Staff management state (Camp Admin)
  const [staffList, setStaffList] = useState<any[]>([]);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [submittingStaff, setSubmittingStaff] = useState(false);

  // Readiness modal state
  const [showReadinessModal, setShowReadinessModal] = useState(false);
  const [readinessChecklist, setReadinessChecklist] = useState({
    staffAssigned: true,
    coldChainVerified: true,
    emergencyKitAvailable: true,
    consumablesStocked: true,
    spaceSanitized: true,
  });
  const [readinessNotes, setReadinessNotes] = useState('');
  const [verifyingReadiness, setVerifyingReadiness] = useState(false);

  // Clinical screening modal state
  const [screeningAttendee, setScreeningAttendee] = useState<AttendanceItem | null>(null);
  const [consentConfirmed, setConsentConfirmed] = useState(true);
  const [eligibilityDecision, setEligibilityDecision] = useState<'CLEARED' | 'TEMPORARY_DEFERRAL' | 'PERMANENT_DEFERRAL'>('CLEARED');
  const [deferralCategory, setDeferralCategory] = useState<'LOW_HEMOGLOBIN' | 'RECENT_ILLNESS' | 'MEDICATION' | 'WEIGHT_CRITERIA' | 'OTHER'>('LOW_HEMOGLOBIN');
  const [deferralDays, setDeferralDays] = useState(14);
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [submittingScreening, setSubmittingScreening] = useState(false);

  // Donation event modal state
  const [donationAttendee, setDonationAttendee] = useState<AttendanceItem | null>(null);
  const [donationBloodGroup, setDonationBloodGroup] = useState('O_POS');
  const [donationOutcome, setDonationOutcome] = useState<'COMPLETED' | 'DEFERRED' | 'NOT_PERFORMED' | 'ADVERSE_EVENT_STOPPED'>('COMPLETED');
  const [donationVolume, setDonationVolume] = useState(450);
  const [adverseReaction, setAdverseReaction] = useState(false);
  const [donationNotes, setDonationNotes] = useState('');
  const [submittingDonation, setSubmittingDonation] = useState(false);

  // Camp-Side Handover Workflow state
  const [handoverData, setHandoverData] = useState<{
    camp: any;
    units: any[];
    manifest: any;
    activeManifest?: any;
    summary: {
      totalUnits: number;
      eligibleUnitsCount: number;
      eligibleCount?: number;
      inTransitUnitsCount: number;
      inTransitCount?: number;
      receivedUnitsCount: number;
      receivedCount?: number;
      eligibleVolumeMl: number;
      totalVolumeMl: number;
    };
  } | null>(null);
  const [loadingHandover, setLoadingHandover] = useState(false);
  const [submittingHandover, setSubmittingHandover] = useState(false);
  const [transportCourierName, setTransportCourierName] = useState('Govt Dedicated Cold-Chain Van');
  const [transportVehicleNumber, setTransportVehicleNumber] = useState('MH-12-BB-2026');
  const [transportDriverPhone, setTransportDriverPhone] = useState('9876543210');
  const [transportColdBoxTemp, setTransportColdBoxTemp] = useState('4.0');
  const [transportNotes, setTransportNotes] = useState('');

  // Camp Closure & Readiness Assessment state
  const [closureReadiness, setClosureReadiness] = useState<{
    isReady: boolean;
    isClosed: boolean;
    blockers: string[];
    metrics: {
      totalDonations: number;
      totalConfirmedUnits: number;
      totalReceivedUnits: number;
      unitsInCustody: number;
      unitsInTransit: number;
      openExceptions: number;
      unreconciledManifestsCount: number;
    } | null;
  } | null>(null);
  const [loadingClosureReadiness, setLoadingClosureReadiness] = useState(false);
  const [showCloseCampModal, setShowCloseCampModal] = useState(false);
  const [closingCamp, setClosingCamp] = useState(false);
  const [closureNotes, setClosureNotes] = useState('');

  // Sign out handler
  const handleSignOut = () => {
    localStorage.removeItem('raktasetu_token');
    localStorage.removeItem('raktasetu_user');
    notifyAuthChange();
    router.push('/camp/login');
  };

  // Load camp data
  const loadStaffList = useCallback(async (campId: string) => {
    try {
      const res = await authFetch(`/api/v1/camps/${campId}/staff`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStaffList(data.data || []);
        }
      }
    } catch (err) {
      console.error('Failed to load camp staff:', err);
    }
  }, []);

  const loadHandoverData = useCallback(async (campId: string) => {
    try {
      setLoadingHandover(true);
      const res = await authFetch(`/api/v1/camps/${campId}/handover`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setHandoverData(data.data);
        }
      }
    } catch (err) {
      console.error('Failed to load camp handover data:', err);
    } finally {
      setLoadingHandover(false);
    }
  }, []);

  const loadClosureReadiness = useCallback(async (campId: string) => {
    try {
      setLoadingClosureReadiness(true);
      const res = await authFetch(`/api/v1/camps/${campId}/closure-readiness`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setClosureReadiness(data.data);
        }
      }
    } catch (err) {
      console.error('Failed to load camp closure readiness:', err);
    } finally {
      setLoadingClosureReadiness(false);
    }
  }, []);

  const loadCampData = useCallback(async (campId: string) => {
    try {
      setLoadingRoster(true);
      setError(null);

      const [campRes, rosterRes] = await Promise.all([
        authFetch(`/api/v1/camps/${campId}`),
        authFetch(`/api/v1/camps/${campId}/attendance`).catch(() => null),
      ]);

      if (!campRes.ok) {
        const errData = await campRes.json().catch(() => ({}));
        throw new Error(errData.error?.message || 'Failed to load camp details');
      }

      const campData = await campRes.json();
      setCurrentCamp(campData.data?.camp || null);
      setCounts(campData.data?.counts || null);
      if (campData.data?.analytics) {
        setAnalytics(campData.data.analytics);
      }

      if (rosterRes && rosterRes.ok) {
        const rosterData = await rosterRes.json();
        setRoster(rosterData.data || []);
      }

      await Promise.all([
        loadStaffList(campId),
        loadHandoverData(campId),
        loadClosureReadiness(campId),
      ]);
    } catch (err: any) {
      setError(err.message || 'Error loading camp workspace');
    } finally {
      setLoadingRoster(false);
    }
  }, [loadStaffList, loadHandoverData, loadClosureReadiness]);

  const [refreshingCamp, setRefreshingCamp] = useState(false);
  const handleRefreshCamp = async () => {
    if (!currentCamp?.id) return;
    setRefreshingCamp(true);
    try {
      await loadCampData(currentCamp.id);
    } finally {
      setRefreshingCamp(false);
    }
  };

  // Real-time synchronization across camp dashboards
  const { isLive, isPollingFallback } = useRealtime({
    campId: currentCamp?.id,
    organisationId: currentCamp?.organisation?.id || (currentCamp as any)?.organisationId,
    enabled: !!currentCamp?.id,
    onEvent: (evt) => {
      if (
        evt.eventType.startsWith('camp.') ||
        evt.eventType.startsWith('handover.') ||
        evt.eventType.startsWith('component.') ||
        evt.eventType.startsWith('inventory.') ||
        evt.eventType === 'donor.eligibility_updated'
      ) {
        if (currentCamp?.id) {
          loadCampData(currentCamp.id);
        }
      }
    },
  });

  // Initialize session and assignments
  useEffect(() => {
    async function initDashboard() {
      const token = getAuthToken();
      if (!token) {
        router.push('/camp/login');
        return;
      }

      try {
        setLoading(true);
        const res = await authFetch('/api/v1/camps/me/assignments');
        if (!res.ok) {
          throw new Error('Could not retrieve your camp assignments.');
        }

        const data = await res.json();
        const camps: CampAssignment[] = data.data || [];
        setAssignedCamps(camps);

        if (camps.length === 0) {
          router.push('/camp/login');
          return;
        }

        let activeAssignment = camps[0];
        if (requestedCampId) {
          const match = camps.find((c) => c.campId === requestedCampId);
          if (match) {
            activeAssignment = match;
          }
        }

        setCurrentRole(activeAssignment.role);
        await loadCampData(activeAssignment.campId);
      } catch (err: any) {
        setError(err.message || 'Error loading dashboard');
      } finally {
        setLoading(false);
      }
    }

    initDashboard();
  }, [router, requestedCampId, loadCampData]);

  // Operational action: Verify Readiness
  const handleVerifyReadiness = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCamp) return;

    setVerifyingReadiness(true);
    setError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/v1/camps/${currentCamp.id}/readiness`, {
        method: 'POST',
        body: JSON.stringify({
          isReadyForCollection: true,
          readinessChecklist,
          readinessNotes: readinessNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Readiness verification failed');

      setShowReadinessModal(false);
      setActionSuccess('Camp operational readiness verified! Blood collection authorized.');
      await loadCampData(currentCamp.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setVerifyingReadiness(false);
    }
  };

  // Phone-First Donor Lookup Helper
  const handlePerformPhoneLookup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentCamp) return;

    const cleanDigits = walkinPhone.replace(/\D/g, '');
    if (cleanDigits.length !== 10) {
      setLookupError('Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    try {
      setLookingUpDonor(true);
      setLookupError(null);
      setLookupResult(null);

      const res = await authFetch(`/api/v1/camps/${currentCamp.id}/donor-lookup?phone=${cleanDigits}`);
      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || 'Failed to perform donor lookup.');
      }

      setLookupResult(resData.data);
      if (resData.data?.found && resData.data.donor) {
        setWalkinName(resData.data.donor.name || '');
      } else {
        setWalkinName('');
        setWalkinBloodGroup('UNKNOWN');
      }
    } catch (err: any) {
      setLookupError(err.message || 'Lookup failed. Please verify connection.');
    } finally {
      setLookingUpDonor(false);
    }
  };

  const resetRegistrationState = () => {
    setWalkinPhone('');
    setWalkinName('');
    setWalkinBloodGroup('UNKNOWN');
    setLookupResult(null);
    setLookupError(null);
  };

  // Register Existing Donor for Current Camp
  const handleRegisterExistingDonor = async () => {
    if (!currentCamp || !lookupResult?.donor) return;

    setSubmittingWalkin(true);
    setError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/v1/camps/${currentCamp.id}/attendance`, {
        method: 'POST',
        body: JSON.stringify({
          phoneOrUserId: lookupResult.donor.phoneNumber || lookupResult.donor.userId,
          donorName: lookupResult.donor.name,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Attendance registration failed');

      setActionSuccess(`✓ ${lookupResult.donor.name} registered for this camp! Proceed with check-in upon physical arrival.`);
      setShowWalkinCard(false);
      resetRegistrationState();
      await loadCampData(currentCamp.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmittingWalkin(false);
    }
  };

  // Staff Assignment action (Camp Admin)
  const handleAssignCoordinator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCamp || !newStaffPhone.trim()) return;

    setSubmittingStaff(true);
    setError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/v1/camps/${currentCamp.id}/staff`, {
        method: 'POST',
        body: JSON.stringify({
          userIdOrPhone: newStaffPhone.trim(),
          role: 'CAMP_COORDINATOR',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to assign camp coordinator');

      setNewStaffPhone('');
      const msg = data.message || (data.data?.isExisting
        ? 'This staff member is already assigned to this camp.'
        : data.data?.userReused
          ? 'Existing account found. Staff assignment completed.'
          : 'Staff member assigned to the camp successfully.');
      setActionSuccess(msg);
      await loadStaffList(currentCamp.id);
    } catch (err: any) {
      setError(err.message || "We couldn't complete this action. Please try again.");
    } finally {
      setSubmittingStaff(false);
    }
  };

  // Staff Revocation action (Camp Admin)
  const handleRevokeStaffMember = async (assignmentId: string) => {
    if (!currentCamp) return;
    setError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/v1/camps/${currentCamp.id}/staff/${assignmentId}`, {
        method: 'DELETE',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to revoke staff');

      setActionSuccess('Staff assignment revoked.');
      await loadStaffList(currentCamp.id);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Operational action: Register New Walk-in Donor
  const handleRegisterWalkin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCamp || !walkinPhone.trim()) return;

    if (!walkinName.trim()) {
      setError('Please provide the donor\'s full name.');
      return;
    }

    setSubmittingWalkin(true);
    setError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/v1/camps/${currentCamp.id}/attendance`, {
        method: 'POST',
        body: JSON.stringify({
          phoneOrUserId: walkinPhone.trim(),
          donorName: walkinName.trim(),
          bloodGroup: walkinBloodGroup === 'UNKNOWN' ? undefined : walkinBloodGroup,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Registration failed');

      setActionSuccess(`✓ Walk-in donor ${walkinName.trim()} registered for this camp! Proceed with check-in upon physical arrival.`);
      setShowWalkinCard(false);
      resetRegistrationState();
      await loadCampData(currentCamp.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmittingWalkin(false);
    }
  };

  // Operational action: Check In
  const handleCheckIn = async (attendanceId: string) => {
    if (!currentCamp) return;
    setError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/v1/camps/${currentCamp.id}/attendance/${attendanceId}/check-in`, {
        method: 'POST',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Check-in failed');

      setActionSuccess('Donor checked in! Ready for clinical screening.');
      await loadCampData(currentCamp.id);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Operational action: Record Clinical Screening
  const handleRecordScreening = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCamp || !screeningAttendee) return;

    setSubmittingScreening(true);
    setError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/v1/camps/${currentCamp.id}/attendance/${screeningAttendee.id}/screening`, {
        method: 'POST',
        body: JSON.stringify({
          consentGiven: consentConfirmed,
          eligibilityDecision,
          deferralCategory: eligibilityDecision === 'CLEARED' ? undefined : deferralCategory,
          deferralDurationDays: eligibilityDecision === 'CLEARED' ? undefined : deferralDays,
          clinicalNotes: clinicalNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Screening recording failed');

      setScreeningAttendee(null);
      setClinicalNotes('');
      setActionSuccess(`Clinical screening recorded: ${eligibilityDecision}!`);
      await loadCampData(currentCamp.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmittingScreening(false);
    }
  };

  // Operational action: Record Donation Event
  const handleRecordDonation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCamp || !donationAttendee) return;

    setSubmittingDonation(true);
    setError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/v1/camps/${currentCamp.id}/attendance/${donationAttendee.id}/donation`, {
        method: 'POST',
        body: JSON.stringify({
          bloodGroup: donationBloodGroup,
          outcome: donationOutcome,
          volumeMl: Number(donationVolume),
          adverseReaction,
          notes: donationNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Donation recording failed');

      setDonationAttendee(null);
      setDonationNotes('');
      setActionSuccess(`Donation event outcome recorded: ${donationOutcome}!`);
      await loadCampData(currentCamp.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmittingDonation(false);
    }
  };

  // Operational action: Confirm Collection Unit
  const handleConfirmUnit = async (donationEventId: string) => {
    setError(null);
    setActionSuccess(null);
    setConfirmingUnitId(donationEventId);

    try {
      const res = await authFetch('/api/v1/traceability/collection-units', {
        method: 'POST',
        body: JSON.stringify({
          donationEventId,
          volumeMl: 450,
          notes: 'Standard collection unit confirmed on camp site',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (
          res.status === 409 ||
          data.error?.code === 'DUPLICATE_COLLECTION_UNIT' ||
          data.error?.message?.includes('already been confirmed')
        ) {
          setActionSuccess('This donation already has a confirmed collection unit.');
          await loadCampData(currentCamp!.id);
          return;
        }
        throw new Error(data.error?.message || 'Collection unit registration failed');
      }

      setActionSuccess(`Collection unit confirmed successfully! Unit: ${data.data?.unitNumber || ''}`);
      await loadCampData(currentCamp!.id);
    } catch (err: any) {
      setError(err.message || "We couldn't complete this action. Please try again.");
    } finally {
      setConfirmingUnitId(null);
    }
  };

  // Camp Handover submission handler
  const handleSubmitHandover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCamp) return;

    setSubmittingHandover(true);
    setError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/v1/camps/${currentCamp.id}/handover`, {
        method: 'POST',
        body: JSON.stringify({
          transportDetails: {
            courierName: transportCourierName.trim() || 'Govt Cold-Chain Logistics',
            vehicleNumber: transportVehicleNumber.trim() || undefined,
            driverPhone: transportDriverPhone.trim() || undefined,
            coldBoxTempCelsius: parseFloat(transportColdBoxTemp) || 4.0,
            dispatchNotes: transportNotes.trim() || undefined,
          },
          notes: transportNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Handover submission failed');
      }

      setActionSuccess(data.data?.message || 'Handover manifest submitted successfully! Dispatched to parent blood bank.');
      await loadCampData(currentCamp.id);
    } catch (err: any) {
      setError(err.message || 'Failed to submit handover manifest');
    } finally {
      setSubmittingHandover(false);
    }
  };

  // Camp Closure handler
  const handleCloseCamp = async () => {
    if (!currentCamp) return;

    setClosingCamp(true);
    setError(null);
    setActionSuccess(null);

    try {
      const res = await authFetch(`/api/v1/camps/${currentCamp.id}/close`, {
        method: 'POST',
        body: JSON.stringify({
          notes: closureNotes.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || 'Camp closure failed');
      }

      setShowCloseCampModal(false);
      setActionSuccess('Camp formally closed and archived! Operational permissions revoked, historical records preserved.');
      await loadCampData(currentCamp.id);
    } catch (err: any) {
      setError(err.message || 'Failed to close camp');
    } finally {
      setClosingCamp(false);
    }
  };

  // Permissions helpers
  const isCampClosed = currentCamp?.status === 'COMPLETED' || currentCamp?.status === 'CANCELLED';
  const isCampApproved = currentCamp?.status === 'APPROVED' && !isCampClosed;
  const canManageTeam = (currentRole === 'CAMP_ADMIN') && isCampApproved;
  const canVerifyReadiness = (currentRole === 'CAMP_ADMIN' || currentRole === 'CAMP_COORDINATOR' || currentRole === 'COLLECTION_STAFF') && isCampApproved;
  const canRegisterWalkin = (currentRole === 'CAMP_ADMIN' || currentRole === 'CAMP_COORDINATOR' || currentRole === 'COLLECTION_STAFF') && isCampApproved;
  const canScreenDonors = currentRole === 'CLINICAL_STAFF' && isCampApproved;
  const canRecordDonations = currentRole === 'COLLECTION_STAFF' && isCampApproved;
  const canConfirmUnits = currentRole === 'COLLECTION_STAFF' && isCampApproved;
  const canSubmitHandover = (currentRole === 'CAMP_ADMIN' || currentRole === 'COLLECTION_STAFF') && isCampApproved;
  const canViewReports = (currentRole === 'CAMP_ADMIN' || currentRole === 'COLLECTION_STAFF');
  const canCloseCamp = (currentRole === 'CAMP_ADMIN') && !isCampClosed;

  // Filtered & sorted attendance roster
  const filteredRoster = useMemo(() => {
    return roster
      .filter((item) => {
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase().trim();
          const nameMatch = item.donorName.toLowerCase().includes(q);
          const phoneMatch = item.donorPhone.toLowerCase().includes(q);
          const unitMatch = item.donationEvent?.collectionUnit?.unitNumber?.toLowerCase().includes(q);
          if (!nameMatch && !phoneMatch && !unitMatch) return false;
        }

        if (filterBloodGroup !== 'ALL') {
          const itemGroup = item.bloodGroup || item.donationEvent?.bloodGroup;
          if (filterBloodGroup === 'UNKNOWN') {
            if (itemGroup && itemGroup !== 'UNKNOWN') return false;
          } else {
            if (itemGroup !== filterBloodGroup) return false;
          }
        }

        if (filterAttendanceStatus !== 'ALL') {
          if (item.status !== filterAttendanceStatus) return false;
        }

        if (filterScreeningStatus !== 'ALL') {
          if (filterScreeningStatus === 'NOT_SCREENED') {
            if (item.screening) return false;
          } else if (filterScreeningStatus === 'CLEARED') {
            if (item.screening?.status !== 'CLEARED') return false;
          } else if (filterScreeningStatus === 'DEFERRED') {
            if (item.screening?.status !== 'DEFERRED') return false;
          }
        }

        if (filterDonationStatus !== 'ALL') {
          if (filterDonationStatus === 'COMPLETED') {
            if (item.donationEvent?.outcome !== 'COMPLETED') return false;
          } else if (filterDonationStatus === 'PENDING') {
            if (item.donationEvent) return false;
          } else if (filterDonationStatus === 'DEFERRED') {
            if (item.donationEvent?.outcome !== 'DEFERRED') return false;
          }
        }

        if (filterUnitStatus !== 'ALL') {
          if (filterUnitStatus === 'CONFIRMED') {
            if (!item.donationEvent?.collectionUnit) return false;
          } else if (filterUnitStatus === 'PENDING') {
            if (item.donationEvent?.collectionUnit) return false;
          }
        }

        if (filterHandoverStatus !== 'ALL') {
          const unit = item.donationEvent?.collectionUnit;
          if (filterHandoverStatus === 'AWAITING_DISPATCH') {
            if (!unit || (unit.status !== 'COLLECTED' && unit.status !== 'PREPARED_FOR_HANDOVER')) return false;
          } else if (filterHandoverStatus === 'IN_TRANSIT') {
            if (!unit || unit.status !== 'IN_TRANSIT') return false;
          } else if (filterHandoverStatus === 'RECEIVED') {
            if (!unit || (unit.status !== 'RECEIVED_BY_CENTRE' && unit.status !== 'PROCESSING_COMPLETED')) return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        let comp = 0;
        if (sortBy === 'name') {
          comp = a.donorName.localeCompare(b.donorName);
        } else if (sortBy === 'bloodGroup') {
          comp = (a.bloodGroup || '').localeCompare(b.bloodGroup || '');
        } else if (sortBy === 'volume') {
          const volA = a.donationEvent?.volumeMl || 0;
          const volB = b.donationEvent?.volumeMl || 0;
          comp = volA - volB;
        } else {
          const timeA = new Date(a.checkedInAt || a.registeredAt).getTime();
          const timeB = new Date(b.checkedInAt || b.registeredAt).getTime();
          comp = timeA - timeB;
        }
        return sortOrder === 'asc' ? comp : -comp;
      });
  }, [
    roster,
    searchTerm,
    filterBloodGroup,
    filterAttendanceStatus,
    filterScreeningStatus,
    filterDonationStatus,
    filterUnitStatus,
    filterHandoverStatus,
    sortBy,
    sortOrder,
  ]);

  const hasActiveFilters = Boolean(
    searchTerm.trim() ||
    filterBloodGroup !== 'ALL' ||
    filterAttendanceStatus !== 'ALL' ||
    filterScreeningStatus !== 'ALL' ||
    filterDonationStatus !== 'ALL' ||
    filterUnitStatus !== 'ALL' ||
    filterHandoverStatus !== 'ALL'
  );

  const resetFilters = () => {
    setSearchTerm('');
    setFilterBloodGroup('ALL');
    setFilterAttendanceStatus('ALL');
    setFilterScreeningStatus('ALL');
    setFilterDonationStatus('ALL');
    setFilterUnitStatus('ALL');
    setFilterHandoverStatus('ALL');
  };

  // Recent Activity Feed Generator (Derived from real event timestamps)
  const recentActivity = useMemo(() => {
    const events: { id: string; time: Date; text: string; badge: string; badgeColor: string }[] = [];

    for (const item of roster) {
      if (item.donationEvent?.collectionUnit) {
        events.push({
          id: `cu-${item.id}`,
          time: new Date(item.donationEvent.collectionUnit.collectedAt || item.donationEvent.performedAt),
          text: `Bag confirmed: ${item.donationEvent.collectionUnit.unitNumber} (${item.donationEvent.volumeMl || 450} mL ${item.donationEvent.bloodGroup})`,
          badge: 'Unit Confirmed',
          badgeColor: 'bg-emerald-100 text-emerald-800',
        });
      } else if (item.donationEvent?.outcome === 'COMPLETED') {
        events.push({
          id: `dn-${item.id}`,
          time: new Date(item.donationEvent.performedAt),
          text: `${item.donorName} completed donation (${item.donationEvent.volumeMl || 450} mL ${item.donationEvent.bloodGroup})`,
          badge: 'Donation Completed',
          badgeColor: 'bg-red-100 text-red-800',
        });
      }

      if (item.screening?.status === 'CLEARED') {
        events.push({
          id: `sc-${item.id}`,
          time: new Date(item.checkedInAt || item.registeredAt),
          text: `${item.donorName} cleared clinical screening`,
          badge: 'Screening Cleared',
          badgeColor: 'bg-purple-100 text-purple-800',
        });
      } else if (item.screening?.status === 'DEFERRED') {
        events.push({
          id: `sc-def-${item.id}`,
          time: new Date(item.checkedInAt || item.registeredAt),
          text: `${item.donorName} clinically deferred (${item.screening.deferralCategory || 'Clinical criteria'})`,
          badge: 'Deferred',
          badgeColor: 'bg-amber-100 text-amber-800',
        });
      }

      if (item.status === 'CHECKED_IN' && item.checkedInAt) {
        events.push({
          id: `ci-${item.id}`,
          time: new Date(item.checkedInAt),
          text: `${item.donorName} checked in on-site`,
          badge: 'Checked In',
          badgeColor: 'bg-blue-100 text-blue-800',
        });
      }
    }

    return events.sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 5);
  }, [roster]);

  // Active blood groups for compact summary on Overview
  const activeBloodGroups = useMemo(() => {
    const groups = analytics?.byBloodGroup || analytics?.bloodGroups || [];
    return groups.filter((g: any) => g.completedDonations > 0 || g.totalVolumeMl > 0 || g.confirmedUnits > 0);
  }, [analytics]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-slate-300 border-t-[#B91C32] rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-600">Loading Camp Workspace...</p>
        </div>
      </div>
    );
  }

  // Sidebar navigation destinations with icons and badges
  const navItems: { id: CampNavPage; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; count?: number; restricted?: boolean }[] = [
    { id: 'overview', label: 'Overview', icon: IconDashboard },
    { id: 'donors', label: 'Donors & Attendance', icon: IconStaff, count: roster.length },
    { id: 'screening', label: 'Clinical Screening', icon: IconScreening, count: roster.filter((r) => r.status === 'CHECKED_IN' && !r.screening).length, restricted: currentRole !== 'CLINICAL_STAFF' && currentRole !== 'CAMP_ADMIN' },
    { id: 'collection', label: 'Collection & Units', icon: IconCollection, count: analytics?.units?.confirmed ?? 0 },
    { id: 'handover', label: 'Handover & Custody', icon: IconHandover, count: analytics?.units?.awaitingDispatch ?? 0 },
    { id: 'reports', label: 'Reports & Analytics', icon: IconReports, restricted: !canViewReports },
    { id: 'team', label: 'Camp Team', icon: IconStaff, count: staffList.length },
    { id: 'settings', label: 'Camp Settings', icon: IconSettings },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row text-slate-800">
      {/* ======================================================== */}
      {/* 1. PERSISTENT DESKTOP SIDEBAR (lg:flex)                 */}
      {/* ======================================================== */}
      <aside className="hidden lg:flex lg:flex-col w-64 bg-white border-r border-slate-200 shrink-0 sticky top-0 h-screen select-none z-30">
        {/* Subtle Workspace Context Header */}
        <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Camp Workspace
          </span>
          <span className="w-2 h-2 rounded-full bg-emerald-500" title="Workspace Active" />
        </div>

        {/* Camp Switcher (if multiple camps assigned) */}
        {assignedCamps.length > 1 && (
          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/50">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
              Active Camp
            </label>
            <select
              value={currentCamp?.id}
              onChange={(e) => {
                const selected = assignedCamps.find((c) => c.campId === e.target.value);
                if (selected) {
                  setCurrentRole(selected.role);
                  router.push(`/camp/dashboard?campId=${selected.campId}`);
                }
              }}
              className="w-full text-xs font-semibold py-1.5 px-2 bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-hidden"
            >
              {assignedCamps.map((c) => (
                <option key={c.campId} value={c.campId}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {navItems.map((item) => {
            if (item.restricted) return null;
            const isActive = activePage === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all cursor-pointer group ${
                  isActive
                    ? 'bg-red-50 text-[#C51F3A] font-bold border-l-2 border-[#C51F3A]'
                    : 'text-slate-600 hover:bg-slate-100/70 hover:text-slate-900 font-medium'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon size={18} className={isActive ? 'text-[#C51F3A]' : 'text-slate-400 group-hover:text-slate-600'} />
                  <span>{item.label}</span>
                </div>
                {item.count !== undefined && item.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    isActive ? 'bg-[#C51F3A]/10 text-[#C51F3A]' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Identity & Sign Out Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/50">
          <div className="flex items-center justify-between mb-2">
            <div className="min-w-0">
              <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                currentRole === 'CAMP_ADMIN' ? 'bg-purple-100 text-purple-800' :
                currentRole === 'CAMP_COORDINATOR' ? 'bg-indigo-100 text-indigo-800' :
                currentRole === 'CLINICAL_STAFF' ? 'bg-emerald-100 text-emerald-800' :
                'bg-amber-100 text-amber-800'
              }`}>
                {currentRole}
              </span>
            </div>
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} title={isLive ? 'Real-time connected' : 'Connecting'} />
          </div>

          <button
            onClick={handleSignOut}
            className="w-full py-1.5 px-3 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer text-center"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* 2. MAIN APPLICATION CONTENT AREA                         */}
      {/* ======================================================== */}
      <div className="flex-1 flex flex-col min-w-0 pb-24 lg:pb-10">
        {/* Compact Application Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-20 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                {currentCamp?.campCode}
              </span>
              {isCampClosed ? (
                <span className="text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-slate-900 text-white flex items-center gap-1 shadow-xs">
                  ● Archived — Read Only
                </span>
              ) : (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  currentCamp?.isReadyForCollection ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {currentCamp?.isReadyForCollection ? '● Ready for Collection' : 'Readiness Pending'}
                </span>
              )}
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                isLive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                {isLive ? 'Live' : 'Syncing'}
              </span>
              {currentCamp?.organisation?.name && (
                <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
                  • Parent: <strong className="text-slate-700">{currentCamp.organisation.name}</strong>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                {currentCamp?.title}
              </h1>
              {currentCamp?.venue && (
                <span className="text-xs text-slate-500 hidden md:inline">
                  • 📍 {currentCamp.venue}
                </span>
              )}
              {currentCamp?.targetDate && (
                <span className="text-xs text-slate-500 hidden lg:inline">
                  • 🗓️ {new Date(currentCamp.targetDate).toLocaleDateString()} {currentCamp.timeSlot ? `(${currentCamp.timeSlot})` : ''}
                </span>
              )}
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRefreshCamp}
              disabled={refreshingCamp}
              title="Refresh camp workspace"
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span className={refreshingCamp ? 'animate-spin inline-block' : ''}>↻</span>
              <span className="hidden sm:inline">Refresh</span>
            </button>

            {canRegisterWalkin && (
              <button
                onClick={() => {
                  setActivePage('donors');
                  setShowWalkinCard(true);
                }}
                className="px-3 py-1.5 bg-[#B91C32] hover:bg-[#9B1324] text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1"
              >
                <span>+</span>
                <span className="hidden sm:inline">Register Donor</span>
              </button>
            )}

            <button
              onClick={handleSignOut}
              className="lg:hidden px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Exit
            </button>
          </div>
        </header>

        {/* Closed Camp Read-Only Informational Banner */}
        {isCampClosed && (
          <div className="bg-slate-900 text-white px-4 sm:px-6 py-2.5 flex items-center justify-between text-xs border-b border-slate-800 shadow-xs">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-900 font-extrabold text-[10px] uppercase tracking-wider">
                Camp Closed
              </span>
              <span className="text-slate-300">
                This blood drive is formally closed and archived. Operational modifications are locked. Historical donor rosters, traceability manifests, and analytics reports remain fully accessible in read-only mode.
              </span>
            </div>
          </div>
        )}

        {/* Global Feedback Banners */}
        <div className="px-4 sm:px-6 pt-4 space-y-2">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-center justify-between shadow-xs">
              <span>⚠ {error}</span>
              <button onClick={() => setError(null)} className="text-red-700 hover:text-red-900 font-bold ml-2">✕</button>
            </div>
          )}
          {actionSuccess && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between shadow-xs">
              <span>✓ {actionSuccess}</span>
              <button onClick={() => setActionSuccess(null)} className="text-emerald-700 hover:text-emerald-900 font-bold ml-2">✕</button>
            </div>
          )}
        </div>

        {/* Dynamic Page Workspace Content */}
        <main className="p-4 sm:px-6 space-y-6 max-w-7xl w-full mx-auto">
          {/* ======================================================== */}
          {/* PAGE 1: OVERVIEW                                         */}
          {/* ======================================================== */}
          {activePage === 'overview' && (
            <div className="space-y-6">
              {/* Target Progress Bar (if expected donors target configured) */}
              {analytics?.expectedDonors > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Target Progress:</span>
                    <span className="text-sm font-extrabold text-slate-900">
                      {analytics.completedDonations} / {analytics.expectedDonors} Donors ({Math.round(analytics.targetCompletionPercentage || 0)}%)
                    </span>
                  </div>
                  <div className="w-full sm:w-64 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-[#B91C32] h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, analytics.targetCompletionPercentage || 0)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 4 to 6 Key Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
                  <div className="text-2xl font-black text-slate-900">
                    {analytics?.registeredDonors ?? counts?.registeredDonors ?? 0}
                  </div>
                  <div className="text-[10px] uppercase font-bold text-slate-500 mt-1">Registered Donors</div>
                </div>

                <div className="p-4 bg-white rounded-2xl border border-blue-200 bg-blue-50/20 shadow-xs">
                  <div className="text-2xl font-black text-blue-950">
                    {analytics?.checkedInDonors ?? counts?.checkedInDonors ?? 0}
                  </div>
                  <div className="text-[10px] uppercase font-bold text-blue-700 mt-1">Checked In</div>
                </div>

                <div className="p-4 bg-white rounded-2xl border border-purple-200 bg-purple-50/20 shadow-xs">
                  <div className="text-2xl font-black text-purple-950">
                    {analytics?.clearedScreeningDonors ?? counts?.clinicallyCleared ?? 0}
                  </div>
                  <div className="text-[10px] uppercase font-bold text-purple-700 mt-1">Clinically Cleared</div>
                </div>

                <div className="p-4 bg-white rounded-2xl border border-red-200 bg-red-50/20 shadow-xs">
                  <div className="text-2xl font-black text-[#B91C32]">
                    {analytics?.completedDonations ?? counts?.completedDonations ?? 0}
                  </div>
                  <div className="text-[10px] uppercase font-bold text-red-700 mt-1">Completed Donations</div>
                </div>

                <div className="p-4 bg-white rounded-2xl border border-amber-200 bg-amber-50/20 shadow-xs">
                  <div className="text-2xl font-black text-amber-950">
                    {analytics?.totalVolumeMl ? `${analytics.totalVolumeMl} mL` : '0 mL'}
                  </div>
                  <div className="text-[10px] uppercase font-bold text-amber-800 mt-1">
                    Volume ({analytics?.totalVolumeLiters || '0.00'} L)
                  </div>
                </div>

                <div className="p-4 bg-white rounded-2xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
                  <div className="text-2xl font-black text-emerald-950">
                    {analytics?.confirmedUnits ?? 0}
                  </div>
                  <div className="text-[10px] uppercase font-bold text-emerald-700 mt-1">Confirmed Units</div>
                </div>
              </div>

              {/* Middle Section: Compact Blood Group Summary & Recent Activity */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Compact Blood-Group Summary */}
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Blood Collection Summary</h3>
                      <p className="text-xs text-slate-500">Collected whole blood bags recorded on-site</p>
                    </div>
                    {canViewReports && (
                      <button
                        onClick={() => setActivePage('reports')}
                        className="text-xs font-bold text-[#B91C32] hover:text-[#9B1324] cursor-pointer"
                      >
                        View Full Report →
                      </button>
                    )}
                  </div>

                  {activeBloodGroups.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-500 font-medium">
                      No blood collections recorded yet for this camp.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
                      {activeBloodGroups.map((g: any) => (
                        <div key={g.bloodGroup} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-slate-900 text-sm">{g.label}</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-[#B91C32]">
                              {g.completedDonations} bags
                            </span>
                          </div>
                          <div className="text-xs font-mono text-slate-600 font-medium">
                            {g.totalVolumeMl} mL
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {g.confirmedUnits} confirmed
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent Activity Feed */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 mb-1">Recent Activity</h3>
                    <p className="text-xs text-slate-500 mb-4">Latest on-site camp milestones</p>

                    {recentActivity.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-4 text-center">No activity recorded yet</p>
                    ) : (
                      <div className="space-y-3">
                        {recentActivity.map((act) => (
                          <div key={act.id} className="text-xs flex items-start gap-2.5">
                            <span className="w-2 h-2 rounded-full bg-[#B91C32] mt-1 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-slate-800 leading-snug">{act.text}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${act.badgeColor}`}>
                                  {act.badge}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {act.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-100 mt-4">
                    <button
                      onClick={() => setActivePage('donors')}
                      className="w-full text-center text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      View Full Live Roster →
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Shortcuts */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Quick Operational Actions</h3>
                <div className="flex flex-wrap gap-2.5">
                  {canRegisterWalkin && (
                    <button
                      onClick={() => {
                        setActivePage('donors');
                        setShowWalkinCard(true);
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <span>➕</span> Register Donor
                    </button>
                  )}
                  <button
                    onClick={() => setActivePage('donors')}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <span>👥</span> Open Attendance Roster
                  </button>
                  {canScreenDonors && (
                    <button
                      onClick={() => setActivePage('screening')}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <span>🩺</span> Clinical Screening
                    </button>
                  )}
                  {canRecordDonations && (
                    <button
                      onClick={() => setActivePage('collection')}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <span>🩸</span> Phlebotomy &amp; Units
                    </button>
                  )}
                  <button
                    onClick={() => setActivePage('handover')}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <span>🚚</span> Handover Manifests
                  </button>
                  {canManageTeam && (
                    <button
                      onClick={() => setActivePage('team')}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <span>🛡️</span> Manage Team
                    </button>
                  )}
                  {canVerifyReadiness && (
                    <button
                      onClick={() => setShowReadinessModal(true)}
                      className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <span>✓</span> Verify Readiness
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* PAGE 2: DONORS & ATTENDANCE                              */}
          {/* ======================================================== */}
          {activePage === 'donors' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900 tracking-tight">Donors &amp; Attendance</h2>
                  <p className="text-xs text-slate-500">Walk-in enrollment, physical check-in, and eligibility verification</p>
                </div>
                {canRegisterWalkin && (
                  <button
                    onClick={() => setShowWalkinCard(!showWalkinCard)}
                    className="px-4 py-2 bg-[#B91C32] hover:bg-[#9B1324] text-white text-xs font-bold rounded-xl transition-colors shadow-xs cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
                  >
                    <span>{showWalkinCard ? '✕ Close Form' : '➕ Register Walk-in Donor'}</span>
                  </button>
                )}
              </div>

              {/* Phone-First Donor Registration Panel */}
              {showWalkinCard && canRegisterWalkin && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#C51F3A]">
                        Donor Lookup &amp; Camp Registration
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Search by 10-digit mobile number to enroll existing donors or register new walk-in arrivals.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowWalkinCard(false);
                        resetRegistrationState();
                      }}
                      className="text-slate-400 hover:text-slate-700 text-xs font-bold px-2 py-1 rounded-lg hover:bg-slate-100 cursor-pointer"
                    >
                      ✕ Close
                    </button>
                  </div>

                  {/* STAGE 1: INITIAL PHONE LOOKUP INPUT */}
                  {!lookupResult && (
                    <form onSubmit={handlePerformPhoneLookup} className="space-y-3">
                      <div className="max-w-md">
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Mobile Number (10 digits)
                        </label>
                        <div className="flex items-center gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-2.5 text-xs font-mono font-bold text-slate-400">
                              +91
                            </span>
                            <input
                              type="tel"
                              required
                              autoFocus
                              value={walkinPhone}
                              onChange={(e) => {
                                const clean = e.target.value.replace(/\D/g, '').slice(0, 10);
                                setWalkinPhone(clean);
                                setLookupError(null);
                              }}
                              placeholder="98220 12345"
                              maxLength={10}
                              className="w-full text-xs font-mono py-2 pl-12 pr-3 border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#C51F3A]"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={lookingUpDonor || walkinPhone.replace(/\D/g, '').length !== 10}
                            className="px-4 py-2 bg-[#C51F3A] hover:bg-[#A8172E] disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5 shrink-0"
                          >
                            {lookingUpDonor && <span className="animate-spin text-sm">↻</span>}
                            <span>{lookingUpDonor ? 'Searching...' : 'Find Donor'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowWalkinCard(false);
                              resetRegistrationState();
                            }}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>

                      {lookupError && (
                        <div className="p-3 bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl flex items-center justify-between">
                          <span>⚠ {lookupError}</span>
                          <button
                            type="button"
                            onClick={() => setLookupError(null)}
                            className="text-red-700 hover:text-red-900 font-bold ml-2"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </form>
                  )}

                  {/* STAGE 2A: EXISTING DONOR FOUND (NOT REGISTERED FOR THIS CAMP) */}
                  {lookupResult && lookupResult.found && !lookupResult.alreadyRegistered && lookupResult.donor && (
                    <div className="space-y-4">
                      <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 mb-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />
                          <span>Authoritative Donor Profile Located</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-500 block">Donor Name</span>
                            <span className="font-bold text-slate-900">{lookupResult.donor.name}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-500 block">Contact Phone</span>
                            <span className="font-mono text-slate-700">{lookupResult.donor.maskedPhone}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-500 block">Recorded Blood Group</span>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-bold text-slate-900">
                                {lookupResult.donor.bloodGroup ? lookupResult.donor.bloodGroup.replace('_POS', '+').replace('_NEG', '-') : 'Pending Verification'}
                              </span>
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-semibold">
                                {lookupResult.donor.provenanceLabel}
                              </span>
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-500 block">Eligibility Status</span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-bold inline-block mt-0.5 ${
                                lookupResult.donor.isEligible
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {lookupResult.donor.isEligible ? '● Eligible to Donate' : '⚠ Temporarily Deferred'}
                            </span>
                          </div>
                        </div>

                        {lookupResult.donor.eligibilityWarning && (
                          <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                            <strong>Note:</strong> {lookupResult.donor.eligibilityWarning}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={handleRegisterExistingDonor}
                          disabled={submittingWalkin}
                          className="px-4 py-2 bg-[#C51F3A] hover:bg-[#A8172E] disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                        >
                          {submittingWalkin && <span className="animate-spin text-sm">↻</span>}
                          <span>Register for This Camp</span>
                        </button>
                        <button
                          type="button"
                          onClick={resetRegistrationState}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                        >
                          Search Another Number
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STAGE 2B: ALREADY ENROLLED IN THIS CAMP */}
                  {lookupResult && lookupResult.found && lookupResult.alreadyRegistered && lookupResult.donor && (
                    <div className="space-y-4">
                      <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-bold text-blue-900">
                            <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
                            <span>Donor is Already Enrolled in this Camp Roster</span>
                          </div>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              lookupResult.existingAttendance?.status === 'CHECKED_IN'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            Status: {lookupResult.existingAttendance?.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-500 block">Donor Name</span>
                            <span className="font-bold text-slate-900">{lookupResult.donor.name}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-500 block">Contact</span>
                            <span className="font-mono text-slate-700">{lookupResult.donor.maskedPhone}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold text-slate-500 block">Screening / Donation Stage</span>
                            <span className="font-semibold text-slate-800">
                              {lookupResult.existingAttendance?.hasDonation
                                ? `Donation ${lookupResult.existingAttendance.donationOutcome}`
                                : lookupResult.existingAttendance?.hasScreening
                                ? `Screening ${lookupResult.existingAttendance.screeningStatus}`
                                : lookupResult.existingAttendance?.status === 'CHECKED_IN'
                                ? 'Awaiting Clinical Screening'
                                : 'Awaiting Arrival Check-In'}
                            </span>
                          </div>
                        </div>

                        {lookupResult.existingAttendance?.status === 'REGISTERED' && (
                          <p className="text-xs text-slate-600 bg-white/70 p-2.5 rounded-lg border border-blue-100">
                            This donor has pre-registered attendance. You can confirm physical arrival and check them in immediately:
                          </p>
                        )}

                        {lookupResult.existingAttendance?.status === 'CHECKED_IN' && (
                          <p className="text-xs text-slate-600 bg-white/70 p-2.5 rounded-lg border border-blue-100">
                            ✓ Donor has already checked in on-site. The record is active in the Clinical Screening queue.
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        {lookupResult.existingAttendance?.status === 'REGISTERED' && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (lookupResult.existingAttendance?.id) {
                                await handleCheckIn(lookupResult.existingAttendance.id);
                                setShowWalkinCard(false);
                                resetRegistrationState();
                              }
                            }}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
                          >
                            Confirm Arrival &amp; Check In Now →
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setSearchTerm(lookupResult.donor?.name || '');
                            setShowWalkinCard(false);
                            resetRegistrationState();
                          }}
                          className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                        >
                          Locate in Roster Table
                        </button>
                        <button
                          type="button"
                          onClick={resetRegistrationState}
                          className="px-3 py-2 bg-white border border-slate-200 text-slate-600 text-xs font-semibold rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          Search Another Number
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STAGE 2C: NEW WALK-IN REGISTRATION FORM */}
                  {lookupResult && !lookupResult.found && (
                    <div className="space-y-4">
                      <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between">
                        <span>
                          ℹ No existing donor profile located for <strong>+91 {walkinPhone}</strong>. Complete walk-in registration details:
                        </span>
                        <button
                          type="button"
                          onClick={resetRegistrationState}
                          className="text-amber-800 hover:text-amber-950 font-bold ml-2 underline text-[11px]"
                        >
                          Change Number
                        </button>
                      </div>

                      <form onSubmit={handleRegisterWalkin} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Mobile Number (Pre-filled)
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-xs font-mono font-bold text-slate-400">
                              +91
                            </span>
                            <input
                              type="tel"
                              readOnly
                              value={walkinPhone}
                              className="w-full text-xs font-mono py-2 pl-12 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:outline-hidden"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Donor Full Name *
                          </label>
                          <input
                            type="text"
                            required
                            autoFocus
                            value={walkinName}
                            onChange={(e) => setWalkinName(e.target.value)}
                            placeholder="e.g. Ramesh Kumar"
                            className="w-full text-xs py-2 px-3 border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#C51F3A]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            Blood Group
                          </label>
                          <select
                            value={walkinBloodGroup}
                            onChange={(e) => setWalkinBloodGroup(e.target.value)}
                            className="w-full text-xs py-2 px-3 border border-slate-200 rounded-xl bg-white focus:outline-hidden focus:border-[#C51F3A]"
                          >
                            <option value="UNKNOWN">Unknown / To be verified</option>
                            <option value="A_POS">A+ (A Positive)</option>
                            <option value="A_NEG">A- (A Negative)</option>
                            <option value="B_POS">B+ (B Positive)</option>
                            <option value="B_NEG">B- (B Negative)</option>
                            <option value="AB_POS">AB+ (AB Positive)</option>
                            <option value="AB_NEG">AB- (AB Negative)</option>
                            <option value="O_POS">O+ (O Positive)</option>
                            <option value="O_NEG">O- (O Negative)</option>
                          </select>
                        </div>

                        <div className="flex items-end gap-2">
                          <button
                            type="submit"
                            disabled={submittingWalkin || !walkinName.trim()}
                            className="flex-1 py-2 px-4 bg-[#C51F3A] hover:bg-[#A8172E] disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            {submittingWalkin && <span className="animate-spin text-sm">↻</span>}
                            <span>Register Walk-in</span>
                          </button>
                          <button
                            type="button"
                            onClick={resetRegistrationState}
                            className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              )}

              {/* Roster Controls & Filters */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search by donor name, phone, or unit ID..."
                      className="w-full text-xs py-2 pl-8 pr-3 border border-slate-200 rounded-xl focus:outline-hidden focus:border-[#B91C32]"
                    />
                    <span className="absolute left-2.5 top-2.5 text-xs text-slate-400">🔍</span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={filterBloodGroup}
                      onChange={(e) => setFilterBloodGroup(e.target.value)}
                      className="text-xs py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    >
                      <option value="ALL">All Blood Groups</option>
                      <option value="A_POS">A+</option>
                      <option value="A_NEG">A-</option>
                      <option value="B_POS">B+</option>
                      <option value="B_NEG">B-</option>
                      <option value="AB_POS">AB+</option>
                      <option value="AB_NEG">AB-</option>
                      <option value="O_POS">O+</option>
                      <option value="O_NEG">O-</option>
                      <option value="UNKNOWN">Unknown</option>
                    </select>

                    <select
                      value={filterAttendanceStatus}
                      onChange={(e) => setFilterAttendanceStatus(e.target.value)}
                      className="text-xs py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold"
                    >
                      <option value="ALL">All Attendance</option>
                      <option value="REGISTERED">Registered</option>
                      <option value="CHECKED_IN">Checked In</option>
                      <option value="CANCELLED">Cancelled</option>
                    </select>

                    {hasActiveFilters && (
                      <button
                        onClick={resetFilters}
                        className="text-xs font-bold text-slate-500 hover:text-slate-800 px-2 py-1"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 font-semibold">
                  Showing {filteredRoster.length} of {roster.length} registered donors
                </div>
              </div>

              {/* Attendance Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px] bg-slate-50">
                        <th className="py-2.5 px-4">Donor Name &amp; Contact</th>
                        <th className="py-2.5 px-4 text-center">Blood Group</th>
                        <th className="py-2.5 px-4 text-center">Attendance</th>
                        <th className="py-2.5 px-4 text-center">Eligibility</th>
                        <th className="py-2.5 px-4 text-center">Screening</th>
                        <th className="py-2.5 px-4 text-center">Donation</th>
                        <th className="py-2.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {filteredRoster.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                            No donor attendance records match your filter criteria.
                          </td>
                        </tr>
                      ) : (
                        filteredRoster.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/60">
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900">{item.donorName}</div>
                              <div className="text-[10px] font-mono text-slate-500">{item.donorPhone}</div>
                            </td>
                            <td className="py-3 px-4 text-center font-bold text-slate-900">
                              {item.bloodGroup || item.donationEvent?.bloodGroup || '—'}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                item.status === 'CHECKED_IN' ? 'bg-blue-100 text-blue-800' :
                                item.status === 'CANCELLED' ? 'bg-slate-100 text-slate-600' : 'bg-slate-100 text-slate-700'
                              }`}>
                                {item.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                item.eligibility?.isEligible ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {item.eligibility?.isEligible ? 'ELIGIBLE' : 'DEFERRED'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                item.screening?.status === 'CLEARED' ? 'bg-purple-100 text-purple-800' :
                                item.screening?.status === 'DEFERRED' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
                              }`}>
                                {item.screening?.status || 'PENDING'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                item.donationEvent?.outcome === 'COMPLETED' ? 'bg-red-100 text-[#B91C32]' : 'bg-slate-100 text-slate-500'
                              }`}>
                                {item.donationEvent?.outcome || 'NOT_DONE'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              {item.status === 'REGISTERED' && (
                                <button
                                  onClick={() => handleCheckIn(item.id)}
                                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                                >
                                  Check In →
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* PAGE 3: CLINICAL SCREENING                               */}
          {/* ======================================================== */}
          {activePage === 'screening' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900 tracking-tight">Clinical Screening Workspace</h2>
                  <p className="text-xs text-slate-500">Informed consent confirmation, physical assessment, and donor deferral management</p>
                </div>
                {!canScreenDonors && (
                  <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-xl">
                    ℹ Read-Only (Requires Clinical Staff role)
                  </span>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Checked-In Donors for Clinical Evaluation</h3>
                  <span className="text-xs font-bold text-purple-700">
                    {roster.filter((r) => r.status === 'CHECKED_IN').length} checked in
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                        <th className="py-2.5 px-4">Donor Name</th>
                        <th className="py-2.5 px-4 text-center">Blood Group</th>
                        <th className="py-2.5 px-4 text-center">Check-In Time</th>
                        <th className="py-2.5 px-4 text-center">Screening Status</th>
                        <th className="py-2.5 px-4 text-center">Decision</th>
                        <th className="py-2.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {roster.filter((r) => r.status === 'CHECKED_IN').length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                            No checked-in donors awaiting screening. Check in donors under Donors &amp; Attendance.
                          </td>
                        </tr>
                      ) : (
                        roster
                          .filter((r) => r.status === 'CHECKED_IN')
                          .map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/60">
                              <td className="py-3 px-4 font-bold text-slate-900">
                                {item.donorName}
                              </td>
                              <td className="py-3 px-4 text-center font-bold">
                                {item.bloodGroup || '—'}
                              </td>
                              <td className="py-3 px-4 text-center font-mono text-slate-500">
                                {item.checkedInAt ? new Date(item.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  item.screening?.status === 'CLEARED' ? 'bg-purple-100 text-purple-800' :
                                  item.screening?.status === 'DEFERRED' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {item.screening?.status || 'PENDING'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-center text-slate-600">
                                {item.screening?.eligibilityDecision || 'Pending evaluation'}
                              </td>
                              <td className="py-3 px-4 text-right">
                                {canScreenDonors && (
                                  <button
                                    onClick={() => setScreeningAttendee(item)}
                                    className="px-2.5 py-1 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                                  >
                                    {item.screening ? 'Re-Evaluate →' : 'Evaluate Screening →'}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* PAGE 4: COLLECTION & UNITS                              */}
          {/* ======================================================== */}
          {activePage === 'collection' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900 tracking-tight">Collection &amp; Traceable Units</h2>
                  <p className="text-xs text-slate-500">Phlebotomy volume recording, collection confirmation, and 1:1 unit bag labeling</p>
                </div>
                {!canRecordDonations && (
                  <span className="px-3 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded-xl">
                    ℹ Read-Only (Requires Collection Staff role)
                  </span>
                )}
              </div>

              {/* Cleared Donors ready for Phlebotomy */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Clinically Cleared Donors Ready for Collection</h3>
                  <span className="text-xs font-bold text-red-700">
                    {roster.filter((r) => r.screening?.status === 'CLEARED' && !r.donationEvent).length} pending
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                        <th className="py-2.5 px-4">Donor Name</th>
                        <th className="py-2.5 px-4 text-center">Group</th>
                        <th className="py-2.5 px-4 text-center">Screened Decision</th>
                        <th className="py-2.5 px-4 text-center">Status</th>
                        <th className="py-2.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {roster.filter((r) => r.screening?.status === 'CLEARED' && !r.donationEvent).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                            No cleared donors awaiting phlebotomy. Donors must be clinically cleared first.
                          </td>
                        </tr>
                      ) : (
                        roster
                          .filter((r) => r.screening?.status === 'CLEARED' && !r.donationEvent)
                          .map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/60">
                              <td className="py-3 px-4 font-bold text-slate-900">{item.donorName}</td>
                              <td className="py-3 px-4 text-center font-bold">{item.bloodGroup || '—'}</td>
                              <td className="py-3 px-4 text-center text-purple-700 font-semibold">{item.screening?.eligibilityDecision}</td>
                              <td className="py-3 px-4 text-center">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                  Awaiting Phlebotomy
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right">
                                {canRecordDonations && (
                                  <button
                                    onClick={() => setDonationAttendee(item)}
                                    className="px-2.5 py-1 bg-[#B91C32] hover:bg-[#9B1324] text-white rounded-lg text-[10px] font-bold cursor-pointer"
                                  >
                                    Record Donation →
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Confirmed Collection Units Ledger */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Confirmed Collection Units (Bags)</h3>
                  <span className="text-xs font-bold text-emerald-700">
                    {roster.filter((r) => r.donationEvent?.collectionUnit).length} units logged
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                        <th className="py-2.5 px-4">Unit Number</th>
                        <th className="py-2.5 px-4">Donor Name</th>
                        <th className="py-2.5 px-4 text-center">Group</th>
                        <th className="py-2.5 px-4 text-center">Volume (mL)</th>
                        <th className="py-2.5 px-4 text-center">Custody Status</th>
                        <th className="py-2.5 px-4 text-right">Confirmation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {roster.filter((r) => r.donationEvent).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                            No collection records yet.
                          </td>
                        </tr>
                      ) : (
                        roster
                          .filter((r) => r.donationEvent)
                          .map((item) => {
                            const unit = item.donationEvent?.collectionUnit;
                            return (
                              <tr key={item.id} className="hover:bg-slate-50/60">
                                <td className="py-3 px-4 font-mono font-bold text-slate-900">
                                  {unit?.unitNumber || <span className="text-amber-600 font-sans font-bold">Unconfirmed Bag</span>}
                                </td>
                                <td className="py-3 px-4 font-semibold text-slate-800">{item.donorName}</td>
                                <td className="py-3 px-4 text-center font-bold text-slate-900">{item.donationEvent?.bloodGroup}</td>
                                <td className="py-3 px-4 text-center font-mono">{item.donationEvent?.volumeMl || 450} mL</td>
                                <td className="py-3 px-4 text-center">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    unit?.status === 'RECEIVED_BY_CENTRE' ? 'bg-emerald-100 text-emerald-800' :
                                    unit?.status === 'IN_TRANSIT' ? 'bg-blue-100 text-blue-800' :
                                    unit ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                                  }`}>
                                    {unit?.status || 'AWAITING_CONFIRMATION'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  {!unit && canConfirmUnits && (
                                    <button
                                      onClick={() => handleConfirmUnit(item.donationEvent!.id)}
                                      disabled={confirmingUnitId === item.donationEvent!.id}
                                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                                    >
                                      {confirmingUnitId === item.donationEvent!.id ? 'Confirming...' : 'Confirm Bag ✓'}
                                    </button>
                                  )}
                                  {unit && (
                                    <span className="text-emerald-700 font-bold text-[11px]">✓ Confirmed</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* PAGE 5: HANDOVER & CUSTODY TRANSIT                       */}
          {/* ======================================================== */}
          {activePage === 'handover' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900 tracking-tight">Camp-to-Bank Handover &amp; Custody</h2>
                  <p className="text-xs text-slate-500">Prepare collection manifests, dispatch cold-chain transport, and track parent bank intake</p>
                </div>
                <div className="text-xs font-bold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs">
                  Parent Centre: <strong className="text-slate-900">{currentCamp?.organisation?.name || 'Parent Blood Bank'}</strong>
                </div>
              </div>

              {/* Custody Lifecycle Cards */}
              {(() => {
                const activeManifest = handoverData?.manifest || handoverData?.activeManifest;
                const eligibleUnitsFromList = (handoverData?.units || []).filter(
                  (u) => (u.status === 'COLLECTED' || u.status === 'PREPARED_FOR_HANDOVER') && !u.activeManifest
                );
                const eligibleCount = handoverData?.summary?.eligibleUnitsCount ?? handoverData?.summary?.eligibleCount ?? eligibleUnitsFromList.length;
                const inTransitCount = handoverData?.summary?.inTransitUnitsCount ?? handoverData?.summary?.inTransitCount ?? analytics?.dispatchedUnits ?? 0;
                const receivedCount = handoverData?.summary?.receivedUnitsCount ?? handoverData?.summary?.receivedCount ?? analytics?.receivedUnits ?? 0;

                return (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs">
                        <div className="text-2xl font-black text-slate-900">{eligibleCount}</div>
                        <div className="text-xs font-bold uppercase tracking-tight text-slate-500 mt-1">Ready for Handover</div>
                        <p className="text-[10px] text-slate-400 mt-0.5">Confirmed units held on-site awaiting dispatch</p>
                      </div>
                      <div className="p-4 bg-white rounded-2xl border border-blue-200 bg-blue-50/20 shadow-xs">
                        <div className="text-2xl font-black text-blue-900">{inTransitCount}</div>
                        <div className="text-xs font-bold uppercase tracking-tight text-blue-700 mt-1">In Cold-Chain Transit</div>
                        <p className="text-[10px] text-blue-600 mt-0.5">Dispatched to parent blood bank</p>
                      </div>
                      <div className="p-4 bg-white rounded-2xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
                        <div className="text-2xl font-black text-emerald-900">{receivedCount}</div>
                        <div className="text-xs font-bold uppercase tracking-tight text-emerald-700 mt-1">Received &amp; Reconciled</div>
                        <p className="text-[10px] text-emerald-600 mt-0.5">Verified &amp; accepted into blood bank inventory</p>
                      </div>
                    </div>

                    {/* Active Manifest Banner (if manifest exists) */}
                    {activeManifest && (
                      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Transfer Manifest:</span>
                              <span className="font-mono font-bold text-sm text-slate-900">{activeManifest.manifestNumber}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">
                              Transferred to <strong className="text-slate-800">{activeManifest.receivingOrganisation?.name || currentCamp?.organisation?.name}</strong> {activeManifest.receivingOrganisation?.orgCode ? `(${activeManifest.receivingOrganisation.orgCode})` : ''}
                            </p>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold self-start sm:self-auto ${
                            activeManifest.status === 'RECONCILED' ? 'bg-emerald-100 text-emerald-800' :
                            activeManifest.status === 'RECEIVED_WITH_DISCREPANCIES' ? 'bg-red-100 text-red-800' :
                            activeManifest.status === 'PARTIALLY_RECEIVED' ? 'bg-amber-100 text-amber-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            ● {activeManifest.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Courier / Carrier</span>
                            <span className="font-semibold text-slate-800">{activeManifest.transportDetails?.courierName || 'Dedicated Cold Van'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Vehicle Reg.</span>
                            <span className="font-mono font-semibold text-slate-800">{activeManifest.transportDetails?.vehicleNumber || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Cold Box Temp</span>
                            <span className="font-mono font-semibold text-slate-800">{activeManifest.transportDetails?.coldBoxTempCelsius ?? 4.0} °C</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Dispatched At</span>
                            <span className="text-slate-800">{activeManifest.dispatchedAt ? new Date(activeManifest.dispatchedAt).toLocaleTimeString() : 'N/A'}</span>
                          </div>
                        </div>

                        {activeManifest.notes && (
                          <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
                            <strong className="text-slate-700">Dispatch Notes:</strong> {activeManifest.notes}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Units Manifest Preparation & Traceability Ledger */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Camp Collection Units</h3>
                    <p className="text-[11px] text-slate-500">Authoritative collection units and statutory custody states</p>
                  </div>
                  <span className="text-xs font-bold text-slate-700">
                    Total: {handoverData?.summary?.totalUnits ?? 0} units ({handoverData?.summary?.totalVolumeMl ?? 0} mL)
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px] bg-slate-50/50">
                        <th className="py-2.5 px-4">Unit Identifier</th>
                        <th className="py-2.5 px-3">Donation Ref</th>
                        <th className="py-2.5 px-3 text-center">Group</th>
                        <th className="py-2.5 px-3 text-center">Volume (mL)</th>
                        <th className="py-2.5 px-3 text-center">Custody State</th>
                        <th className="py-2.5 px-4 text-right">Collection Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {loadingHandover ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                            Loading handover units...
                          </td>
                        </tr>
                      ) : !handoverData?.units || handoverData.units.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                            No collection units confirmed for this camp yet. Complete donor phlebotomy and confirm collection bags in the Collection tab.
                          </td>
                        </tr>
                      ) : (
                        handoverData.units.map((unit) => (
                          <tr key={unit.id} className="hover:bg-slate-50/60">
                            <td className="py-3 px-4 font-mono font-bold text-slate-900">
                              {unit.unitNumber}
                            </td>
                            <td className="py-3 px-3 font-mono text-[11px] text-slate-500">
                              {unit.donationEventId?.slice(0, 10)}...
                            </td>
                            <td className="py-3 px-3 text-center font-bold text-slate-900">
                              {unit.bloodGroup}
                            </td>
                            <td className="py-3 px-3 text-center font-mono">
                              {unit.volumeMl} mL
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                unit.status === 'RECEIVED_BY_CENTRE' || unit.status === 'PROCESSING_COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                                unit.status === 'IN_TRANSIT' ? 'bg-blue-100 text-blue-800' :
                                'bg-amber-100 text-amber-800'
                              }`}>
                                {unit.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right text-slate-500 text-[11px]">
                              {unit.collectedAt ? new Date(unit.collectedAt).toLocaleTimeString() : 'N/A'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Handover Submission Action Card */}
              {!canSubmitHandover && !isCampClosed && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-xs text-slate-600 flex items-center gap-3">
                  <span className="text-base">🔒</span>
                  <div>
                    <span className="font-bold text-slate-800 block">Restricted Operational Procedure</span>
                    Final blood transfer and handover manifest submission is strictly restricted to authorized Collection Staff and Camp Admin.
                  </div>
                </div>
              )}
              {canSubmitHandover && !isCampClosed && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-900">Submit Handover Manifest to Parent Blood Bank</h3>
                    <p className="text-xs text-slate-500">
                      Dispatches all on-site collection units held in camp custody to <strong>{currentCamp?.organisation?.name}</strong> under statutory cold-chain custody.
                    </p>
                  </div>

                  {(() => {
                    const eligibleUnitsList = (handoverData?.units || []).filter(
                      (u) => (u.status === 'COLLECTED' || u.status === 'PREPARED_FOR_HANDOVER') && !u.activeManifest
                    );
                    const eligibleCount = handoverData?.summary?.eligibleUnitsCount ?? handoverData?.summary?.eligibleCount ?? eligibleUnitsList.length;
                    const eligibleVolume = handoverData?.summary?.eligibleVolumeMl ?? eligibleUnitsList.reduce((acc, u) => acc + (u.volumeMl || 450), 0);

                    if (eligibleCount === 0) {
                      return (
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
                          ℹ All confirmed units have either already been dispatched or reconciled by the parent blood bank. No additional units are currently awaiting handover.
                        </div>
                      );
                    }

                    return (
                      <form onSubmit={handleSubmitHandover} className="space-y-4">
                        <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-xl text-xs space-y-1">
                          <div className="font-bold text-amber-900">Transfer Manifest Summary</div>
                          <div className="text-amber-800">
                            Transferring <strong>{eligibleCount} unit(s)</strong> ({eligibleVolume} mL) to <strong>{currentCamp?.organisation?.name}</strong>.
                          </div>
                        </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Carrier / Logistics Name</label>
                          <input
                            type="text"
                            required
                            value={transportCourierName}
                            onChange={(e) => setTransportCourierName(e.target.value)}
                            placeholder="e.g. Dedicated Cold-Chain Van"
                            className="w-full py-2 px-3 border border-slate-200 rounded-xl text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Vehicle Number</label>
                          <input
                            type="text"
                            value={transportVehicleNumber}
                            onChange={(e) => setTransportVehicleNumber(e.target.value)}
                            placeholder="e.g. MH-12-BB-2026"
                            className="w-full py-2 px-3 border border-slate-200 rounded-xl text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Driver Phone Number</label>
                          <input
                            type="text"
                            value={transportDriverPhone}
                            onChange={(e) => setTransportDriverPhone(e.target.value)}
                            placeholder="e.g. 9876543210"
                            className="w-full py-2 px-3 border border-slate-200 rounded-xl text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Cold Box Temp (°C)</label>
                          <input
                            type="number"
                            step="0.1"
                            value={transportColdBoxTemp}
                            onChange={(e) => setTransportColdBoxTemp(e.target.value)}
                            className="w-full py-2 px-3 border border-slate-200 rounded-xl text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 mb-1">Dispatch &amp; Custody Notes (Optional)</label>
                        <textarea
                          value={transportNotes}
                          onChange={(e) => setTransportNotes(e.target.value)}
                          placeholder="e.g. Temperature monitored in sealed cooler box; ice packs verified."
                          className="w-full p-2.5 border border-slate-200 rounded-xl text-xs"
                          rows={2}
                        />
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="submit"
                          disabled={submittingHandover}
                          className="px-5 py-2.5 bg-[#B91C32] hover:bg-[#9B1324] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-2"
                        >
                          <span>🚚</span>
                          <span>{submittingHandover ? 'Submitting Handover...' : 'Submit Handover to Parent Blood Bank'}</span>
                        </button>
                      </div>
                    </form>
                  );
                })()}
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* PAGE 6: REPORTS & FULL BLOOD-GROUP ANALYTICS             */}
          {/* ======================================================== */}
          {activePage === 'reports' && !canViewReports && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center max-w-lg mx-auto shadow-xs">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mx-auto mb-3">
                <IconReports size={24} />
              </div>
              <h3 className="text-base font-bold text-slate-900 mb-1">Restricted Operational Area</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Full Camp Reports &amp; Blood-Group Analytics are restricted to Camp Administrators and authorized Collection Staff. Coordinators and Clinical Screening Staff are restricted to on-site coordination and screening workflows.
              </p>
            </div>
          )}
          {activePage === 'reports' && canViewReports && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900 tracking-tight">Full Blood-Group Analytics &amp; Reports</h2>
                  <p className="text-xs text-slate-500">Authoritative collection volumes, stage progression, and reconciliation accounting</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => currentCamp?.id && loadCampData(currentCamp.id)}
                    className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                    title="Refresh report analytics"
                  >
                    <span>↻</span>
                    <span>Refresh Data</span>
                  </button>
                  <div className="text-xs font-bold text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs">
                    Total Volume: <span className="text-[#B91C32]">{analytics?.totalVolumeMl || 0} mL</span> ({analytics?.totalVolumeLiters || '0.00'} L)
                  </div>
                </div>
              </div>

              {/* Full 9-row Blood-Group Analytics Table */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px] bg-slate-50">
                        <th className="py-3 px-3">Blood Group</th>
                        <th className="py-3 px-2 text-center">Registered</th>
                        <th className="py-3 px-2 text-center">Checked In</th>
                        <th className="py-3 px-2 text-center">Screened</th>
                        <th className="py-3 px-2 text-center">Completed</th>
                        <th className="py-3 px-2 text-center">Volume (mL)</th>
                        <th className="py-3 px-2 text-center">Confirmed Units</th>
                        <th className="py-3 px-2 text-center">Awaiting Dispatch</th>
                        <th className="py-3 px-2 text-center">In Transit</th>
                        <th className="py-3 px-2 text-center">Received</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {loadingRoster && !analytics ? (
                        <tr>
                          <td colSpan={10} className="py-12 text-center text-xs text-slate-500">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <div className="w-6 h-6 border-2 border-slate-300 border-t-[#B91C32] rounded-full animate-spin" />
                              <span className="font-semibold text-slate-600">Loading authoritative blood-group analytics...</span>
                            </div>
                          </td>
                        </tr>
                      ) : (analytics?.byBloodGroup || analytics?.bloodGroups || []).length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-10 text-center text-xs text-slate-500">
                            <div className="max-w-xs mx-auto space-y-2">
                              <p className="font-semibold text-slate-600">No blood collection analytics available yet.</p>
                              <button
                                onClick={() => currentCamp?.id && loadCampData(currentCamp.id)}
                                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                              >
                                Retry Loading Analytics
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        (analytics.byBloodGroup || analytics.bloodGroups).map((g: any) => (
                          <tr key={g.bloodGroup} className="hover:bg-slate-50/60">
                            <td className="py-3 px-3 font-bold text-slate-900 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-[#B91C32] inline-block" />
                              <span>{g.label || g.bloodGroup}</span>
                            </td>
                            <td className="py-3 px-2 text-center font-bold text-slate-800">{g.registeredDonors ?? 0}</td>
                            <td className="py-3 px-2 text-center">{g.checkedInDonors ?? 0}</td>
                            <td className="py-3 px-2 text-center">{g.screenedDonors ?? 0}</td>
                            <td className="py-3 px-2 text-center font-bold text-[#B91C32]">{g.completedDonations ?? 0}</td>
                            <td className="py-3 px-2 text-center font-mono text-slate-700">{g.totalVolumeMl > 0 ? `${g.totalVolumeMl} mL` : '0 mL'}</td>
                            <td className="py-3 px-2 text-center font-bold">{g.confirmedUnits ?? 0}</td>
                            <td className="py-3 px-2 text-center text-slate-600">{g.awaitingDispatchUnits ?? 0}</td>
                            <td className="py-3 px-2 text-center text-blue-700">{g.dispatchedUnits ?? 0}</td>
                            <td className="py-3 px-2 text-center text-emerald-700 font-bold">{g.receivedUnits ?? 0}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-50 font-black text-slate-900 text-xs">
                        <td className="py-3 px-3 uppercase text-[11px]">Total Camp Collection</td>
                        <td className="py-3 px-2 text-center">{analytics?.registeredDonors ?? 0}</td>
                        <td className="py-3 px-2 text-center">{analytics?.checkedInDonors ?? 0}</td>
                        <td className="py-3 px-2 text-center">{analytics?.screenedDonors ?? 0}</td>
                        <td className="py-3 px-2 text-center text-[#B91C32]">{analytics?.completedDonations ?? 0}</td>
                        <td className="py-3 px-2 text-center font-mono">{analytics?.totalVolumeMl ?? 0} mL</td>
                        <td className="py-3 px-2 text-center">{analytics?.confirmedUnits ?? 0}</td>
                        <td className="py-3 px-2 text-center">{analytics?.awaitingDispatchUnits ?? 0}</td>
                        <td className="py-3 px-2 text-center text-blue-700">{analytics?.dispatchedUnits ?? 0}</td>
                        <td className="py-3 px-2 text-center text-emerald-700">{analytics?.receivedUnits ?? 0}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* PAGE 7: CAMP TEAM                                        */}
          {/* ======================================================== */}
          {activePage === 'team' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900 tracking-tight">Camp Team &amp; Role Management</h2>
                  <p className="text-xs text-slate-500">Authorized personnel assignments for coordination, screening, and collection</p>
                </div>
                {canManageTeam && (
                  <button
                    onClick={() => setShowStaffModal(true)}
                    className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-xl transition-colors shadow-xs cursor-pointer flex items-center gap-1.5 self-start sm:self-auto"
                  >
                    <span>➕</span> Assign Team Member
                  </button>
                )}
              </div>

              {/* Staff Roster */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Active Staff Assignments ({staffList.length})</h3>
                  <span className="text-xs text-slate-500 font-medium">Scoped to {currentCamp?.campCode}</span>
                </div>

                <div className="divide-y divide-slate-100">
                  {staffList.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">No additional team members assigned yet.</div>
                  ) : (
                    staffList.map((member) => (
                      <div key={member.id} className="p-4 flex items-center justify-between hover:bg-slate-50/60">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{member.user?.name || 'Staff Member'}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              member.role === 'CAMP_ADMIN' ? 'bg-purple-100 text-purple-800' :
                              member.role === 'CAMP_COORDINATOR' ? 'bg-indigo-100 text-indigo-800' :
                              member.role === 'CLINICAL_STAFF' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {member.role}
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 mt-0.5">{member.user?.phoneNumber}</div>
                        </div>

                        {canManageTeam && member.role === 'CAMP_COORDINATOR' && (
                          <button
                            onClick={() => handleRevokeStaffMember(member.id)}
                            className="px-2.5 py-1 text-[11px] font-bold text-red-700 hover:bg-red-50 rounded-lg border border-red-200 transition-colors cursor-pointer"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* PAGE 8: CAMP SETTINGS & READINESS                        */}
          {/* ======================================================== */}
          {activePage === 'settings' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-black text-slate-900 tracking-tight">Camp Settings &amp; Readiness</h2>
                <p className="text-xs text-slate-500">Operational readiness boundary verification and camp configuration</p>
              </div>

              {/* Readiness Status Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Operational Readiness Boundary</h3>
                    <p className="text-xs text-slate-500">Statutory protocol verification prior to blood collection</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    currentCamp?.isReadyForCollection ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {currentCamp?.isReadyForCollection ? '✓ Verified & Authorized' : '⏳ Pending Verification'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-100">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="font-bold text-slate-800">1. Staffing:</span> Authorized personnel on-site
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="font-bold text-slate-800">2. Cold-Chain:</span> Transport containers &amp; monitoring verified
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="font-bold text-slate-800">3. Emergency Kit:</span> Epinephrine &amp; first-aid available
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <span className="font-bold text-slate-800">4. Consumables:</span> Sterile collection bags &amp; needles stocked
                  </div>
                </div>

                {canVerifyReadiness && !currentCamp?.isReadyForCollection && (
                  <div className="pt-2">
                    <button
                      onClick={() => setShowReadinessModal(true)}
                      className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      Complete Readiness Verification →
                    </button>
                  </div>
                )}
              </div>

              {/* Metadata Details */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
                <h3 className="text-sm font-bold text-slate-900 mb-3">Camp Registration Record</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 font-bold block text-[10px] uppercase">Tracking Code</span>
                    <span className="font-mono font-bold text-slate-900">{currentCamp?.campCode}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold block text-[10px] uppercase">Organizer Name</span>
                    <span className="font-bold text-slate-900">{currentCamp?.organizerName}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold block text-[10px] uppercase">Coordinator Contact</span>
                    <span className="font-mono font-bold text-slate-900">{currentCamp?.coordinatorContact || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold block text-[10px] uppercase">Expected Target</span>
                    <span className="font-bold text-slate-900">{currentCamp?.expectedDonors} donors</span>
                  </div>
                </div>
              </div>

              {/* Formal Camp Closure & Archival Section */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Camp Lifecycle &amp; Formal Closure</h3>
                    <p className="text-xs text-slate-500">
                      Authoritative closure verification, operational access revocation, and statutory archival
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold self-start sm:self-auto ${
                    isCampClosed ? 'bg-slate-900 text-white' :
                    closureReadiness?.isReady ? 'bg-emerald-100 text-emerald-800' :
                    'bg-amber-100 text-amber-800'
                  }`}>
                    {isCampClosed ? '● Closed & Archived' : closureReadiness?.isReady ? '✓ Ready for Closure' : '⏳ Prerequisites Pending'}
                  </span>
                </div>

                {isCampClosed ? (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-2">
                    <p className="font-semibold text-slate-900">
                      ✓ This camp drive has been formally closed and archived.
                    </p>
                    <p className="text-slate-600">
                      All operational modifications are prohibited. Active staff operational privileges for this camp have been deactivated, while historical staff assignment records, donor attendance histories, and audit logs remain permanently preserved.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Closure Readiness Assessment Summary */}
                    {loadingClosureReadiness ? (
                      <div className="py-4 text-center text-xs text-slate-500">
                        Checking authoritative closure prerequisites...
                      </div>
                    ) : closureReadiness ? (
                      <div className="space-y-3">
                        {closureReadiness.blockers.length > 0 ? (
                          <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl text-xs space-y-2">
                            <div className="font-bold text-amber-900 flex items-center gap-1.5">
                              <span>⚠</span>
                              <span>Closure Blocked — Outstanding Operational Work:</span>
                            </div>
                            <ul className="list-disc pl-5 space-y-1 text-amber-800 font-medium">
                              {closureReadiness.blockers.map((b, idx) => (
                                <li key={idx}>{b}</li>
                              ))}
                            </ul>
                          </div>
                        ) : (
                          <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs space-y-1">
                            <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                              <span>✓</span>
                              <span>All Closure Conditions Satisfied</span>
                            </div>
                            <p className="text-emerald-800">
                              All donor attendances are resolved, zero collection units remain in camp custody, and all handover manifests are fully reconciled with zero open discrepancies.
                            </p>
                          </div>
                        )}

                        {closureReadiness.metrics && (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs pt-1">
                            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                              <span className="text-[10px] text-slate-400 font-bold uppercase block">Completed Donations</span>
                              <span className="text-sm font-bold text-slate-900">{closureReadiness.metrics.totalDonations}</span>
                            </div>
                            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                              <span className="text-[10px] text-slate-400 font-bold uppercase block">Confirmed Units</span>
                              <span className="text-sm font-bold text-slate-900">{closureReadiness.metrics.totalConfirmedUnits}</span>
                            </div>
                            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                              <span className="text-[10px] text-slate-400 font-bold uppercase block">Reconciled at Bank</span>
                              <span className="text-sm font-bold text-emerald-700">{closureReadiness.metrics.totalReceivedUnits}</span>
                            </div>
                            <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                              <span className="text-[10px] text-slate-400 font-bold uppercase block">Open Discrepancies</span>
                              <span className={`text-sm font-bold ${closureReadiness.metrics.openExceptions > 0 ? 'text-red-700' : 'text-slate-900'}`}>
                                {closureReadiness.metrics.openExceptions}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : null}

                    {canCloseCamp && (
                      <div className="pt-2 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => currentCamp?.id && loadClosureReadiness(currentCamp.id)}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                        >
                          ↻ Re-check Prerequisites
                        </button>

                        <button
                          type="button"
                          disabled={!closureReadiness?.isReady || closingCamp}
                          onClick={() => setShowCloseCampModal(true)}
                          className="px-4 py-2 bg-slate-900 hover:bg-black disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                        >
                          <span>🔒</span>
                          <span>Initiate Formal Camp Closure →</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ======================================================== */}
      {/* 3. MOBILE FIVE-ITEM BOTTOM NAVIGATION (lg:hidden)        */}
      {/* ======================================================== */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 flex items-center justify-around shadow-lg">
        <button
          onClick={() => setActivePage('overview')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all cursor-pointer ${
            activePage === 'overview' ? 'text-[#C51F3A] font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <IconDashboard size={18} />
          <span className="text-[10px] mt-0.5">Home</span>
        </button>

        <button
          onClick={() => setActivePage('donors')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all cursor-pointer relative ${
            activePage === 'donors' ? 'text-[#C51F3A] font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <IconStaff size={18} />
          <span className="text-[10px] mt-0.5">Donors</span>
          {roster.length > 0 && (
            <span className="absolute top-0 right-1 w-2 h-2 rounded-full bg-[#C51F3A]" />
          )}
        </button>

        {canScreenDonors && (
          <button
            onClick={() => setActivePage('screening')}
            className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all cursor-pointer ${
              activePage === 'screening' ? 'text-[#C51F3A] font-bold' : 'text-slate-500 font-medium'
            }`}
          >
            <IconScreening size={18} />
            <span className="text-[10px] mt-0.5">Screening</span>
          </button>
        )}

        <button
          onClick={() => setActivePage('collection')}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all cursor-pointer ${
            activePage === 'collection' ? 'text-[#C51F3A] font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <IconCollection size={18} />
          <span className="text-[10px] mt-0.5">Collection</span>
        </button>

        <button
          onClick={() => setShowMobileMore(true)}
          className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all cursor-pointer ${
            showMobileMore ? 'text-[#C51F3A] font-bold' : 'text-slate-500 font-medium'
          }`}
        >
          <IconMenu size={18} />
          <span className="text-[10px] mt-0.5">More</span>
        </button>
      </nav>

      {/* ======================================================== */}
      {/* 4. MOBILE MORE DRAWER / MODAL                            */}
      {/* ======================================================== */}
      {showMobileMore && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end justify-center lg:hidden">
          <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 space-y-4 shadow-2xl border-t border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">More Destinations</h3>
              <button
                onClick={() => setShowMobileMore(false)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
              <button
                onClick={() => {
                  setActivePage('handover');
                  setShowMobileMore(false);
                }}
                className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-left flex items-center gap-2.5 text-slate-700"
              >
                <IconHandover size={16} className="text-slate-500" />
                <span>Handover</span>
              </button>

              {canViewReports && (
                <button
                  onClick={() => {
                    setActivePage('reports');
                    setShowMobileMore(false);
                  }}
                  className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-left flex items-center gap-2.5 text-slate-700"
                >
                  <IconReports size={16} className="text-slate-500" />
                  <span>Reports</span>
                </button>
              )}

              <button
                onClick={() => {
                  setActivePage('team');
                  setShowMobileMore(false);
                }}
                className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-left flex items-center gap-2.5 text-slate-700"
              >
                <IconStaff size={16} className="text-slate-500" />
                <span>Camp Team</span>
              </button>

              <button
                onClick={() => {
                  setActivePage('settings');
                  setShowMobileMore(false);
                }}
                className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 text-left flex items-center gap-2.5 text-slate-700"
              >
                <IconSettings size={16} className="text-slate-500" />
                <span>Camp Settings</span>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <button
                onClick={handleSignOut}
                className="w-full py-2.5 bg-red-50 hover:bg-red-100 text-[#C51F3A] rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <IconLogOut size={16} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 5. MODALS                                                */}
      {/* ======================================================== */}

      {/* Operational Readiness Verification Modal */}
      {showReadinessModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Verify Operational Readiness Boundary</h3>
            <p className="text-xs text-slate-500">
              Confirm all prerequisite medical and cold-chain checkpoints are verified prior to initiating blood collection.
            </p>

            <form onSubmit={handleVerifyReadiness} className="space-y-3">
              <div className="space-y-2 text-xs">
                {Object.entries({
                  staffAssigned: 'Authorized phlebotomy & clinical staff present on-site',
                  coldChainVerified: 'Cold-chain storage containers and temp sensors verified',
                  emergencyKitAvailable: 'Emergency medical kit and adverse reaction protocol available',
                  consumablesStocked: 'Sufficient sterile blood collection bags and consumables on-site',
                  spaceSanitized: 'Donation area sanitized and donor flow controls established',
                }).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(readinessChecklist as any)[key]}
                      onChange={(e) => setReadinessChecklist({ ...readinessChecklist, [key]: e.target.checked })}
                      className="rounded text-[#B91C32] focus:ring-[#B91C32]"
                    />
                    <span className="font-medium text-slate-700">{label}</span>
                  </label>
                ))}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Audit Notes (Optional)</label>
                <textarea
                  value={readinessNotes}
                  onChange={(e) => setReadinessNotes(e.target.value)}
                  placeholder="e.g. Inspected 4 cold-chain transport shippers at 4.2°C"
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-xl focus:outline-hidden"
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReadinessModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={verifyingReadiness}
                  className="px-4 py-2 bg-[#B91C32] hover:bg-[#9B1324] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  {verifyingReadiness ? 'Verifying...' : 'Authorize Blood Collection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Staff Assignment Modal (Camp Admin) */}
      {showStaffModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Camp Coordinator Staff Assignment</h3>
            <p className="text-xs text-slate-500">
              Assign an on-site coordinator by entering their 10-digit registered mobile number.
            </p>

            <form onSubmit={handleAssignCoordinator} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Staff Phone Number</label>
                <input
                  type="tel"
                  required
                  value={newStaffPhone}
                  onChange={(e) => setNewStaffPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="e.g. 9822001122"
                  className="w-full text-xs font-mono py-2 px-3 border border-slate-200 rounded-xl focus:outline-hidden focus:border-purple-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowStaffModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingStaff || newStaffPhone.length !== 10}
                  className="px-4 py-2 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  {submittingStaff ? 'Assigning...' : 'Assign Coordinator'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clinical Screening Evaluation Modal */}
      {screeningAttendee && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Record Clinical Screening &amp; Informed Consent</h3>
            <p className="text-xs text-slate-500">
              Donor: <strong>{screeningAttendee.donorName}</strong> ({screeningAttendee.donorPhone})
            </p>

            <form onSubmit={handleRecordScreening} className="space-y-3">
              <label className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentConfirmed}
                  onChange={(e) => setConsentConfirmed(e.target.checked)}
                  className="rounded text-[#B91C32]"
                />
                <span className="text-xs font-bold text-slate-700">Informed Consent Verified &amp; Signed</span>
              </label>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Clinical Eligibility Decision</label>
                <select
                  value={eligibilityDecision}
                  onChange={(e) => setEligibilityDecision(e.target.value as any)}
                  className="w-full text-xs py-2 px-3 border border-slate-200 rounded-xl bg-white"
                >
                  <option value="CLEARED">CLEARED (Approved for donation)</option>
                  <option value="TEMPORARY_DEFERRAL">TEMPORARY DEFERRAL</option>
                  <option value="PERMANENT_DEFERRAL">PERMANENT DEFERRAL</option>
                </select>
              </div>

              {eligibilityDecision !== 'CLEARED' && (
                <div className="grid grid-cols-2 gap-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <div>
                    <label className="block text-[10px] font-bold text-amber-900 mb-1">Deferral Reason</label>
                    <select
                      value={deferralCategory}
                      onChange={(e) => setDeferralCategory(e.target.value as any)}
                      className="w-full text-xs py-1.5 px-2 border border-amber-300 rounded-lg bg-white"
                    >
                      <option value="LOW_HEMOGLOBIN">Low Hemoglobin</option>
                      <option value="RECENT_ILLNESS">Recent Illness</option>
                      <option value="MEDICATION">Medication</option>
                      <option value="WEIGHT_CRITERIA">Weight &lt; 45kg</option>
                      <option value="OTHER">Other Clinical Reason</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-amber-900 mb-1">Deferral Duration (Days)</label>
                    <input
                      type="number"
                      value={deferralDays}
                      onChange={(e) => setDeferralDays(Number(e.target.value))}
                      min={1}
                      className="w-full text-xs py-1.5 px-2 border border-amber-300 rounded-lg"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Clinical Notes (Confidential)</label>
                <textarea
                  value={clinicalNotes}
                  onChange={(e) => setClinicalNotes(e.target.value)}
                  placeholder="e.g. Hb 13.5 g/dL, BP 120/80 mmHg, Pulse 72 bpm"
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-xl"
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setScreeningAttendee(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingScreening || !consentConfirmed}
                  className="px-4 py-2 bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  {submittingScreening ? 'Saving...' : 'Save Decision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Donation Event Recording Modal */}
      {donationAttendee && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Record Blood Donation Event</h3>
            <p className="text-xs text-slate-500">
              Donor: <strong>{donationAttendee.donorName}</strong> ({donationAttendee.donorPhone})
            </p>

            <form onSubmit={handleRecordDonation} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Confirmed Blood Group</label>
                  <select
                    value={donationBloodGroup}
                    onChange={(e) => setDonationBloodGroup(e.target.value)}
                    className="w-full text-xs py-2 px-3 border border-slate-200 rounded-xl bg-white font-bold"
                  >
                    <option value="A_POS">A+</option>
                    <option value="A_NEG">A-</option>
                    <option value="B_POS">B+</option>
                    <option value="B_NEG">B-</option>
                    <option value="AB_POS">AB+</option>
                    <option value="AB_NEG">AB-</option>
                    <option value="O_POS">O+</option>
                    <option value="O_NEG">O-</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Donation Outcome</label>
                  <select
                    value={donationOutcome}
                    onChange={(e) => setDonationOutcome(e.target.value as any)}
                    className="w-full text-xs py-2 px-3 border border-slate-200 rounded-xl bg-white font-bold"
                  >
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="ADVERSE_EVENT_STOPPED">STOPPED (Adverse Event)</option>
                    <option value="NOT_PERFORMED">NOT PERFORMED</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Collected Volume (mL)</label>
                <input
                  type="number"
                  value={donationVolume}
                  onChange={(e) => setDonationVolume(Number(e.target.value))}
                  min={100}
                  max={600}
                  className="w-full text-xs py-2 px-3 border border-slate-200 rounded-xl font-mono"
                />
              </div>

              <label className="flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={adverseReaction}
                  onChange={(e) => setAdverseReaction(e.target.checked)}
                  className="rounded text-red-600"
                />
                <span className="text-xs font-semibold text-slate-700">Donor experienced adverse phlebotomy reaction</span>
              </label>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Phlebotomy Notes (Optional)</label>
                <textarea
                  value={donationNotes}
                  onChange={(e) => setDonationNotes(e.target.value)}
                  placeholder="e.g. Standard venipuncture in left antecubital fossa"
                  className="w-full text-xs p-2.5 border border-slate-200 rounded-xl"
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDonationAttendee(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDonation}
                  className="px-4 py-2 bg-[#B91C32] hover:bg-[#9B1324] disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  {submittingDonation ? 'Recording...' : 'Save Donation Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Formal Camp Closure Confirmation Modal */}
      {showCloseCampModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center text-sm">🔒</span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Confirm Formal Camp Closure</h3>
                  <p className="text-[11px] text-slate-500">Statutory drive completion &amp; operational archival</p>
                </div>
              </div>
              <button
                onClick={() => setShowCloseCampModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Camp Summary */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
              <div className="font-bold text-slate-900 text-sm">{currentCamp?.title}</div>
              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block font-bold">Tracking Code</span>
                  <span className="font-mono font-bold text-slate-800">{currentCamp?.campCode}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block font-bold">Parent Blood Bank</span>
                  <span className="font-semibold text-slate-800">{currentCamp?.organisation?.name}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200 text-center">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block font-bold">Donations</span>
                  <span className="text-sm font-bold text-[#B91C32]">{closureReadiness?.metrics?.totalDonations ?? counts?.completedDonations ?? 0}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block font-bold">Confirmed Units</span>
                  <span className="text-sm font-bold text-slate-900">{closureReadiness?.metrics?.totalConfirmedUnits ?? 0}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase block font-bold">Open Blockers</span>
                  <span className="text-sm font-bold text-emerald-700">0 (Verified)</span>
                </div>
              </div>
            </div>

            {/* Operational Revocation Notice */}
            <div className="p-3.5 bg-red-50/70 border border-red-200 rounded-xl text-xs space-y-1.5">
              <div className="font-bold text-red-900 flex items-center gap-1.5">
                <span>⚠</span>
                <span>Consequences of Camp Closure</span>
              </div>
              <ul className="list-disc pl-4 space-y-1 text-red-800 text-[11px]">
                <li>Ordinary camp operational permissions are immediately deactivated (no new donor registrations, walk-ins, screenings, or unit creation).</li>
                <li>Staff role assignments and audit histories are strictly preserved for statutory compliance.</li>
                <li>This workspace permanently switches to <strong>Archived — Read-Only Mode</strong>.</li>
              </ul>
            </div>

            {/* Closure Notes */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Closure Certification Notes (Optional)
              </label>
              <textarea
                value={closureNotes}
                onChange={(e) => setClosureNotes(e.target.value)}
                placeholder="e.g. All donor collections completed and reconciled with parent blood bank staff."
                rows={2}
                className="w-full text-xs p-2.5 border border-slate-200 rounded-xl"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCloseCampModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={closingCamp}
                onClick={handleCloseCamp}
                className="px-5 py-2 bg-slate-900 hover:bg-black disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <span>{closingCamp ? 'Closing Camp...' : 'Confirm Formal Camp Closure'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CampDashboardPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-slate-300 border-t-[#B91C32] rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-600">Loading Camp Workspace...</p>
        </div>
      </div>
    }>
      <CampDashboardContent />
    </Suspense>
  );
}
