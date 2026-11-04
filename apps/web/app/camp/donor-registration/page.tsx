'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authFetch, getAuthToken } from '../../config/api';
import {
  STATES_AND_DISTRICTS,
  getDistrictsForState,
  getCitiesForDistrict,
  getStateName,
  getDistrictName,
} from '../../config/geography';

// Types
interface RegistrationRecord {
  id: string;
  registrationNumber: string;
  currentStep: number;
  workflowStatus: string;
  isCompleted: boolean;
  completedAt?: string | null;
  organisationId: string;
  organisationName?: string;
  organisationLicense?: string;
  campId?: string | null;
  campTitle?: string | null;
  bloodCentreName?: string | null;
  registrationSource: string;
  donationType: string;
  donorDetails: any;
  counselling: any;
  screening: any;
  collection: any;
  consent: any;
}

function DonorRegistrationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryCampId = searchParams.get('campId');
  const queryOrgId = searchParams.get('orgId');
  const queryRegId = searchParams.get('id') || searchParams.get('registrationId') || searchParams.get('registrationNumber') || searchParams.get('regId');
  const queryStep = searchParams.get('step');

  // Step state
  const [currentStep, setCurrentStep] = useState<number>(queryStep ? parseInt(queryStep, 10) : 1);
  const [registrationId, setRegistrationId] = useState<string | null>(queryRegId);
  const [registrationRecord, setRegistrationRecord] = useState<RegistrationRecord | null>(null);

  // Loading & Feedback
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Authorised camps and organisations
  const [camps, setCamps] = useState<any[]>([]);
  const [organisations, setOrganisations] = useState<any[]>([]);

  // Step 1: Donor & Donation Details
  const [selectedOrgId, setSelectedOrgId] = useState<string>(queryOrgId || '');
  const [selectedCampId, setSelectedCampId] = useState<string>(queryCampId || '');
  const [registrationSource, setRegistrationSource] = useState<string>('CAMP');
  const [donationType, setDonationType] = useState<string>('VOLUNTARY');

  const [fullName, setFullName] = useState<string>('');
  const [gender, setGender] = useState<string>('Male');
  const [bloodGroup, setBloodGroup] = useState<string>('O_POS');
  const [dateOfBirth, setDateOfBirth] = useState<string>('');
  const [calculatedAge, setCalculatedAge] = useState<number | null>(null);
  const [maritalStatus, setMaritalStatus] = useState<string>('Unmarried');
  const [nationalIdAadhaar, setNationalIdAadhaar] = useState<string>('');
  const [abhaNumber, setAbhaNumber] = useState<string>('');
  const [abhaAddress, setAbhaAddress] = useState<string>('');
  const [profession, setProfession] = useState<string>('Professional');
  const [donorClub, setDonorClub] = useState<string>('None');
  const [donationWillingness, setDonationWillingness] = useState<string>('Whole Blood');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Contact Details
  const [primaryMobile, setPrimaryMobile] = useState<string>('');
  const [mobileValidationError, setMobileValidationError] = useState<string | null>(null);
  const [secondaryMobile, setSecondaryMobile] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [stateCode, setStateCode] = useState<number>(27); // Maharashtra
  const [districtCode, setDistrictCode] = useState<number>(521); // Pune
  const [city, setCity] = useState<string>('Pune City (Central / Shivajinagar)');
  const [pinCode, setPinCode] = useState<string>('');

  // Working Address (Separate from Permanent Address, with "Same as Permanent" Sync)
  const [workingSameAsPermanent, setWorkingSameAsPermanent] = useState<boolean>(false);
  const [workingAddress, setWorkingAddress] = useState<string>('');
  const [workingStateCode, setWorkingStateCode] = useState<number>(27);
  const [workingDistrictCode, setWorkingDistrictCode] = useState<number>(521);
  const [workingCity, setWorkingCity] = useState<string>('Pune City (Central / Shivajinagar)');
  const [workingPinCode, setWorkingPinCode] = useState<string>('');

  const [isRepeatDonor, setIsRepeatDonor] = useState<string>('No');
  const [lastDonationDate, setLastDonationDate] = useState<string>('');
  const [preferredLanguage, setPreferredLanguage] = useState<string>('English');
  const [smsPermission, setSmsPermission] = useState<boolean>(true);
  const [callPermission, setCallPermission] = useState<boolean>(true);

  // Separate Optional Donor Discovery Consent (Default: Opt-out / false)
  const [discoveryConsent, setDiscoveryConsent] = useState<boolean>(false);

  // Mobile Lookup State & Confirmation
  const [lookingUpPhone, setLookingUpPhone] = useState<boolean>(false);
  const [phoneLookupMsg, setPhoneLookupMsg] = useState<string | null>(null);
  const [matchedProfile, setMatchedProfile] = useState<any | null>(null);

  // Role awareness & Coordinator Submission
  const [callerRole, setCallerRole] = useState<string>('CAMP_ADMIN');
  const [coordinatorSubmitted, setCoordinatorSubmitted] = useState<boolean>(false);

  // Clinical Staff for Selected Organisation / Camp
  const [clinicalStaff, setClinicalStaff] = useState<Array<{ id: string; name: string; role: string; isMedicalOfficer?: boolean }>>([]);
  const [staffLoading, setStaffLoading] = useState<boolean>(false);
  const [staffError, setStaffError] = useState<string | null>(null);

  // Workflow Step Handoff States
  const [screeningSubmitted, setScreeningSubmitted] = useState<boolean>(false);
  const [collectionSubmitted, setCollectionSubmitted] = useState<boolean>(false);

  // Step 2: Counselling & Demo Questionnaire States
  const [counsellingReviewedById, setCounsellingReviewedById] = useState<string>('');
  const [counsellingStatus, setCounsellingStatus] = useState<string>('APPROVED');
  const [counsellingRemarks, setCounsellingRemarks] = useState<string>('Donor counselled and verified fit as per standard questionnaire guidelines.');
  const [canIssuePlasma, setCanIssuePlasma] = useState<boolean>(true);
  const [counsellingDeferralType, setCounsellingDeferralType] = useState<string>('TEMPORARY');
  const [counsellingDeferralReason, setCounsellingDeferralReason] = useState<string>('');
  const [counsellingAnswers, setCounsellingAnswers] = useState<any[]>([]);
  const [demoDraftLoaded, setDemoDraftLoaded] = useState<boolean>(false);

  // Step 3: Screening Details
  const [screenedById, setScreenedById] = useState<string>('');
  const [medicalOfficerId, setMedicalOfficerId] = useState<string>('');
  const [screeningStatus, setScreeningStatus] = useState<string>('FIT');
  const [weightKg, setWeightKg] = useState<string>('65');
  const [hemoglobin, setHemoglobin] = useState<string>('14.2');
  const [screeningBloodGroup, setScreeningBloodGroup] = useState<string>('O_POS');
  const [systolicBp, setSystolicBp] = useState<string>('120');
  const [diastolicBp, setDiastolicBp] = useState<string>('80');
  const [pulseBpm, setPulseBpm] = useState<string>('72');
  const [temperatureCelsius, setTemperatureCelsius] = useState<string>('36.8');
  const [heightCm, setHeightCm] = useState<string>('170');
  const [bothArmsInspected, setBothArmsInspected] = useState<boolean>(true);
  const [postDonationTipsGiven, setPostDonationTipsGiven] = useState<boolean>(true);
  const [registrationProcessType, setRegistrationProcessType] = useState<string>('DONOR');
  const [screeningRemarks, setScreeningRemarks] = useState<string>('Normal vitals. Clinically cleared for whole blood donation.');
  const [screeningDeferralCategory, setScreeningDeferralCategory] = useState<string>('');
  const [screeningDeferralReason, setScreeningDeferralReason] = useState<string>('');

  // Step 4: Collection Details
  const [collectionStatus, setCollectionStatus] = useState<string>('COLLECTED');
  const [bagType, setBagType] = useState<string>('DB-CPDA-350');
  const [manufacturer, setManufacturer] = useState<string>('Terumo Penpol');
  const [lotNumber, setLotNumber] = useState<string>('LOT-202610-A');
  const [segmentNumber, setSegmentNumber] = useState<string>('SEG-9941');
  const [volumeMl, setVolumeMl] = useState<string>('350');
  const [durationMinutes, setDurationMinutes] = useState<string>('8');
  const [isLessQuantity, setIsLessQuantity] = useState<boolean>(false);
  const [adverseReaction, setAdverseReaction] = useState<boolean>(false);
  const [adverseReactionDetails, setAdverseReactionDetails] = useState<string>('');
  const [timeRefreshmentsProvided, setTimeRefreshmentsProvided] = useState<string>('10:30 AM');
  const [exitTime, setExitTime] = useState<string>('10:45 AM');
  const [collectionRemarks, setCollectionRemarks] = useState<string>('Satisfactory uneventful blood collection.');
  const [unitNumber, setUnitNumber] = useState<string>('');
  const [barcode, setBarcode] = useState<string>('');

  // Step 5: Summary & Consent
  const [consentGiven, setConsentGiven] = useState<boolean>(true);
  const [barcodeModalOpen, setBarcodeModalOpen] = useState<boolean>(false);

  // Available districts dependent on selected state
  const availableDistricts = useMemo(() => {
    return getDistrictsForState(stateCode);
  }, [stateCode]);

  // Cascading cities for permanent address
  const availablePermanentCities = useMemo(() => {
    return getCitiesForDistrict(districtCode);
  }, [districtCode]);

  // Cascading districts and cities for working address
  const availableWorkingDistricts = useMemo(() => {
    return getDistrictsForState(workingStateCode);
  }, [workingStateCode]);

  const availableWorkingCities = useMemo(() => {
    return getCitiesForDistrict(workingDistrictCode);
  }, [workingDistrictCode]);

  // Synchronize working address when "same as permanent" is checked
  useEffect(() => {
    if (workingSameAsPermanent) {
      setWorkingAddress(address);
      setWorkingStateCode(stateCode);
      setWorkingDistrictCode(districtCode);
      setWorkingCity(city);
      setWorkingPinCode(pinCode);
    }
  }, [workingSameAsPermanent, address, stateCode, districtCode, city, pinCode]);

  // Calculate age when dateOfBirth changes
  useEffect(() => {
    if (dateOfBirth) {
      const dob = new Date(dateOfBirth);
      if (!isNaN(dob.getTime())) {
        const diffMs = Date.now() - dob.getTime();
        const age = Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000));
        setCalculatedAge(age);
      }
    } else {
      setCalculatedAge(null);
    }
  }, [dateOfBirth]);

  // Load camps, centres, and existing draft if ID provided
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        // Load authorized camps and organisations
        const metaRes = await authFetch('/api/v1/donor-registration/camps-and-centres');
        if (metaRes.ok) {
          const metaData = await metaRes.json();
          const loadedCamps: any[] = metaData.data?.camps || [];
          let loadedOrgs: any[] = metaData.data?.organisations || [];

          // Merge any camp's parent organisation if not in loadedOrgs
          for (const c of loadedCamps) {
            if (c.organisation && !loadedOrgs.some((o) => o.id === c.organisation.id)) {
              loadedOrgs = [...loadedOrgs, c.organisation];
            }
          }

          setCamps(loadedCamps);
          setOrganisations(loadedOrgs);

          // Auto-select query camp or first camp
          const activeCampId = queryCampId || (loadedCamps.length > 0 ? loadedCamps[0].id : '');
          if (activeCampId) {
            setSelectedCampId(activeCampId);
            const foundCamp = loadedCamps.find((c: any) => c.id === activeCampId);
            if (foundCamp?.organisationId) {
              setSelectedOrgId(foundCamp.organisationId);
            }
            if (foundCamp?.userRole) {
              setCallerRole(foundCamp.userRole);
            }
          } else if (loadedOrgs.length > 0 && !selectedOrgId) {
            setSelectedOrgId(loadedOrgs[0].id);
          }

          if (metaData.data?.userRole) {
            setCallerRole(metaData.data.userRole);
          }
        }

        let effectiveRole = 'CAMP_ADMIN';
        // Fetch user's explicit camp staff assignments to resolve role accurately
        const assignRes = await authFetch('/api/v1/camps/me/assignments').catch(() => null);
        if (assignRes && assignRes.ok) {
          const assignData = await assignRes.json();
          const assignments = assignData.data || [];
          const activeCampId = queryCampId || selectedCampId;
          const match = assignments.find((a: any) => a.campId === activeCampId) || assignments[0];
          if (match?.role) {
            effectiveRole = match.role;
            setCallerRole(match.role);
          }
        } else {
          // Fallback to user profile role
          const meRes = await authFetch('/api/v1/auth/me');
          if (meRes.ok) {
            const meData = await meRes.json();
            if (meData.data?.user?.role) {
              effectiveRole = meData.data.user.role;
              setCallerRole(meData.data.user.role);
            }
          }
        }

        // Load existing registration if ID provided
        if (registrationId) {
          await loadRegistration(registrationId, effectiveRole);
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to initialize donor registration.');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [registrationId]);

  // Authoritative camp-to-organisation derivation
  useEffect(() => {
    if (registrationSource === 'CAMP' && selectedCampId && camps.length > 0) {
      const camp = camps.find((c) => c.id === selectedCampId);
      if (camp?.organisationId && camp.organisationId !== selectedOrgId) {
        setSelectedOrgId(camp.organisationId);
      }
    }
  }, [registrationSource, selectedCampId, camps, selectedOrgId]);

  // Load clinical staff whenever selectedOrgId or selectedCampId changes
  useEffect(() => {
    const cleanCamp = selectedCampId && selectedCampId !== 'undefined' && selectedCampId !== 'null' ? selectedCampId : undefined;
    const cleanOrg = selectedOrgId && selectedOrgId !== 'undefined' && selectedOrgId !== 'null' ? selectedOrgId : undefined;
    if (!cleanOrg && !cleanCamp) return;

    const loadStaff = async () => {
      try {
        setStaffLoading(true);
        setStaffError(null);
        const queryParams = new URLSearchParams();
        if (cleanCamp) queryParams.set('campId', cleanCamp);
        if (cleanOrg) queryParams.set('organisationId', cleanOrg);

        const res = await authFetch(`/api/v1/donor-registration/clinical-staff?${queryParams.toString()}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || 'Failed to load authorized clinical staff for this camp / organisation.');
        }

        const json = await res.json();
        const staffList: Array<{ id: string; name: string; role: string; isMedicalOfficer?: boolean }> = json.data || [];
        setClinicalStaff(staffList);

        if (staffList.length > 0) {
          setCounsellingReviewedById((prev) => {
            if (prev && staffList.some((s) => s.id === prev)) return prev;
            return staffList[0].id;
          });
          setScreenedById((prev) => {
            if (prev && staffList.some((s) => s.id === prev)) return prev;
            return staffList[0].id;
          });

          const moList = staffList.filter((s) => s.isMedicalOfficer);
          setMedicalOfficerId((prev) => {
            if (prev && moList.some((s) => s.id === prev)) return prev;
            return moList.length > 0 ? moList[0].id : '';
          });
        } else {
          setCounsellingReviewedById('');
          setScreenedById('');
          setMedicalOfficerId('');
        }
      } catch (err: any) {
        console.warn('Failed to load clinical staff list:', err.message);
        setStaffError(err.message || 'Failed to load authorized staff.');
      } finally {
        setStaffLoading(false);
      }
    };
    loadStaff();
  }, [selectedOrgId, selectedCampId]);

  // Load standard 26 counselling questions from API (production or demo)
  const loadCounsellingQuestions = async (isDemo: boolean = false) => {
    try {
      setLoading(true);
      const isFemale = gender?.toLowerCase() === 'female';
      const mode = isDemo ? 'demo' : 'production';
      const res = await authFetch(`/api/v1/donor-registration/counselling-questions?gender=${gender}&mode=${mode}`);
      if (res.ok) {
        const json = await res.json();
        setCounsellingAnswers(json.data || []);
        if (isDemo) {
          setDemoDraftLoaded(true);
        }
      }
    } catch (err) {
      console.error('Failed to load counselling questions', err);
    } finally {
      setLoading(false);
    }
  };

  // Pre-load editable counselling questions when entering Step 2
  useEffect(() => {
    if (currentStep === 2 && counsellingAnswers.length === 0) {
      // Prepopulate editable answers in demo configuration; in production mode, start unanswered
      const isDemoConfig = process.env.NODE_ENV !== 'production' || searchParams.get('mode') === 'demo';
      loadCounsellingQuestions(isDemoConfig);
    }
  }, [currentStep, counsellingAnswers.length, gender, searchParams]);

  // Load saved draft from API
  const loadRegistration = async (id: string, activeRole?: string) => {
    try {
      const res = await authFetch(`/api/v1/donor-registration/${id}`);
      if (!res.ok) throw new Error('Registration record not found.');

      const json = await res.json();
      const reg: RegistrationRecord = json.data;
      setRegistrationRecord(reg);
      setRegistrationId(reg.id);

      const userRole = activeRole || callerRole;
      const targetStepFromUrl = queryStep ? parseInt(queryStep, 10) : null;

      let resolvedStep = targetStepFromUrl;
      if (!resolvedStep || isNaN(resolvedStep) || (userRole === 'CLINICAL_STAFF' && resolvedStep === 1)) {
        if (userRole === 'CLINICAL_STAFF') {
          // Clinical Staff: Open counselling assessment (Step 2) if not yet approved,
          // or Screening / Medical Fitness (Step 3) if counselling already cleared.
          const counsellingApproved = reg.counselling?.status === 'APPROVED' || reg.workflowStatus === 'SCREENING_PENDING' || reg.workflowStatus === 'MEDICAL_REVIEW_PENDING';
          resolvedStep = counsellingApproved ? 3 : 2;
        } else if (userRole === 'COLLECTION_STAFF') {
          resolvedStep = 4;
        } else if (userRole === 'CAMP_COORDINATOR') {
          resolvedStep = 1;
        } else {
          // Administrator or Blood Centre Director: advance based on current workflow status
          if (reg.workflowStatus === 'COUNSELLING_PENDING') resolvedStep = 2;
          else if (reg.workflowStatus === 'SCREENING_PENDING' || reg.workflowStatus === 'MEDICAL_REVIEW_PENDING') resolvedStep = 3;
          else if (reg.workflowStatus === 'CLEARED_FOR_COLLECTION') resolvedStep = 4;
          else if (reg.isCompleted || reg.workflowStatus === 'COLLECTION_COMPLETED') resolvedStep = 5;
          else resolvedStep = reg.currentStep || 1;
        }
      }

      setCurrentStep(resolvedStep);

      // Populate Step 1
      if (reg.organisationId) setSelectedOrgId(reg.organisationId);
      if (reg.campId) setSelectedCampId(reg.campId);
      setRegistrationSource(reg.registrationSource || 'CAMP');
      setDonationType(reg.donationType || 'VOLUNTARY');

      const d = reg.donorDetails || {};
      if (d.fullName) setFullName(d.fullName);
      if (d.gender) setGender(d.gender);
      if (d.bloodGroup) setBloodGroup(d.bloodGroup);
      if (d.dateOfBirth) setDateOfBirth(d.dateOfBirth);
      if (d.maritalStatus) setMaritalStatus(d.maritalStatus);
      if (d.nationalIdAadhaarMasked) setNationalIdAadhaar(d.nationalIdAadhaarMasked);
      if (d.abhaNumber) setAbhaNumber(d.abhaNumber);
      if (d.abhaAddress) setAbhaAddress(d.abhaAddress);
      if (d.profession) setProfession(d.profession);
      if (d.donorClub) setDonorClub(d.donorClub);
      if (d.donationWillingness) setDonationWillingness(d.donationWillingness);
      if (d.primaryMobile) {
        setPrimaryMobile(d.primaryMobile);
      } else if ((reg as any).donorPhone || (reg as any).phone) {
        setPrimaryMobile(String((reg as any).donorPhone || (reg as any).phone).replace(/^\+91/, '').replace(/\D/g, ''));
      }
      if (d.secondaryMobile) setSecondaryMobile(d.secondaryMobile);
      if (d.email) setEmail(d.email);
      if (d.address) setAddress(d.address);
      if (d.stateCode) setStateCode(Number(d.stateCode));
      if (d.districtCode) setDistrictCode(Number(d.districtCode));
      if (d.city) setCity(d.city);
      if (d.pinCode) setPinCode(d.pinCode);

      if (d.workingAddress || (reg as any).workingAddress) setWorkingAddress(d.workingAddress || (reg as any).workingAddress);
      if (d.workingStateCode || (reg as any).workingStateCode) setWorkingStateCode(Number(d.workingStateCode || (reg as any).workingStateCode));
      if (d.workingDistrictCode || (reg as any).workingDistrictCode) setWorkingDistrictCode(Number(d.workingDistrictCode || (reg as any).workingDistrictCode));
      if (d.workingCity || (reg as any).workingCity) setWorkingCity(d.workingCity || (reg as any).workingCity);
      if (d.workingPinCode || (reg as any).workingPinCode) setWorkingPinCode(d.workingPinCode || (reg as any).workingPinCode);
      if (d.workingSameAsPermanent !== undefined || (reg as any).workingSameAsPermanent !== undefined) {
        setWorkingSameAsPermanent(Boolean(d.workingSameAsPermanent ?? (reg as any).workingSameAsPermanent));
      }
      if (d.discoveryConsent !== undefined || (reg as any).discoveryConsent?.consentGiven !== undefined) {
        setDiscoveryConsent(Boolean(d.discoveryConsent ?? (reg as any).discoveryConsent?.consentGiven));
      }

      if (d.isRepeatDonor !== undefined) setIsRepeatDonor(d.isRepeatDonor ? 'Yes' : 'No');
      if (d.lastDonationDate) setLastDonationDate(d.lastDonationDate);
      if (d.preferredLanguage) setPreferredLanguage(d.preferredLanguage);
      if (d.smsPermission !== undefined) setSmsPermission(d.smsPermission);
      if (d.callPermission !== undefined) setCallPermission(d.callPermission);

      // Populate Step 2
      const c = reg.counselling || {};
      if (c.reviewedById) setCounsellingReviewedById(c.reviewedById);
      if (c.status) setCounsellingStatus(c.status);
      if (c.remarks) setCounsellingRemarks(c.remarks);
      if (c.canIssuePlasma !== undefined) setCanIssuePlasma(c.canIssuePlasma);
      if (c.deferralType) setCounsellingDeferralType(c.deferralType);
      if (c.deferralReason) setCounsellingDeferralReason(c.deferralReason);
      if (c.answers && c.answers.length > 0) setCounsellingAnswers(c.answers);

      // Populate Step 3
      const s = reg.screening || {};
      if (s.screenedById) setScreenedById(s.screenedById);
      if (s.medicalOfficerId) setMedicalOfficerId(s.medicalOfficerId);
      if (s.status) setScreeningStatus(s.status);
      if (s.weightKg) setWeightKg(String(s.weightKg));
      if (s.hemoglobin) setHemoglobin(String(s.hemoglobin));
      if (s.bloodGroup) setScreeningBloodGroup(s.bloodGroup);
      if (s.systolicBp) setSystolicBp(String(s.systolicBp));
      if (s.diastolicBp) setDiastolicBp(String(s.diastolicBp));
      if (s.pulseBpm) setPulseBpm(String(s.pulseBpm));
      if (s.temperatureCelsius) setTemperatureCelsius(String(s.temperatureCelsius));
      if (s.heightCm) setHeightCm(String(s.heightCm));
      if (s.bothArmsInspected !== null) setBothArmsInspected(s.bothArmsInspected);
      if (s.postDonationTipsGiven !== null) setPostDonationTipsGiven(s.postDonationTipsGiven);
      if (s.processType) setRegistrationProcessType(s.processType);
      if (s.remarks) setScreeningRemarks(s.remarks);
      if (s.deferralCategory) setScreeningDeferralCategory(s.deferralCategory);
      if (s.deferralReason) setScreeningDeferralReason(s.deferralReason);

      // Populate Step 4
      const col = reg.collection || {};
      if (col.status) setCollectionStatus(col.status);
      if (col.bagType) setBagType(col.bagType);
      if (col.manufacturer) setManufacturer(col.manufacturer);
      if (col.lotNumber) setLotNumber(col.lotNumber);
      if (col.segmentNumber) setSegmentNumber(col.segmentNumber);
      if (col.volumeMl) setVolumeMl(String(col.volumeMl));
      if (col.durationMinutes) setDurationMinutes(String(col.durationMinutes));
      if (col.isLessQuantity !== null) setIsLessQuantity(col.isLessQuantity);
      if (col.adverseReaction !== null) setAdverseReaction(col.adverseReaction);
      if (col.adverseReactionDetails) setAdverseReactionDetails(col.adverseReactionDetails);
      if (col.timeRefreshmentsProvided) setTimeRefreshmentsProvided(col.timeRefreshmentsProvided);
      if (col.exitTime) setExitTime(col.exitTime);
      if (col.remarks) setCollectionRemarks(col.remarks);
      if (col.unitNumber) setUnitNumber(col.unitNumber);
      if (col.barcode) setBarcode(col.barcode);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error restoring saved registration.');
    }
  };

  // Safe Phone Lookup (Explicit confirmation required before overwriting)
  const handlePhoneLookup = async () => {
    if (!primaryMobile.trim()) return;
    try {
      setLookingUpPhone(true);
      setPhoneLookupMsg(null);
      setMatchedProfile(null);
      const res = await authFetch(`/api/v1/donor-registration/lookup-phone?phone=${encodeURIComponent(primaryMobile)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Lookup failed');

      if (data.data?.exists) {
        setMatchedProfile(data.data);
        setPhoneLookupMsg(`Matching profile found for ${data.data.fullName} (${data.data.bloodGroup || 'Blood group not set'}). Review and confirm to load details.`);
      } else {
        setPhoneLookupMsg('No prior registrations found for this number. New donor profile will be safely created.');
        setIsRepeatDonor('No');
      }
    } catch (err: any) {
      setPhoneLookupMsg(`Lookup note: ${err.message}`);
    } finally {
      setLookingUpPhone(false);
    }
  };

  const confirmLoadMatchedProfile = () => {
    if (!matchedProfile) return;
    if (matchedProfile.fullName) setFullName(matchedProfile.fullName);
    if (matchedProfile.dateOfBirth) setDateOfBirth(matchedProfile.dateOfBirth);
    if (matchedProfile.bloodGroup) setBloodGroup(matchedProfile.bloodGroup);
    if (matchedProfile.cityOrLocality) setCity(matchedProfile.cityOrLocality);
    if (matchedProfile.stateCode) setStateCode(matchedProfile.stateCode);
    if (matchedProfile.districtCode) setDistrictCode(matchedProfile.districtCode);
    setIsRepeatDonor(matchedProfile.isRepeatDonor ? 'Yes' : 'No');
    if (matchedProfile.lastDonationDate) setLastDonationDate(matchedProfile.lastDonationDate);
    setPhoneLookupMsg(`✓ Details successfully loaded for ${matchedProfile.fullName}.`);
    setMatchedProfile(null);
  };

  // Profile photograph upload handler (max 800 KB)
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 800 * 1024) {
      setErrorMessage('Photo exceeds 800 KB limit. Please select an image under 800 KB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Save Step / Save Draft
  const handleSaveDraft = async (targetStep?: number) => {
    try {
      setSaving(true);
      setErrorMessage(null);
      setSaveSuccessMsg(null);

      const isStep1 = currentStep === 1;

      // Field validation for Step 1 ONLY when saving Step 1
      if (isStep1) {
        const cleanedMobile = primaryMobile.replace(/\D/g, '');
        if (!cleanedMobile) {
          throw new Error('Primary mobile number is required.');
        }
        if (cleanedMobile.length !== 10) {
          throw new Error(`Primary mobile number must be exactly 10 digits (currently ${cleanedMobile.length} digits).`);
        }
        if (!fullName.trim()) {
          throw new Error('Full name is required.');
        }
        if (!dateOfBirth) {
          throw new Error('Date of birth is required.');
        }

        if (registrationSource === 'CAMP') {
          const camp = camps.find((c) => c.id === selectedCampId);
          if (!camp) {
            throw new Error('Please select an authorized camp for registration.');
          }
          if (!camp.organisationId) {
            throw new Error(`Camp '${camp.title}' is not associated with an authorised blood centre or organisation.`);
          }
          if (!camp.isReadyForCollection && !registrationId) {
            throw new Error(`Camp '${camp.title}' is not ready for operations. Operational readiness must be verified before starting new donor registrations.`);
          }
        }
      }

      // Safe step progression and role isolation:
      // When saving from Step 1, only Step 1 donor demographic, contact and consent details are submitted.
      // When saving from Step 2 onwards, donor demographics are preserved and not overwritten.
      const payload: any = {
        registrationId,
        organisationId: selectedOrgId,
        campId: registrationSource === 'CAMP' ? selectedCampId : null,
        registrationSource,
        donationType,
        currentStep: isStep1 ? 1 : (targetStep || currentStep),
      };

      if (isStep1) {
        const cleanedMobile = primaryMobile.replace(/\D/g, '');
        payload.donorDetails = {
          fullName: fullName.trim(),
          gender,
          bloodGroup,
          dateOfBirth,
          maritalStatus,
          nationalIdAadhaar: nationalIdAadhaar.trim() || undefined,
          abhaNumber: abhaNumber.trim() || undefined,
          abhaAddress: abhaAddress.trim() || undefined,
          profession,
          donorClub,
          donationWillingness,
          primaryMobile: cleanedMobile,
          secondaryMobile: secondaryMobile.trim() || undefined,
          email: email.trim() || undefined,
          address,
          state: STATES_AND_DISTRICTS.find((s) => s.code === stateCode)?.name || 'Maharashtra',
          stateCode,
          district: availableDistricts.find((d) => d.code === districtCode)?.name || 'Pune',
          districtCode,
          city,
          pinCode,
          workingAddress,
          workingState: STATES_AND_DISTRICTS.find((s) => s.code === workingStateCode)?.name || 'Maharashtra',
          workingStateCode,
          workingDistrict: availableWorkingDistricts.find((d) => d.code === workingDistrictCode)?.name || 'Pune',
          workingDistrictCode,
          workingCity,
          workingPinCode,
          workingSameAsPermanent,
          discoveryConsent,
          discoveryConsentSource: 'CAMP_REGISTRATION',
          discoveryConsentVersion: 'v1.0',
          isRepeatDonor: isRepeatDonor === 'Yes',
          lastDonationDate: lastDonationDate || undefined,
          preferredLanguage,
          smsPermission,
          callPermission,
          photoUrl: photoPreview || undefined,
        };
        payload.consent = {
          consentGiven,
          version: 'v1.0',
        };
      }

      // STEP 2: Counselling Assessment
      if (currentStep === 2) {
        if (!counsellingReviewedById) {
          throw new Error('Please select an authorized clinical staff member in Counselled By.');
        }

        // Validate unanswered questions in production mode
        const unanswered = counsellingAnswers.filter((q) => q.answer === null || q.answer === undefined || q.reviewStatus === 'UNANSWERED');
        if (unanswered.length > 0) {
          throw new Error(`All 26 counselling questions must be reviewed and answered (${unanswered.length} remaining).`);
        }

        payload.counsellingReviewedById = counsellingReviewedById || undefined;
        payload.counsellingStatus = counsellingStatus;
        payload.counsellingRemarks = counsellingRemarks;
        payload.canIssuePlasma = canIssuePlasma;
        payload.counsellingDeferralType = counsellingDeferralType;
        payload.counsellingDeferralReason = counsellingDeferralReason;
        payload.counsellingAnswers = counsellingAnswers.length > 0 ? counsellingAnswers : undefined;
      }

      // STEP 3: Physical Screening and Medical Fitness Review
      if (currentStep === 3) {
        if (!screenedById) {
          throw new Error('Screened By clinical staff assignment is required.');
        }
        if (!medicalOfficerId) {
          throw new Error('Medical Officer assignment is required to certify donor medical fitness.');
        }
        const parsedWeight = parseFloat(weightKg);
        if (isNaN(parsedWeight) || parsedWeight < 45) {
          throw new Error('Donor weight must be at least 45 kg for whole blood donation eligibility.');
        }
        const parsedHb = parseFloat(hemoglobin);
        if (isNaN(parsedHb) || parsedHb < 12.5) {
          if (screeningStatus === 'FIT') {
            throw new Error(`Hemoglobin level (${parsedHb} g/dL) is below the minimum clinical standard (12.5 g/dL). Donor cannot be cleared as FIT.`);
          }
        }

        payload.screening = {
          screenedById: screenedById || undefined,
          medicalOfficerId: medicalOfficerId || undefined,
          status: screeningStatus,
          weightKg: parsedWeight || null,
          hemoglobin: parsedHb || null,
          bloodGroup: screeningBloodGroup,
          systolicBp: parseInt(systolicBp) || null,
          diastolicBp: parseInt(diastolicBp) || null,
          pulseBpm: parseInt(pulseBpm) || null,
          temperatureCelsius: parseFloat(temperatureCelsius) || null,
          heightCm: parseFloat(heightCm) || null,
          bothArmsInspected,
          postDonationTipsGiven,
          processType: registrationProcessType,
          remarks: screeningRemarks,
          deferralCategory: screeningStatus === 'DEFERRED' ? screeningDeferralCategory : null,
          deferralReason: screeningStatus === 'DEFERRED' ? screeningDeferralReason : null,
        };

        // Strictly do NOT submit Step 4 collection fields during clinical screening
        delete payload.collection;
      }

      // STEP 4: Phlebotomy & Blood Collection (Collection Staff ONLY)
      if (currentStep === 4) {
        if (!bagType) {
          throw new Error('Bag type selection is required for blood collection.');
        }
        if (!volumeMl || parseInt(volumeMl) <= 0) {
          throw new Error('Valid collected volume in mL is required.');
        }

        payload.collection = {
          status: collectionStatus,
          bagType,
          manufacturer,
          lotNumber,
          segmentNumber,
          volumeMl: parseInt(volumeMl) || null,
          durationMinutes: parseInt(durationMinutes) || null,
          isLessQuantity,
          adverseReaction,
          adverseReactionDetails: adverseReaction ? adverseReactionDetails : null,
          timeRefreshmentsProvided,
          exitTime,
          remarks: collectionRemarks,
        };

        // Strictly do NOT alter medical clearance or screening fields from collection step
        delete payload.screening;
        delete payload.counsellingAnswers;
        delete payload.counsellingReviewedById;
      }

      const res = await authFetch('/api/v1/donor-registration/save', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error?.message || 'Failed to save registration draft.');
      }

      const savedReg = resData.data;
      setRegistrationId(savedReg.id);
      setRegistrationRecord(savedReg);
      if (savedReg.counselling?.answers) {
        setCounsellingAnswers(savedReg.counselling.answers);
      }
      if (savedReg.collection?.unitNumber) setUnitNumber(savedReg.collection.unitNumber);
      if (savedReg.collection?.barcode) setBarcode(savedReg.collection.barcode);

      setSaveSuccessMsg(`Progress saved successfully to database (Reg #: ${savedReg.registrationNumber})`);

      // Role handoff execution
      if (isStep1) {
        setCoordinatorSubmitted(true);
      } else if (currentStep === 3 && targetStep !== 2) {
        setScreeningSubmitted(true);
      } else if (currentStep === 4 && targetStep !== 3) {
        setCollectionSubmitted(true);
      } else if (targetStep) {
        setCurrentStep(targetStep);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error saving registration.');
    } finally {
      setSaving(false);
    }
  };

  // Complete Registration Handler
  const handleCompleteRegistration = async () => {
    if (!registrationId) {
      await handleSaveDraft(5);
    }
    if (!registrationId) return;

    try {
      setSaving(true);
      setErrorMessage(null);
      const res = await authFetch(`/api/v1/donor-registration/${registrationId}/complete`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error?.message || 'Completion failed');

      setRegistrationRecord(data.data);
      setSaveSuccessMsg(`Registration #${data.data.registrationNumber} completed! Status: ${data.data.workflowStatus}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to complete registration.');
    } finally {
      setSaving(false);
    }
  };

  // Download PDF via authenticated blob fetch
  const handleDownloadPdf = async () => {
    if (!registrationId) return;
    try {
      setErrorMessage(null);
      const res = await authFetch(`/api/v1/donor-registration/${registrationId}/pdf`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || 'Failed to download donor registration PDF');
      }
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `donor-registration-${registrationRecord?.registrationNumber || registrationId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error generating donor PDF.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-slate-300 border-t-[#B91C32] rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-600">Loading Donor Registration Wizard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-20">
      {/* Top Application Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 px-4 sm:px-8 py-3.5 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/camp/dashboard"
              className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-sm transition-colors"
              title="Return to Camp Workspace"
            >
              ←
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold tracking-wider uppercase bg-red-100 text-[#991b1b] px-2 py-0.5 rounded">
                  Clinical Intake
                </span>
                <span className="text-xs font-mono font-bold text-slate-500">
                  {registrationRecord?.registrationNumber || 'NEW DRAFT'}
                </span>
                {registrationRecord?.workflowStatus && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    registrationRecord.workflowStatus === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                    registrationRecord.workflowStatus === 'DEFERRED' ? 'bg-rose-100 text-rose-800' :
                    'bg-amber-100 text-amber-800'
                  }`}>
                    ● {registrationRecord.workflowStatus}
                  </span>
                )}
              </div>
              <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">
                Donor Registration Workflow
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleSaveDraft()}
              disabled={saving}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            {registrationId && (
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="px-3.5 py-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <span>📄</span>
                <span>Printable PDF</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* Banner Feedback */}
        {saveSuccessMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl text-xs font-bold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-emerald-600 text-base">✓</span>
              <span>{saveSuccessMsg}</span>
            </div>
            <button onClick={() => setSaveSuccessMsg(null)} className="text-emerald-700 hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-2xl text-xs font-bold flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-rose-600 text-base">⚠</span>
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-rose-700 hover:underline">
              Dismiss
            </button>
          </div>
        )}

        {/* 5-Step Responsive Wizard Progress Bar */}
        <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-xs">
          <div className="grid grid-cols-5 gap-2 sm:gap-4 select-none">
            {[
              { num: 1, title: 'Donor Details', desc: 'Demographics & Contact', allowedRoles: ['CAMP_ADMIN', 'CAMP_COORDINATOR', 'ADMIN'] },
              { num: 2, title: 'Counselling', desc: '26 Clinical Questions', allowedRoles: ['CAMP_ADMIN', 'CLINICAL_STAFF', 'ADMIN'] },
              { num: 3, title: 'Screening', desc: 'Vitals & Fitness', allowedRoles: ['CAMP_ADMIN', 'CLINICAL_STAFF', 'ADMIN'] },
              { num: 4, title: 'Collection', desc: 'Phlebotomy & Units', allowedRoles: ['CAMP_ADMIN', 'COLLECTION_STAFF', 'ADMIN'] },
              { num: 5, title: 'Summary', desc: 'Review & Complete', allowedRoles: ['CAMP_ADMIN', 'CLINICAL_STAFF', 'COLLECTION_STAFF', 'ADMIN'] },
            ].map((step) => {
              const isAllowed = callerRole === 'ADMIN' || callerRole === 'CAMP_ADMIN' || step.allowedRoles.includes(callerRole) || (registrationRecord && step.num === 1);
              const isCurrent = currentStep === step.num;
              const isPast = currentStep > step.num;
              return (
                <button
                  key={step.num}
                  type="button"
                  disabled={!isAllowed}
                  onClick={() => {
                    if (!isAllowed) return;
                    setScreeningSubmitted(false);
                    setCollectionSubmitted(false);
                    setCurrentStep(step.num);
                  }}
                  className={`text-left p-2.5 sm:p-3 rounded-2xl transition-all border ${
                    !isAllowed
                      ? 'bg-slate-100/50 border-slate-200 opacity-40 cursor-not-allowed'
                      : isCurrent
                      ? 'bg-red-50/80 border-[#991b1b] shadow-xs cursor-pointer'
                      : isPast
                      ? 'bg-emerald-50/50 border-emerald-200 hover:bg-emerald-50 cursor-pointer'
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100/60 cursor-pointer'
                  }`}
                  title={!isAllowed ? `Step ${step.num} is restricted to ${step.allowedRoles.join('/')}` : undefined}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold ${
                        isCurrent
                          ? 'bg-[#991b1b] text-white'
                          : isPast
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {isPast ? '✓' : step.num}
                    </span>
                    <span
                      className={`text-xs font-bold hidden sm:inline ${
                        isCurrent ? 'text-[#991b1b]' : isPast ? 'text-emerald-800' : 'text-slate-600'
                      }`}
                    >
                      Step {step.num}
                    </span>
                  </div>
                  <p className={`text-xs font-extrabold truncate ${isCurrent ? 'text-slate-900' : 'text-slate-700'}`}>
                    {step.title}
                  </p>
                  <p className="text-[10px] text-slate-500 hidden md:block truncate">{step.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Authoritative Read-Only Donor Demographic & Registration Card for Clinical & Collection Stages */}
        {registrationRecord && currentStep > 1 && (
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-3xl p-5 sm:p-6 shadow-md border border-slate-700 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 pb-3.5">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-2xl bg-[#991b1b] text-white flex items-center justify-center font-extrabold text-sm shadow-xs">
                  {registrationRecord.donorDetails?.bloodGroup?.replace('_', ' ') || '🩸'}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-extrabold tracking-tight text-white">
                      {registrationRecord.donorDetails?.fullName || fullName || 'Donor Record'}
                    </h2>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-700 text-slate-200 font-mono">
                      {registrationRecord.registrationNumber || registrationId}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    {registrationRecord.donorDetails?.gender || gender} • {registrationRecord.donorDetails?.calculatedAge || calculatedAge ? `${registrationRecord.donorDetails?.calculatedAge || calculatedAge} yrs` : 'Age not specified'} • DOB: {registrationRecord.donorDetails?.dateOfBirth || dateOfBirth || '—'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Status: {registrationRecord.workflowStatus || 'COUNSELLING_PENDING'}
                </span>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-indigo-500/20 text-indigo-200 border border-indigo-500/30">
                  {callerRole === 'CLINICAL_STAFF' ? 'Clinical Staff View' : callerRole}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/50">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Primary Mobile</span>
                {registrationRecord.donorDetails?.primaryMobile || primaryMobile ? (
                  <span className="font-mono font-bold text-emerald-400">
                    +91 {registrationRecord.donorDetails?.primaryMobile || primaryMobile}
                  </span>
                ) : (
                  <span className="text-amber-400 font-semibold text-[11px]">
                    ⚠ Not provided during registration
                  </span>
                )}
              </div>

              <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/50">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Camp / Facility</span>
                <span className="font-bold text-slate-200 truncate block">
                  {registrationRecord.campTitle || camps.find((c) => c.id === selectedCampId)?.title || 'Camp Event'}
                </span>
              </div>

              <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/50">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Donation Type / Club</span>
                <span className="font-bold text-slate-200">
                  {registrationRecord.donationType || donationType} {registrationRecord.donorDetails?.donorClub && registrationRecord.donorDetails.donorClub !== 'None' ? `(${registrationRecord.donorDetails.donorClub})` : ''}
                </span>
              </div>

              <div className="bg-slate-800/80 p-2.5 rounded-xl border border-slate-700/50">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Permanent Address</span>
                <span className="text-slate-300 truncate block">
                  {[registrationRecord.donorDetails?.city || city, registrationRecord.donorDetails?.district || 'Pune'].filter(Boolean).join(', ') || '—'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* STEP 1: DONOR & DONATION DETAILS                         */}
        {/* ======================================================== */}
        {currentStep === 1 && (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-8 shadow-xs">
            {callerRole === 'CLINICAL_STAFF' && (
              <div className="bg-indigo-50 border border-indigo-200 text-indigo-900 p-4 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">ℹ️</span>
                  <div>
                    <p className="text-xs font-extrabold uppercase tracking-wider mb-0.5">
                      Clinical View: Donor Registration Summary (Read-Only)
                    </p>
                    <p className="text-xs font-semibold">
                      Demographic and contact details were recorded by the Camp Coordinator. Proceed to counselling when ready.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors shrink-0 shadow-xs cursor-pointer"
                >
                  Go to Counselling (Step 2) →
                </button>
              </div>
            )}
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                1. Donation & Facility Context
              </h2>
              <p className="text-xs text-slate-500">
                Select the parent blood centre, authorized organisation, and camp event.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Registration Source <span className="text-red-500">*</span>
                </label>
                <select
                  value={registrationSource}
                  onChange={(e) => {
                    const nextSource = e.target.value;
                    setRegistrationSource(nextSource);
                    if (nextSource === 'CAMP' && camps.length > 0) {
                      const c = camps.find((item) => item.id === selectedCampId) || camps[0];
                      if (c) {
                        setSelectedCampId(c.id);
                        if (c.organisationId) setSelectedOrgId(c.organisationId);
                      }
                    }
                  }}
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                >
                  <option value="CAMP">Camp Blood Drive</option>
                  <option value="IN_HOUSE">In-House Blood Centre</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Donation Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={donationType}
                  onChange={(e) => setDonationType(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                >
                  <option value="VOLUNTARY">Voluntary</option>
                  <option value="RELATIVE_VOLUNTARY">Relative Voluntary</option>
                  <option value="AUTOLOGOUS">Autologous</option>
                  <option value="RELATIVE">Relative / Replacement</option>
                </select>
              </div>

              {registrationSource === 'CAMP' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Selected Camp <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedCampId}
                    onChange={(e) => {
                      const newCampId = e.target.value;
                      setSelectedCampId(newCampId);
                      const matched = camps.find((c) => c.id === newCampId);
                      if (matched?.organisationId) {
                        setSelectedOrgId(matched.organisationId);
                      }
                    }}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                  >
                    {camps.length === 0 ? (
                      <option value="">No authorized camps assigned</option>
                    ) : (
                      camps.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.campCode} - {c.title}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Authorised Organisation <span className="text-red-500">*</span>
                </label>
                {registrationSource === 'CAMP' ? (
                  <div className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-slate-800 flex items-center justify-between min-h-[38px]">
                    <span className="truncate">
                      {(() => {
                        const currentCamp = camps.find((c) => c.id === selectedCampId);
                        const matchedOrg = currentCamp?.organisation || organisations.find((o) => o.id === (currentCamp?.organisationId || selectedOrgId));
                        if (matchedOrg) {
                          return `${matchedOrg.name} (${matchedOrg.orgCode || 'ORG'})`;
                        }
                        return loading ? 'Loading organisation...' : 'No parent organisation found';
                      })()}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-200 text-slate-600 rounded shrink-0 ml-1.5">
                      Derived from Camp
                    </span>
                  </div>
                ) : (
                  <select
                    value={selectedOrgId}
                    onChange={(e) => setSelectedOrgId(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                  >
                    {organisations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name} ({org.orgCode})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Validation alerts for Selected Camp */}
            {registrationSource === 'CAMP' && (() => {
              const currentCamp = camps.find((c) => c.id === selectedCampId);
              if (!currentCamp) return null;
              return (
                <div className="space-y-2 pt-2">
                  {!currentCamp.organisationId && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700 flex items-center gap-2">
                      <span>⚠</span>
                      <span>
                        Invalid Camp Configuration: This camp does not have an authoritative blood centre or parent organisation in the database. Registrations cannot proceed.
                      </span>
                    </div>
                  )}
                  {!currentCamp.isReadyForCollection && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-800 flex items-center gap-2">
                      <span>⏳</span>
                      <span>
                        <strong>Camp Readiness Pending:</strong> Operational readiness has not been verified for &quot;{currentCamp.title}&quot;. New registrations cannot be initiated until blood bank staff review and mark the camp ready.
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            <hr className="border-slate-100" />

            {/* Basic Demographics */}
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight mb-1">
                2. Donor Basic Details
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                Enter demographic and clinical classification identifiers.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="lg:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full Name as per official ID"
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Gender <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Transgender">Transgender</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Blood Group (If Known)
                  </label>
                  <select
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                  >
                    <option value="A_POS">A+ (A Positive)</option>
                    <option value="A_NEG">A- (A Negative)</option>
                    <option value="B_POS">B+ (B Positive)</option>
                    <option value="B_NEG">B- (B Negative)</option>
                    <option value="AB_POS">AB+ (AB Positive)</option>
                    <option value="AB_NEG">AB- (AB Negative)</option>
                    <option value="O_POS">O+ (O Positive)</option>
                    <option value="O_NEG">O- (O Negative)</option>
                    <option value="OH_BOMBAY">Bombay OH Phenotype</option>
                    <option value="DU_POSITIVE">Du Positive</option>
                    <option value="A2_POS">A2 Positive</option>
                    <option value="A2B_POS">A2B Positive</option>
                    <option value="UNIDENTIFIED">Unidentified</option>
                    <option value="NOT_KNOWN">Not Known</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Date of Birth <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Calculated Age (Read-only)
                  </label>
                  <input
                    type="text"
                    value={calculatedAge !== null ? `${calculatedAge} years` : 'Enter DOB to calculate'}
                    readOnly
                    className="w-full text-xs font-bold px-3 py-2.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-xl cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Marital Status</label>
                  <select
                    value={maritalStatus}
                    onChange={(e) => setMaritalStatus(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                  >
                    <option value="Unmarried">Unmarried</option>
                    <option value="Married">Married</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Profession</label>
                  <select
                    value={profession}
                    onChange={(e) => setProfession(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                  >
                    <option value="Businessman">Businessman</option>
                    <option value="Doctor">Doctor</option>
                    <option value="Housewife">Housewife</option>
                    <option value="Professional">Professional</option>
                    <option value="Service">Service</option>
                    <option value="Sportsman">Sportsman</option>
                    <option value="Student">Student</option>
                    <option value="Teacher">Teacher</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Donor Club</label>
                  <select
                    value={donorClub}
                    onChange={(e) => setDonorClub(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                  >
                    <option value="None">None</option>
                    <option value="Save Life">Save Life</option>
                    <option value="3 Month Donor">3 Month Donor</option>
                    <option value="6 Months Donor">6 Months Donor</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Donation Willingness</label>
                  <select
                    value={donationWillingness}
                    onChange={(e) => setDonationWillingness(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                  >
                    <option value="Whole Blood">Whole Blood</option>
                    <option value="Apheresis">Apheresis (Platelets / Plasma)</option>
                    <option value="Bone Marrow/Stem Cells">Bone Marrow / Stem Cells</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Aadhaar / National ID (Optional)
                  </label>
                  <input
                    type="text"
                    value={nationalIdAadhaar}
                    onChange={(e) => setNationalIdAadhaar(e.target.value)}
                    placeholder="12-digit Aadhaar (Masked on save)"
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">ABHA ID / Address</label>
                  <input
                    type="text"
                    value={abhaAddress}
                    onChange={(e) => setAbhaAddress(e.target.value)}
                    placeholder="e.g. username@abdm"
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Photo Upload */}
              <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-wrap items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white border border-slate-300 flex items-center justify-center overflow-hidden">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl text-slate-300">👤</span>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Donor Profile Photograph (Optional, max 800 KB)
                  </label>
                  <input
                    type="file"
                    accept="image/png, image/jpeg, image/gif"
                    onChange={handlePhotoUpload}
                    className="text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-[#991b1b] file:text-white hover:file:bg-[#7f1d1d] cursor-pointer"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Supported formats: JPG, PNG, GIF</p>
                </div>
              </div>
            </div>

            <hr className="border-slate-100" />

            {/* Contact Details & Cascading Location */}
            <div>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                    3. Contact Details & Address
                  </h2>
                  <p className="text-xs text-slate-500">
                    Cascading Indian state &amp; district selection and notification consents.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Primary Mobile with Safe Lookup */}
                <div className="lg:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Primary Mobile Number (10 digits) <span className="text-red-500">*</span>
                  </label>
                  <div className="flex rounded-xl overflow-hidden border border-slate-200 bg-slate-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-[#C51F3A]/20">
                    <span className="px-3 py-2.5 bg-slate-100 border-r border-slate-200 text-xs font-bold text-slate-600 select-none flex items-center">
                      🇮🇳 +91
                    </span>
                    <input
                      type="tel"
                      maxLength={10}
                      value={primaryMobile}
                      onChange={(e) => {
                        const raw = e.target.value;
                        let digits = raw.replace(/\D/g, '');
                        if (digits.startsWith('91') && digits.length > 10) {
                          digits = digits.slice(2);
                        } else if (digits.startsWith('0') && digits.length > 10) {
                          digits = digits.slice(1);
                        }
                        if (digits.length > 10) {
                          setMobileValidationError(`Primary mobile number cannot exceed 10 digits (pasted ${digits.length} digits).`);
                          return;
                        }
                        setPrimaryMobile(digits);
                        if (digits.length > 0 && digits.length < 10) {
                          setMobileValidationError(`Mobile number must be exactly 10 digits (currently ${digits.length} digits).`);
                        } else {
                          setMobileValidationError(null);
                        }
                      }}
                      placeholder="10-digit Indian mobile number"
                      className="flex-1 text-xs font-semibold px-3 py-2.5 bg-transparent border-0 focus:outline-hidden font-mono"
                      required
                    />
                    <button
                      type="button"
                      onClick={handlePhoneLookup}
                      disabled={lookingUpPhone || primaryMobile.length !== 10}
                      className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                    >
                      {lookingUpPhone ? 'Checking...' : 'Check Existing Profile'}
                    </button>
                  </div>
                  {mobileValidationError && (
                    <p className="text-[11px] font-bold text-red-600 mt-1.5 flex items-center gap-1">
                      <span>⚠</span> {mobileValidationError}
                    </p>
                  )}
                  {phoneLookupMsg && (
                    <p className="text-[11px] font-bold text-indigo-700 mt-1.5">{phoneLookupMsg}</p>
                  )}

                  {/* Explicit Confirmation Card for Matched Profile */}
                  {matchedProfile && (
                    <div className="mt-3 p-3.5 bg-indigo-50 border border-indigo-200 rounded-2xl space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-bold text-indigo-950">
                            Matching Donor Profile Found
                          </p>
                          <p className="text-[11px] text-indigo-800">
                            Name: <span className="font-bold">{matchedProfile.fullName}</span> | DOB: {matchedProfile.dateOfBirth?.split('T')[0] || 'N/A'} | Blood Group: {matchedProfile.bloodGroup || 'N/A'}
                          </p>
                          <p className="text-[11px] text-indigo-700">
                            Address: {matchedProfile.address || 'N/A'}, {matchedProfile.city || ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={confirmLoadMatchedProfile}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                        >
                          Load Profile Details
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMatchedProfile(null);
                            setPhoneLookupMsg('Ignored existing profile. Entering new details.');
                          }}
                          className="px-3 py-1.5 bg-white border border-indigo-200 text-indigo-800 hover:bg-indigo-50 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                        >
                          Keep Current Entry
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Secondary Mobile (Optional)
                  </label>
                  <input
                    type="tel"
                    value={secondaryMobile}
                    onChange={(e) => setSecondaryMobile(e.target.value)}
                    placeholder="Alternate contact"
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="donor@example.com"
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Residential Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="House/Flat No, Street, Landmark"
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                    required
                  />
                </div>

                {/* Cascading State */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    State <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={stateCode}
                    onChange={(e) => {
                      const newCode = Number(e.target.value);
                      setStateCode(newCode);
                      const dists = getDistrictsForState(newCode);
                      if (dists.length > 0) {
                        setDistrictCode(dists[0].code);
                      }
                    }}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                  >
                    {STATES_AND_DISTRICTS.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Cascading District */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    District <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={districtCode}
                    onChange={(e) => setDistrictCode(Number(e.target.value))}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                  >
                    {availableDistricts.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    City / Suburban Area <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                    required
                  >
                    <option value="">Select City / Town...</option>
                    {availablePermanentCities.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    {city && !availablePermanentCities.includes(city) && (
                      <option value={city}>{city}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">PIN Code</label>
                  <input
                    type="text"
                    value={pinCode}
                    onChange={(e) => setPinCode(e.target.value)}
                    placeholder="6-digit PIN"
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Repeat Donor Status</label>
                  <select
                    value={isRepeatDonor}
                    onChange={(e) => setIsRepeatDonor(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                  >
                    <option value="No">No / First Time Donor</option>
                    <option value="Yes">Yes (Repeat Donor)</option>
                    <option value="Unknown">Unknown</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Last Donation Date</label>
                  <input
                    type="date"
                    value={lastDonationDate}
                    onChange={(e) => setLastDonationDate(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Working Address Section */}
              <div className="mt-6 pt-6 border-t border-slate-100">
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">
                      Work / Office Address
                    </h3>
                    <p className="text-xs text-slate-500">
                      Workplace or official location for contact and verification.
                    </p>
                  </div>
                  <label className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 rounded-xl text-xs font-bold text-slate-800 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={workingSameAsPermanent}
                      onChange={(e) => setWorkingSameAsPermanent(e.target.checked)}
                      className="w-4 h-4 rounded text-[#991b1b] focus:ring-0"
                    />
                    <span>Working address same as permanent address</span>
                  </label>
                </div>

                {!workingSameAsPermanent ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-slate-50/80 rounded-2xl border border-slate-200">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Office / Work Address
                      </label>
                      <input
                        type="text"
                        value={workingAddress}
                        onChange={(e) => setWorkingAddress(e.target.value)}
                        placeholder="Company name, office building, street"
                        className="w-full text-xs font-semibold px-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Working State
                      </label>
                      <select
                        value={workingStateCode}
                        onChange={(e) => {
                          const newCode = Number(e.target.value);
                          setWorkingStateCode(newCode);
                          const dists = getDistrictsForState(newCode);
                          if (dists.length > 0) {
                            setWorkingDistrictCode(dists[0].code);
                          }
                        }}
                        className="w-full text-xs font-semibold px-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-hidden"
                      >
                        {STATES_AND_DISTRICTS.map((s) => (
                          <option key={s.code} value={s.code}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Working District
                      </label>
                      <select
                        value={workingDistrictCode}
                        onChange={(e) => setWorkingDistrictCode(Number(e.target.value))}
                        className="w-full text-xs font-semibold px-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-hidden"
                      >
                        {availableWorkingDistricts.map((d) => (
                          <option key={d.code} value={d.code}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Working City / Suburban Area
                      </label>
                      <select
                        value={workingCity}
                        onChange={(e) => setWorkingCity(e.target.value)}
                        className="w-full text-xs font-semibold px-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-hidden"
                      >
                        <option value="">Select City / Town...</option>
                        {availableWorkingCities.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                        {workingCity && !availableWorkingCities.includes(workingCity) && (
                          <option value={workingCity}>{workingCity}</option>
                        )}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Working PIN Code</label>
                      <input
                        type="text"
                        value={workingPinCode}
                        onChange={(e) => setWorkingPinCode(e.target.value)}
                        placeholder="6-digit PIN"
                        className="w-full text-xs font-semibold px-3 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-hidden"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                    <span>✓</span>
                    <span>Synchronised automatically with residential address.</span>
                  </div>
                )}
              </div>

              {/* Permissions & Consents */}
              <div className="mt-6 space-y-3">
                <div className="flex flex-wrap gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs font-bold text-slate-700">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smsPermission}
                      onChange={(e) => setSmsPermission(e.target.checked)}
                      className="w-4 h-4 rounded text-[#991b1b] focus:ring-0"
                    />
                    <span>Permission to send SMS alerts for blood donation drives</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={callPermission}
                      onChange={(e) => setCallPermission(e.target.checked)}
                      className="w-4 h-4 rounded text-[#991b1b] focus:ring-0"
                    />
                    <span>Permission to call for emergency urgent blood requirements</span>
                  </label>
                </div>

                {/* Donor Discovery Consent */}
                <label className="flex items-start gap-2.5 p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-2xl text-xs font-bold text-indigo-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={discoveryConsent}
                    onChange={(e) => setDiscoveryConsent(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded text-indigo-600 focus:ring-0"
                  />
                  <div>
                    <span>Donor Discovery Consent (Optional, default opt-out)</span>
                    <p className="text-[11px] font-normal text-indigo-800 mt-0.5">
                      Allow authorised RaktaSetu healthcare workers to discover and contact me for emergency or planned blood donation requests.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Coordinator Completion Confirmation Panel */}
            {coordinatorSubmitted && (
              <div className="p-5 bg-emerald-50 border border-emerald-300 rounded-2xl text-emerald-950 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">✓</span>
                  <h3 className="text-sm font-extrabold text-emerald-900">
                    Registration Queued for Clinical Screening
                  </h3>
                </div>
                <p className="text-xs text-emerald-800">
                  The donor demographic details have been recorded and placed into the Clinical Intake Queue. Clinical staff will now proceed with health questionnaire counselling and vitals screening.
                </p>
                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setRegistrationId(null);
                      setRegistrationRecord(null);
                      setFullName('');
                      setPrimaryMobile('');
                      setDateOfBirth('');
                      setAddress('');
                      setNationalIdAadhaar('');
                      setAbhaAddress('');
                      setCoordinatorSubmitted(false);
                      setSaveSuccessMsg(null);
                    }}
                    className="px-4 py-2 bg-[#991b1b] hover:bg-[#7f1d1d] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    + Register Another Donor
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push('/camp/dashboard')}
                    className="px-4 py-2 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-900 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    Return to Camp Workspace
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Actions */}
            {!coordinatorSubmitted && (
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <span className="text-xs text-slate-400">Step 1 of 5 — Donor Demographics &amp; Contact</span>
                {callerRole === 'CLINICAL_STAFF' ? (
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <span>Proceed to Counselling Questionnaire</span>
                    <span>→</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSaveDraft(2)}
                    disabled={saving}
                    className="px-6 py-2.5 bg-[#991b1b] hover:bg-[#7f1d1d] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
                  >
                    <span>{saving ? 'Saving & Queuing...' : 'Save & Proceed to Counselling'}</span>
                    <span>→</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}


        {/* ======================================================== */}
        {/* STEP 2: COUNSELLING DETAILS (ALL 26 QUESTIONS)           */}
        {/* ======================================================== */}
        {currentStep === 2 && (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
            {/* Clinical assessment notice */}
            <div className="bg-blue-50 border border-blue-200 text-blue-900 p-4 rounded-2xl flex items-start gap-3">
              <span className="text-xl">📋</span>
              <div className="flex-1">
                <p className="text-xs font-extrabold uppercase tracking-wider mb-0.5">
                  Clinical Pre-Donation Assessment &amp; Questionnaire
                </p>
                <p className="text-xs font-semibold leading-relaxed">
                  Authorised clinical staff must verify all questionnaire responses with the donor and record the evaluation before proceeding to physical screening.
                </p>
              </div>
            </div>

            {/* Staff Review Controls Header */}
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Counselled By <span className="text-red-500">*</span>
                </label>
                {staffLoading ? (
                  <div className="text-xs text-slate-500 py-2 animate-pulse font-medium">Loading clinical staff...</div>
                ) : (
                  <select
                    value={counsellingReviewedById}
                    onChange={(e) => setCounsellingReviewedById(e.target.value)}
                    className="w-full text-xs font-bold px-3 py-2 bg-white border border-slate-200 rounded-xl"
                    required
                  >
                    <option value="">
                      {clinicalStaff.length === 0 ? 'No clinical staff assigned' : 'Select Clinical Staff...'}
                    </option>
                    {clinicalStaff.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.name} ({staff.role})
                      </option>
                    ))}
                  </select>
                )}
                {staffError && <p className="text-[10px] text-red-600 mt-1 font-semibold">{staffError}</p>}
                {!staffLoading && clinicalStaff.length === 0 && (
                  <p className="text-[10px] text-amber-700 mt-1 font-semibold">
                    An authorised clinical staff assignment is required for this camp/organisation.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Overall Counselling Decision
                </label>
                <select
                  value={counsellingStatus}
                  onChange={(e) => setCounsellingStatus(e.target.value)}
                  className="w-full text-xs font-bold px-3 py-2 bg-white border border-slate-200 rounded-xl"
                >
                  <option value="APPROVED">Approved / Clinically Cleared</option>
                  <option value="APPROVED_DEFAULT">Approved as Standard</option>
                  <option value="DEFERRED">Deferred / Unfit</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Can Issue Plasma?</label>
                <select
                  value={canIssuePlasma ? 'Yes' : 'No'}
                  onChange={(e) => setCanIssuePlasma(e.target.value === 'Yes')}
                  className="w-full text-xs font-semibold px-3 py-2 bg-white border border-slate-200 rounded-xl"
                >
                  <option value="Yes">Yes (Cleared for Plasma issue)</option>
                  <option value="No">No</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Pre-donation Counselling Remarks
                </label>
                <input
                  type="text"
                  value={counsellingRemarks}
                  onChange={(e) => setCounsellingRemarks(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2 bg-white border border-slate-200 rounded-xl"
                />
              </div>

              {counsellingStatus === 'DEFERRED' && (
                <div className="sm:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-rose-50 border border-rose-200 rounded-xl">
                  <div>
                    <label className="block text-xs font-bold text-rose-900 mb-1">Deferral Type</label>
                    <select
                      value={counsellingDeferralType}
                      onChange={(e) => setCounsellingDeferralType(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 bg-white border border-rose-200 rounded-xl"
                    >
                      <option value="TEMPORARY">Temporary Deferral</option>
                      <option value="PERMANENT">Permanent Deferral</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-rose-900 mb-1">Deferral Reason</label>
                    <input
                      type="text"
                      value={counsellingDeferralReason}
                      onChange={(e) => setCounsellingDeferralReason(e.target.value)}
                      placeholder="Specify medical rationale for deferral"
                      className="w-full text-xs font-semibold px-3 py-2 bg-white border border-rose-200 rounded-xl"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* All 26 Questions Table */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <div className="bg-slate-900 text-white text-xs font-extrabold px-4 py-3 flex items-center justify-between">
                <span>All 26 Clinical Counselling Questions &amp; Pre-donation Checks</span>
                <span className="text-[10px] text-slate-400 font-mono">Total 26 Questions</span>
              </div>

              <div className="divide-y divide-slate-100">
                {counsellingAnswers.map((q, idx) => (
                  <div key={q.code || idx} className="p-4 hover:bg-slate-50/70 transition-colors space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 flex-1">
                        <span className="w-6 h-6 rounded-lg bg-slate-100 text-slate-700 text-xs font-extrabold flex items-center justify-center shrink-0">
                          {q.id || idx + 1}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-slate-900 leading-snug">{q.question}</p>
                          <span className="text-[10px] text-slate-400 font-semibold">{q.category}</span>
                        </div>
                      </div>

                      {/* Response Radio Pills */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {['Yes', 'No', 'Not applicable'].map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              const updated = [...counsellingAnswers];
                              updated[idx] = {
                                ...updated[idx],
                                answer: opt,
                                staffEdited: true,
                                isDemoDefault: false,
                              };
                              setCounsellingAnswers(updated);
                            }}
                            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              q.answer === opt
                                ? opt === 'Yes'
                                  ? 'bg-blue-600 text-white shadow-xs'
                                  : opt === 'No'
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'bg-slate-700 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Sub-options multi-select if available */}
                    {q.options && q.options.length > 0 && (
                      <div className="pl-8 pt-1 flex flex-wrap gap-1.5 items-center">
                        <span className="text-[10px] font-bold text-slate-500 mr-1">Conditions:</span>
                        {q.options.map((optionText: string) => {
                          const isSelected = q.selectedOptions?.includes(optionText);
                          return (
                            <button
                              key={optionText}
                              type="button"
                              onClick={() => {
                                const updated = [...counsellingAnswers];
                                let currentOpts = [...(updated[idx].selectedOptions || [])];

                                if (optionText === 'None of these') {
                                  currentOpts = ['None of these'];
                                } else {
                                  currentOpts = currentOpts.filter((o) => o !== 'None of these');
                                  if (isSelected) {
                                    currentOpts = currentOpts.filter((o) => o !== optionText);
                                    if (currentOpts.length === 0) currentOpts = ['None of these'];
                                  } else {
                                    currentOpts.push(optionText);
                                  }
                                }

                                updated[idx] = {
                                  ...updated[idx],
                                  selectedOptions: currentOpts,
                                  staffEdited: true,
                                  isDemoDefault: false,
                                };
                                setCounsellingAnswers(updated);
                              }}
                              className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold transition-colors cursor-pointer border ${
                                isSelected
                                  ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {isSelected ? '✓ ' : '+ '}
                              {optionText}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Editable Remarks per question */}
                    <div className="pl-8 flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400 shrink-0">Remarks:</span>
                      <input
                        type="text"
                        value={q.remarks || ''}
                        onChange={(e) => {
                          const updated = [...counsellingAnswers];
                          updated[idx] = {
                            ...updated[idx],
                            remarks: e.target.value,
                            staffEdited: true,
                            isDemoDefault: false,
                          };
                          setCounsellingAnswers(updated);
                        }}
                        placeholder="Add staff observation or leave default remarks"
                        className="flex-1 text-xs px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:bg-white focus:outline-hidden"
                      />
                      {q.isDemoDefault && (
                        <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded shrink-0">
                          Demo Prefill
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                ← Back to Donor Details
              </button>

              <button
                type="button"
                onClick={() => handleSaveDraft(3)}
                disabled={saving}
                className="px-6 py-2.5 bg-[#991b1b] hover:bg-[#7f1d1d] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                <span>Save &amp; Proceed to Screening</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* STEP 3: SCREENING DETAILS (PHYSICAL EXAM & VITALS)       */}
        {/* ======================================================== */}
        {currentStep === 3 && (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                3. Clinical Screening &amp; Medical Officer Review
              </h2>
              <p className="text-xs text-slate-500">
                Record physiological measurements and official fitness assessment.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Weight (kg) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                  placeholder="Min 45 kg"
                  className={`w-full text-xs font-bold px-3 py-2.5 rounded-xl border ${
                    parseFloat(weightKg) < 45 ? 'bg-amber-50 border-amber-400 text-amber-900' : 'bg-slate-50 border-slate-200'
                  }`}
                  required
                />
                {parseFloat(weightKg) < 45 && (
                  <p className="text-[10px] text-amber-700 font-bold mt-1">Warning: Weight below 45 kg minimum.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Haemoglobin (g/dL) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={hemoglobin}
                  onChange={(e) => setHemoglobin(e.target.value)}
                  placeholder="Min 12.5 g/dL"
                  className={`w-full text-xs font-bold px-3 py-2.5 rounded-xl border ${
                    parseFloat(hemoglobin) < 12.5 ? 'bg-amber-50 border-amber-400 text-amber-900' : 'bg-slate-50 border-slate-200'
                  }`}
                  required
                />
                {parseFloat(hemoglobin) < 12.5 && (
                  <p className="text-[10px] text-amber-700 font-bold mt-1">Warning: Hb below 12.5 g/dL standard.</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Screening Blood Group
                </label>
                <select
                  value={screeningBloodGroup}
                  onChange={(e) => setScreeningBloodGroup(e.target.value)}
                  className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="A_POS">A Positive (A+)</option>
                  <option value="A_NEG">A Negative (A-)</option>
                  <option value="B_POS">B Positive (B+)</option>
                  <option value="B_NEG">B Negative (B-)</option>
                  <option value="AB_POS">AB Positive (AB+)</option>
                  <option value="AB_NEG">AB Negative (AB-)</option>
                  <option value="O_POS">O Positive (O+)</option>
                  <option value="O_NEG">O Negative (O-)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Blood Pressure (Systolic / Diastolic)
                </label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    value={systolicBp}
                    onChange={(e) => setSystolicBp(e.target.value)}
                    placeholder="120"
                    className="w-1/2 text-xs font-bold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-center"
                  />
                  <span className="text-slate-400 font-bold">/</span>
                  <input
                    type="number"
                    value={diastolicBp}
                    onChange={(e) => setDiastolicBp(e.target.value)}
                    placeholder="80"
                    className="w-1/2 text-xs font-bold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-center"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Pulse (beats / min)</label>
                <input
                  type="number"
                  value={pulseBpm}
                  onChange={(e) => setPulseBpm(e.target.value)}
                  placeholder="60 - 100 bpm"
                  className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Oral Temperature (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={temperatureCelsius}
                  onChange={(e) => setTemperatureCelsius(e.target.value)}
                  placeholder="Normal: 36.5 - 37.5"
                  className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Height (cm)</label>
                <input
                  type="number"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  placeholder="e.g. 170"
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Process Type</label>
                <select
                  value={registrationProcessType}
                  onChange={(e) => setRegistrationProcessType(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="DONOR">DONOR (Whole Blood)</option>
                  <option value="Apheresis">Apheresis</option>
                  <option value="Granulocyte">Granulocyte</option>
                  <option value="BM Stem Cells">BM Stem Cells</option>
                  <option value="Leukapheresis">Leukapheresis</option>
                </select>
              </div>
            </div>

            {/* Inspection & Observations */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-800">Both Arms Inspected</p>
                  <p className="text-[10px] text-slate-500">Checking venepuncture site &amp; absence of skin tracks</p>
                </div>
                <button
                  type="button"
                  onClick={() => setBothArmsInspected(!bothArmsInspected)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    bothArmsInspected ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {bothArmsInspected ? 'Yes (Inspected)' : 'No'}
                </button>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-800">Post-donation Tips Given</p>
                  <p className="text-[10px] text-slate-500">Hydration, rest, and safety advisory explained</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPostDonationTipsGiven(!postDonationTipsGiven)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    postDonationTipsGiven ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {postDonationTipsGiven ? 'Yes (Given)' : 'No'}
                </button>
              </div>
            </div>

            {/* Screening Completion Handoff Banner */}
            {screeningSubmitted ? (
              <div className="p-6 bg-emerald-50 border border-emerald-300 rounded-3xl space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shrink-0">
                    ✓
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                      Medical Screening Decision Recorded
                    </span>
                    <h3 className="text-base font-extrabold text-emerald-950">
                      Donor Screening Assessment Completed (Reg #: {registrationRecord?.registrationNumber || 'Saved'})
                    </h3>
                    <p className="text-xs text-emerald-800 mt-1">
                      {screeningStatus === 'FIT'
                        ? 'Donor has been clinically cleared for blood collection and forwarded to the Collection Staff Queue.'
                        : screeningStatus === 'DEFERRED'
                        ? 'Donor has been clinically DEFERRED and safely excluded from collection eligibility.'
                        : 'Donor screening decision recorded as PENDING medical review.'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-white rounded-2xl border border-emerald-200 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Donor Name</span>
                    <span className="font-extrabold text-slate-800">{fullName}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Fitness Decision</span>
                    <span className={`font-extrabold ${screeningStatus === 'FIT' ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {screeningStatus}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Screened By</span>
                    <span className="font-bold text-slate-700">
                      {clinicalStaff.find((s) => s.id === screenedById)?.name || 'Clinical Staff'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Medical Officer</span>
                    <span className="font-bold text-slate-700">
                      {clinicalStaff.find((s) => s.id === medicalOfficerId)?.name || 'Medical Officer'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => router.push('/camp/dashboard')}
                    className="px-4 py-2 bg-[#991b1b] hover:bg-[#7f1d1d] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    Return to Clinical Queue
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScreeningSubmitted(false);
                      setRegistrationId(null);
                      setRegistrationRecord(null);
                      setFullName('');
                      setPrimaryMobile('');
                      setDateOfBirth('');
                      setCoordinatorSubmitted(false);
                      setCurrentStep(1);
                    }}
                    className="px-4 py-2 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-900 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    Evaluate Another Donor
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setScreeningSubmitted(false);
                      setCurrentStep(5);
                    }}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    View Registration Summary
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Clinical Staff Attribution */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Screened By <span className="text-red-500">*</span>
                    </label>
                    {staffLoading ? (
                      <div className="text-xs text-slate-500 py-2.5 animate-pulse font-medium">Loading clinical staff...</div>
                    ) : (
                      <select
                        value={screenedById}
                        onChange={(e) => setScreenedById(e.target.value)}
                        className="w-full text-xs font-bold px-3 py-2.5 bg-white border border-slate-200 rounded-xl"
                        required
                      >
                        <option value="">
                          {clinicalStaff.length === 0 ? 'No clinical staff assigned' : 'Select Clinical Staff...'}
                        </option>
                        {clinicalStaff.map((staff) => (
                          <option key={staff.id} value={staff.id}>
                            {staff.name} ({staff.role})
                          </option>
                        ))}
                      </select>
                    )}
                    {staffError && <p className="text-[10px] text-red-600 mt-1 font-semibold">{staffError}</p>}
                    {!staffLoading && clinicalStaff.length === 0 && (
                      <p className="text-[10px] text-amber-700 mt-1 font-semibold">
                        An authorised clinical staff assignment is required to record physical screening.
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-1">Staff member who performed physical exam &amp; vitals</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Medical Officer <span className="text-red-500">*</span>
                    </label>
                    {staffLoading ? (
                      <div className="text-xs text-slate-500 py-2.5 animate-pulse font-medium">Loading medical officers...</div>
                    ) : (
                      <select
                        value={medicalOfficerId}
                        onChange={(e) => setMedicalOfficerId(e.target.value)}
                        className="w-full text-xs font-bold px-3 py-2.5 bg-white border border-slate-200 rounded-xl"
                        required
                      >
                        {(() => {
                          const mos = clinicalStaff.filter((s) => s.isMedicalOfficer);
                          if (mos.length === 0) {
                            return <option value="">No authorised Medical Officers assigned</option>;
                          }
                          return (
                            <>
                              <option value="">Select Medical Officer...</option>
                              {mos.map((staff) => (
                                <option key={staff.id} value={staff.id}>
                                  {staff.name} ({staff.role})
                                </option>
                              ))}
                            </>
                          );
                        })()}
                      </select>
                    )}
                    {staffError && <p className="text-[10px] text-red-600 mt-1 font-semibold">{staffError}</p>}
                    {!staffLoading && clinicalStaff.filter((s) => s.isMedicalOfficer).length === 0 && (
                      <p className="text-[10px] text-rose-700 mt-1 font-semibold">
                        No authorised Medical Officers found for this camp/organisation. A qualified Medical Officer assignment is required before donors can be medically cleared.
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-1">Attending Medical Officer certifying donor fitness</p>
                  </div>
                </div>

                {/* Fitness Decision Box */}
                <div className="p-5 bg-slate-900 text-white rounded-2xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-red-300">
                        Medical Officer Decision
                      </span>
                      <h3 className="text-sm font-extrabold">Final Screening Fitness Status</h3>
                    </div>

                    <div className="flex items-center gap-2">
                      {['FIT', 'DEFERRED', 'PENDING'].map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setScreeningStatus(status)}
                          className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                            screeningStatus === status
                              ? status === 'FIT'
                                ? 'bg-emerald-500 text-slate-950 shadow-md'
                                : status === 'DEFERRED'
                                ? 'bg-rose-500 text-white shadow-md'
                                : 'bg-amber-400 text-slate-950 shadow-md'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>

                  {screeningStatus === 'DEFERRED' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-800">
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">Deferral Category</label>
                        <select
                          value={screeningDeferralCategory}
                          onChange={(e) => setScreeningDeferralCategory(e.target.value)}
                          className="w-full text-xs font-semibold px-3 py-2 bg-slate-800 text-white border border-slate-700 rounded-xl"
                        >
                          <option value="">Select Category</option>
                          <option value="LOW_HEMOGLOBIN">Low Hemoglobin</option>
                          <option value="RECENT_ILLNESS">Recent Illness / Fever</option>
                          <option value="MEDICATION">Active Medication</option>
                          <option value="WEIGHT_CRITERIA">Underweight (&lt; 45 kg)</option>
                          <option value="HYPERTENSION">Elevated Blood Pressure</option>
                          <option value="OTHER">Other Clinical Reason</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">Deferral Medical Notes</label>
                        <input
                          type="text"
                          value={screeningDeferralReason}
                          onChange={(e) => setScreeningDeferralReason(e.target.value)}
                          placeholder="Specific clinical findings"
                          className="w-full text-xs font-semibold px-3 py-2 bg-slate-800 text-white border border-slate-700 rounded-xl"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">Screening Observations</label>
                    <input
                      type="text"
                      value={screeningRemarks}
                      onChange={(e) => setScreeningRemarks(e.target.value)}
                      placeholder="Observations and clinical notes"
                      className="w-full text-xs font-semibold px-3 py-2 bg-slate-800 text-white border border-slate-700 rounded-xl"
                    />
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    ← Back to Counselling
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveDraft(3)}
                    disabled={saving}
                    className="px-6 py-2.5 bg-[#991b1b] hover:bg-[#7f1d1d] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
                  >
                    <span>{saving ? 'Completing Screening...' : 'Complete Screening & Forward to Collection'}</span>
                    <span>→</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* STEP 4: COLLECTION DETAILS (PHLEBOTOMY & BAG TRACKING)   */}
        {/* ======================================================== */}
        {currentStep === 4 && (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                4. Blood Collection &amp; Phlebotomy Details
              </h2>
              <p className="text-xs text-slate-500">
                Log the blood bag, phlebotomy duration, volume, and generate barcode identifiers.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Collection Outcome</label>
                <select
                  value={collectionStatus}
                  onChange={(e) => setCollectionStatus(e.target.value)}
                  className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="COLLECTED">Collected (Standard)</option>
                  <option value="INCOMPLETE">Incomplete Collection</option>
                  <option value="ADVERSE_EVENT_STOPPED">Stopped Due to Adverse Event</option>
                  <option value="NOT_COLLECTED">Not Collected</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Blood Bag Type</label>
                <select
                  value={bagType}
                  onChange={(e) => setBagType(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="SB-350">SB-350 (Single Bag 350 mL)</option>
                  <option value="SB-450">SB-450 (Single Bag 450 mL)</option>
                  <option value="DB-SAGM-350">DB-SAGM-350 (Double Bag)</option>
                  <option value="DB-SAGM-450">DB-SAGM-450 (Double Bag)</option>
                  <option value="TB-SAGM-350">TB-SAGM-350 (Triple Bag)</option>
                  <option value="TB-SAGM-450">TB-SAGM-450 (Triple Bag)</option>
                  <option value="QB-SAGM-350">QB-SAGM-350 (Quadruple Bag)</option>
                  <option value="QB-SAGM-450">QB-SAGM-450 (Quadruple Bag)</option>
                  <option value="DB-CPDA-350">DB-CPDA-350</option>
                  <option value="DB-CPDA-450">DB-CPDA-450</option>
                  <option value="TB-CPDA-350">TB-CPDA-350</option>
                  <option value="TB-CPDA-450">TB-CPDA-450</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Manufacturer</label>
                <select
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="Terumo Penpol">Terumo Penpol</option>
                  <option value="JMS">JMS</option>
                  <option value="JML">JML</option>
                  <option value="HLL">HLL</option>
                  <option value="Baxter">Baxter</option>
                  <option value="Fenwal">Fenwal</option>
                  <option value="Fresenius Kabi">Fresenius Kabi</option>
                  <option value="Polymed">Polymed</option>
                  <option value="J-Mitra">J-Mitra</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Lot Number</label>
                <input
                  type="text"
                  value={lotNumber}
                  onChange={(e) => setLotNumber(e.target.value)}
                  placeholder="e.g. LOT-202610-A"
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Segment Number</label>
                <input
                  type="text"
                  value={segmentNumber}
                  onChange={(e) => setSegmentNumber(e.target.value)}
                  placeholder="e.g. SEG-9941"
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Volume Collected (mL)</label>
                <input
                  type="number"
                  value={volumeMl}
                  onChange={(e) => setVolumeMl(e.target.value)}
                  placeholder="350 or 450"
                  className="w-full text-xs font-bold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Duration (Minutes)</label>
                <input
                  type="number"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  placeholder="e.g. 8"
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Less Quantity?</label>
                <select
                  value={isLessQuantity ? 'Yes' : 'No'}
                  onChange={(e) => setIsLessQuantity(e.target.value === 'Yes')}
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="No">No (Standard Volume)</option>
                  <option value="Yes">Yes (Less Quantity)</option>
                </select>
              </div>
            </div>

            {/* Timing & Refreshments */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Refreshments Provided At</label>
                <input
                  type="text"
                  value={timeRefreshmentsProvided}
                  onChange={(e) => setTimeRefreshmentsProvided(e.target.value)}
                  placeholder="e.g. 10:30 AM"
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Exit Time from Camp</label>
                <input
                  type="text"
                  value={exitTime}
                  onChange={(e) => setExitTime(e.target.value)}
                  placeholder="e.g. 10:45 AM"
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Adverse Reaction?</label>
                <select
                  value={adverseReaction ? 'Yes' : 'No'}
                  onChange={(e) => setAdverseReaction(e.target.value === 'Yes')}
                  className="w-full text-xs font-semibold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <option value="No">No Adverse Reaction</option>
                  <option value="Yes">Yes (Reaction Experienced)</option>
                </select>
              </div>

              {adverseReaction && (
                <div className="lg:col-span-3 p-4 bg-rose-50 border border-rose-200 rounded-2xl">
                  <label className="block text-xs font-bold text-rose-900 mb-1">
                    Adverse Reaction Details &amp; Management
                  </label>
                  <input
                    type="text"
                    value={adverseReactionDetails}
                    onChange={(e) => setAdverseReactionDetails(e.target.value)}
                    placeholder="e.g. Mild dizziness post phlebotomy; settled after oral fluids and rest."
                    className="w-full text-xs font-semibold px-3 py-2.5 bg-white border border-rose-300 rounded-xl"
                  />
                </div>
              )}
            </div>

            {/* Collection Completion Handoff Banner */}
            {collectionSubmitted ? (
              <div className="p-6 bg-emerald-50 border border-emerald-300 rounded-3xl space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-bold text-lg shrink-0">
                    ✓
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700">
                      Blood Collection Recorded Successfully
                    </span>
                    <h3 className="text-base font-extrabold text-emerald-950">
                      Collection Outcome Saved (Reg #: {registrationRecord?.registrationNumber || 'Saved'})
                    </h3>
                    <p className="text-xs text-emerald-800 mt-1">
                      Phlebotomy details and blood unit identifiers have been persisted. The donor record is now ready for final verification.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-white rounded-2xl border border-emerald-200 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Unit Number</span>
                    <span className="font-mono font-extrabold text-slate-800">{unitNumber || 'Generated'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Barcode</span>
                    <span className="font-mono font-bold text-indigo-700">{barcode || 'Generated'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Bag Type / Vol</span>
                    <span className="font-bold text-slate-700">{bagType} ({volumeMl} mL)</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block">Outcome</span>
                    <span className="font-extrabold text-emerald-700">{collectionStatus}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => router.push('/camp/dashboard?page=collection')}
                    className="px-4 py-2 bg-[#991b1b] hover:bg-[#7f1d1d] text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    Return to Collection Queue
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        window.location.href = `/camp/donor-registration?campId=${selectedCampId || ''}&orgId=${selectedOrgId || ''}`;
                      }
                    }}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    Record Another Donation
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCollectionSubmitted(false);
                      setCurrentStep(5);
                    }}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    View Registration Summary &amp; Barcode
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push('/camp/dashboard')}
                    className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    Return to Camp Dashboard
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Generated Unit Barcode Representation */}
                <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-300">
                      Traceable Unit Identifier
                    </span>
                    <p className="text-base font-extrabold font-mono mt-0.5">
                      {unitNumber || 'Auto-generated on Save (e.g. CU-202610-PUN-XXX)'}
                    </p>
                    <p className="text-xs text-indigo-200 mt-1">
                      Barcode: <strong className="font-mono text-white">{barcode || 'Auto-generated barcode'}</strong>
                    </p>
                  </div>

                  {barcode && (
                    <button
                      type="button"
                      onClick={() => setBarcodeModalOpen(true)}
                      className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-extrabold rounded-xl transition-colors cursor-pointer shrink-0"
                    >
                      View / Print Barcode Label
                    </button>
                  )}
                </div>

                {/* Bottom Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    ← Back to Screening
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveDraft(4)}
                    disabled={saving}
                    className="px-6 py-2.5 bg-[#991b1b] hover:bg-[#7f1d1d] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
                  >
                    <span>{saving ? 'Recording Collection...' : 'Save & Complete Collection'}</span>
                    <span>→</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ======================================================== */}
        {/* STEP 5: SUMMARY & COMPLETION                             */}
        {/* ======================================================== */}
        {currentStep === 5 && (
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
                  5. Registration Summary &amp; Verification
                </h2>
                <p className="text-xs text-slate-500">
                  Review all captured donor, counselling, screening, and collection details before final submission.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={!registrationId}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <span>📄</span>
                  <span>Preview / Download PDF</span>
                </button>
                {barcode && (
                  <button
                    type="button"
                    onClick={() => setBarcodeModalOpen(true)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    Barcode Label
                  </button>
                )}
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Card 1: Donor Details */}
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                    1. Donor Information
                  </h3>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="text-xs font-bold text-[#991b1b] hover:underline"
                  >
                    Edit Step 1
                  </button>
                </div>
                <div className="text-xs space-y-1 text-slate-700">
                  <p><strong>Name:</strong> {fullName || '—'}</p>
                  <p><strong>Gender / Age:</strong> {gender} / {calculatedAge ? `${calculatedAge} yrs` : '—'}</p>
                  <p><strong>Blood Group:</strong> <span className="font-bold text-[#991b1b]">{bloodGroup}</span></p>
                  <p><strong>Primary Mobile:</strong> +91 {primaryMobile.slice(-10)}</p>
                  <p><strong>Location:</strong> {city}, {STATES_AND_DISTRICTS.find((s) => s.code === stateCode)?.name}</p>
                  <p><strong>Repeat Donor:</strong> {isRepeatDonor} (Last: {lastDonationDate || 'None recorded'})</p>
                </div>
              </div>

              {/* Card 2: Counselling */}
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                    2. Counselling Assessment
                  </h3>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className="text-xs font-bold text-[#991b1b] hover:underline"
                  >
                    Edit Step 2
                  </button>
                </div>
                <div className="text-xs space-y-1 text-slate-700">
                  <p><strong>Counselled By:</strong> {clinicalStaff.find((s) => s.id === counsellingReviewedById)?.name || registrationRecord?.counselling?.reviewedByName || 'Clinical Staff'}</p>
                  <p><strong>Counselling State:</strong> {counsellingStatus}</p>
                  <p><strong>Questions Evaluated:</strong> 26 of 26 clinical criteria</p>
                  <p><strong>Can Issue Plasma:</strong> {canIssuePlasma ? 'Yes' : 'No'}</p>
                  <p><strong>Remarks:</strong> {counsellingRemarks}</p>
                </div>
              </div>

              {/* Card 3: Screening */}
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                    3. Screening Examination
                  </h3>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className="text-xs font-bold text-[#991b1b] hover:underline"
                  >
                    Edit Step 3
                  </button>
                </div>
                <div className="text-xs space-y-1 text-slate-700">
                  <p><strong>Screened By:</strong> {clinicalStaff.find((s) => s.id === screenedById)?.name || registrationRecord?.screening?.screenedByName || 'Clinical Staff'}</p>
                  <p><strong>Medical Officer:</strong> {clinicalStaff.find((s) => s.id === medicalOfficerId)?.name || registrationRecord?.screening?.medicalOfficerName || 'Medical Officer'}</p>
                  <p><strong>Fitness Decision:</strong> <strong className={screeningStatus === 'FIT' ? 'text-emerald-700 font-extrabold' : 'text-rose-700 font-extrabold'}>{screeningStatus}</strong></p>
                  <p><strong>Weight / Hb:</strong> {weightKg} kg / {hemoglobin} g/dL</p>
                  <p><strong>BP / Pulse / Temp:</strong> {systolicBp}/{diastolicBp} mmHg, {pulseBpm} bpm, {temperatureCelsius} °C</p>
                  <p><strong>Arms Inspected:</strong> {bothArmsInspected ? 'Yes' : 'No'}</p>
                  <p><strong>Observations:</strong> {screeningRemarks}</p>
                </div>
              </div>

              {/* Card 4: Collection */}
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                    4. Phlebotomy Collection
                  </h3>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(4)}
                    className="text-xs font-bold text-[#991b1b] hover:underline"
                  >
                    Edit Step 4
                  </button>
                </div>
                <div className="text-xs space-y-1 text-slate-700">
                  <p><strong>Status:</strong> {collectionStatus}</p>
                  <p><strong>Unit Identifier:</strong> <strong className="font-mono">{unitNumber || 'Assigned on complete'}</strong></p>
                  <p><strong>Bag Type &amp; Lot:</strong> {bagType} | {lotNumber}</p>
                  <p><strong>Volume Collected:</strong> {volumeMl} mL ({durationMinutes} mins)</p>
                  <p><strong>Adverse Reaction:</strong> {adverseReaction ? `Yes: ${adverseReactionDetails}` : 'None'}</p>
                </div>
              </div>
            </div>

            {/* Critical Clinical Notice */}
            <div className="p-4 bg-slate-100 border border-slate-300 rounded-2xl text-xs text-slate-600 leading-relaxed">
              <strong className="text-slate-900 block mb-0.5">Clinical Protocol &amp; Non-Inventory Safety Notice:</strong>
              Completing this registration records the phlebotomy collection episode. The collected unit requires compulsory quarantine, mandatory laboratory testing for transfusion-transmissible infections (HIV, HBV, HCV, Syphilis, Malaria), component separation, and authorised clinical release before it can become available inventory.
            </div>

            {/* Completion Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCurrentStep(4)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                ← Back to Collection
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSaveDraft()}
                  disabled={saving}
                  className="px-4 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  Save Draft
                </button>

                <button
                  type="button"
                  onClick={handleCompleteRegistration}
                  disabled={saving || registrationRecord?.isCompleted}
                  className="px-8 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  <span>✓</span>
                  <span>{registrationRecord?.isCompleted ? 'Registration Completed' : 'Complete Registration'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Barcode Visual Preview */}
        {barcodeModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
            <div className="bg-white rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl text-center">
              <h3 className="text-sm font-extrabold text-slate-900">Blood Unit Barcode Label</h3>
              <div className="p-4 bg-slate-50 border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center space-y-2">
                <div className="h-14 w-full bg-slate-900 flex items-center justify-center text-white font-mono text-sm tracking-widest font-bold rounded">
                  ||||| | |||| || |||||| | ||
                </div>
                <span className="font-mono text-xs font-extrabold text-slate-900">{barcode}</span>
                <span className="text-[11px] font-bold text-slate-600">Unit: {unitNumber}</span>
                <span className="text-[10px] text-slate-400">{selectedOrgId ? 'RaktaSetu Blood Centre' : ''}</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex-1 py-2 bg-[#991b1b] text-white text-xs font-bold rounded-xl hover:bg-[#7f1d1d] cursor-pointer"
                >
                  Print Label
                </button>
                <button
                  type="button"
                  onClick={() => setBarcodeModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function DonorRegistrationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="w-10 h-10 border-4 border-slate-300 border-t-[#B91C32] rounded-full animate-spin" />
        </div>
      }
    >
      <DonorRegistrationContent />
    </Suspense>
  );
}
