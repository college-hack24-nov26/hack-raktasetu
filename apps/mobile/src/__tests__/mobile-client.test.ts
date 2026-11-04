/**
 * RaktaSetu Mobile Client Integration & Validation Test Suite
 *
 * Verifies Milestone 02B requirements:
 * 1. API base URL configuration and override mechanisms
 * 2. Demo OTP authentication against backend API
 * 3. Secure token storage, retrieval, and logout lifecycle
 * 4. Explicit consent validation and session start
 * 5. Native location update payload validation and persistence
 * 6. Stopping sharing and preventing subsequent updates
 * 7. Offline/network failure handling (no false success)
 * 8. Stale/revoked session safety
 */

import http from 'http';
import { app } from '../../../api/src/app';
import { prisma } from '../../../api/src/lib/prisma';
import { initDonorLocationSchema } from '../../../api/src/lib/initDonorLocationSchema';
import { ApiClient, normalizeIndianMobile } from '../services/apiClient';
import { AuthStorage } from '../services/authStorage';
import { getApiBaseUrl, setRuntimeApiUrl, resolveHostForDevice } from '../config/api';

const TEST_PORT = 4088;
const TEST_API_URL = `http://127.0.0.1:${TEST_PORT}/api/v1`;
const DEMO_PHONE = '+919876543210';
const DEMO_OTP = '123456';

async function runMobileTestSuite() {
  console.log('========================================================================');
  console.log('  RaktaSetu — Mobile Client Integration & Verification Suite (M02B)');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(
        `[FAIL] ${testName}${detail !== undefined ? ` -> ${typeof detail === 'object' ? JSON.stringify(detail) : detail}` : ''}`
      );
      failed++;
    }
  }

  // Ensure DB schema is ready
  await initDonorLocationSchema();

  // Create isolated HTTP test server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(TEST_PORT, () => resolve());
  });
  console.log(`Test API server active on ${TEST_API_URL}\n`);

  try {
    // -------------------------------------------------------------
    // 1. API Configuration & Device Resolution
    // -------------------------------------------------------------
    console.log('--- 1. API Configuration & Device Resolution ---');
    const defaultUrl = getApiBaseUrl();
    assert(typeof defaultUrl === 'string' && defaultUrl.length > 0, 'Default API base URL is resolved');

    // Test emulator translation
    const emulatorUrl = resolveHostForDevice('http://localhost:4000/api/v1', true);
    assert(emulatorUrl.includes('10.0.2.2'), 'Emulator localhost translates to 10.0.2.2', emulatorUrl);

    // Test physical device custom runtime override
    setRuntimeApiUrl(TEST_API_URL);
    assert(getApiBaseUrl() === TEST_API_URL, 'Runtime API URL override successfully applied', getApiBaseUrl());

    // -------------------------------------------------------------
    // 2. Demo OTP Authentication
    // -------------------------------------------------------------
    console.log('\n--- 2. Demo OTP Authentication ---');
    
    // Request OTP
    const sendOtpRes = await ApiClient.sendOtp(DEMO_PHONE);
    assert(sendOtpRes.success === true, 'Request OTP returns success: true', sendOtpRes);

    // Verify OTP with wrong OTP
    const wrongOtpRes = await ApiClient.verifyOtp(DEMO_PHONE, '999999');
    assert(wrongOtpRes.success === false, 'Invalid OTP is rejected by API', wrongOtpRes.error);

    // Verify with valid demo OTP
    const verifyRes = await ApiClient.verifyOtp(DEMO_PHONE, DEMO_OTP);
    assert(verifyRes.success === true, 'Verify OTP succeeds with demo OTP 123456');
    assert(typeof verifyRes.data?.token === 'string' && verifyRes.data.token.length > 20,
      'Response contains valid session token');
    assert(verifyRes.data?.user?.phoneNumber === DEMO_PHONE, 'Response contains authenticated donor profile', verifyRes.data?.user);

    // -------------------------------------------------------------
    // 3. Secure Storage & Token Lifecycle
    // -------------------------------------------------------------
    console.log('\n--- 3. Secure Storage Lifecycle ---');
    const token = verifyRes.data!.token;
    await AuthStorage.saveToken(token);
    await AuthStorage.saveUser({
      id: verifyRes.data!.user.id,
      phoneNumber: verifyRes.data!.user.phoneNumber,
      name: verifyRes.data!.user.name,
      bloodGroup: verifyRes.data!.user.donorProfile?.bloodGroup || 'O_POSITIVE',
      districtCode: 27,
      stateCode: 27,
    });

    const savedToken = await AuthStorage.getToken();
    assert(savedToken === token, 'AuthStorage persists session token');

    const savedUser = await AuthStorage.getUser();
    assert(savedUser?.phoneNumber === DEMO_PHONE, 'AuthStorage persists user details');

    // -------------------------------------------------------------
    // 4. Explicit Consent & Session Lifecycle
    // -------------------------------------------------------------
    console.log('\n--- 4. Explicit Consent & Session Start ---');

    // Verify rejection without explicit consent
    const rejectedStartRes = await ApiClient.startLocationSession({
      consentGranted: false,
      consentVersion: '1.0',
    });
    assert(rejectedStartRes.success === false, 'Session creation without explicit consent is rejected');
    assert(rejectedStartRes.error?.code === 'CONSENT_REQUIRED', 'Rejection code is CONSENT_REQUIRED', rejectedStartRes.error);

    // Consent granted
    const consentPayload = {
      consentGranted: true,
      consentVersion: '1.0',
    };

    const sessionStartRes = await ApiClient.startLocationSession(consentPayload);

    assert(sessionStartRes.success === true, 'Location session started successfully with explicit consent', sessionStartRes);
    assert(typeof sessionStartRes.data?.id === 'string', 'Session response returns session id', sessionStartRes.data?.id);
    assert(sessionStartRes.data?.status === 'ACTIVE', 'New session has ACTIVE status');

    const activeSessionId = sessionStartRes.data!.id;
    await AuthStorage.saveActiveSessionId(activeSessionId);
    const storedSessionId = await AuthStorage.getActiveSessionId();
    assert(storedSessionId === activeSessionId, 'Active session ID saved in local storage');

    // -------------------------------------------------------------
    // 5. Native Location Update Verification & Persistence
    // -------------------------------------------------------------
    console.log('\n--- 5. Location Upload Contract & Persistence ---');
    const locationUpdatePayload = {
      sessionId: activeSessionId,
      latitude: 19.0760,
      longitude: 72.8777,
      accuracy: 12.5,
      deviceTimestamp: new Date().toISOString(),
      batteryLevel: 0.85,
    };

    const updateRes = await ApiClient.updateLocation(locationUpdatePayload);

    assert(updateRes.success === true, 'Location update accepted by backend', updateRes);
    assert(typeof updateRes.data?.serverReceivedAt === 'string', 'Backend returned server receipt timestamp');

    // Verify DB persistence
    const donorRecord = await (prisma as any).user.findUnique({
      where: { phoneNumber: DEMO_PHONE },
    });
    assert(!!donorRecord, 'Donor user record exists in DB');

    const latestLocation = await (prisma as any).donorLatestLocation.findUnique({
      where: { donorUserId: donorRecord!.id },
    });
    assert(!!latestLocation, 'Latest location record persisted in DB');
    assert(Number(latestLocation!.latitude) === 19.0760 && Number(latestLocation!.longitude) === 72.8777,
      'Persisted coordinates match uploaded coordinates',
      { lat: Number(latestLocation!.latitude), lng: Number(latestLocation!.longitude) }
    );
    assert(latestLocation!.sessionId === activeSessionId, 'Latest location linked to active session ID');

    // -------------------------------------------------------------
    // 6. Stop Sharing & Preventing Subsequent Uploads
    // -------------------------------------------------------------
    console.log('\n--- 6. Session Stop & Upload Invalidation ---');
    const stopRes = await ApiClient.stopLocationSession({
      sessionId: activeSessionId,
      reason: 'DONOR_STOPPED',
    });

    assert(stopRes.success === true, 'Session successfully stopped on server', stopRes);
    assert(stopRes.data?.status === 'STOPPED', 'Stopped session status is STOPPED');

    // Attempting further location upload on stopped session must be rejected
    const postStopRes = await ApiClient.updateLocation({
      sessionId: activeSessionId,
      latitude: 19.0800,
      longitude: 72.8800,
      accuracy: 10.0,
      deviceTimestamp: new Date().toISOString(),
    });
    assert(postStopRes.success === false, 'Upload on stopped session rejected by server');
    assert(postStopRes.error?.code === 'NO_ACTIVE_SESSION' || postStopRes.error?.message.includes('No active'),
      'Stopped session update reports NO_ACTIVE_SESSION error code', postStopRes.error);

    // -------------------------------------------------------------
    // 7. Network Failure / Offline Handling (No False Success)
    // -------------------------------------------------------------
    console.log('\n--- 7. Network Failure & Offline Handling ---');
    setRuntimeApiUrl('http://127.0.0.1:4099/api/v1'); // Unreachable port
    const unreachableRes = await ApiClient.sendOtp('+919876543210');
    assert(unreachableRes.success === false, 'Unreachable endpoint returns failure (not false success)');
    assert(unreachableRes.error?.code === 'NETWORK_ERROR', 'Network failure cleanly classified as NETWORK_ERROR');

    // Reset URL
    setRuntimeApiUrl(TEST_API_URL);

    // -------------------------------------------------------------
    // 8. Milestone 04B: Camp Staff Operations & Role Resolution
    // -------------------------------------------------------------
    console.log('\n--- 8. Camp Staff Assignments & Role Resolution (M04B) ---');

    // Clean up any lingering assignments and attendances from prior runs to ensure test idempotency
    const testPhoneNumbers = ['+919888877771', '+919888877772', '+919888877773', '+919999000001'];
    await (prisma as any).clinicalScreening.deleteMany({
      where: { camp: { campCode: { in: ['CAMP-M04B-001', 'CAMP-M04B-002', 'CAMP-M04E-003'] } } },
    });
    await (prisma as any).campAttendance.deleteMany({
      where: { camp: { campCode: { in: ['CAMP-M04B-001', 'CAMP-M04B-002', 'CAMP-M04E-003'] } } },
    });
    await (prisma as any).campStaffAssignment.deleteMany({
      where: { userId: donorRecord!.id },
    });
    await (prisma as any).donorProfile.deleteMany({
      where: { user: { phoneNumber: { in: testPhoneNumbers } } },
    });
    await (prisma as any).session.deleteMany({
      where: { user: { phoneNumber: { in: testPhoneNumbers } } },
    });
    await (prisma as any).user.deleteMany({
      where: { phoneNumber: { in: testPhoneNumbers } },
    });

    // 8.1 Ordinary donor with no assignments
    const noAssignmentsRes = await ApiClient.getMyCampAssignments();
    assert(noAssignmentsRes.success === true, 'Get camp assignments returns success for authenticated user');
    assert(Array.isArray(noAssignmentsRes.data) && noAssignmentsRes.data.length === 0,
      'Donor without staff assignments returns empty list (no false access granted)');

    // 8.2 Create test organisation, camps, and assignments for verification
    const testOrg = await (prisma as any).organisation.upsert({
      where: { orgCode: 'ORG-TEST-M04B' },
      update: {},
      create: {
        orgCode: 'ORG-TEST-M04B',
        name: 'Milestone 04B Test Blood Bank',
        licenseNumber: 'LIC-TEST-M04B-01',
        stateCode: 27,
        districtCode: 521,
        status: 'VERIFIED',
      },
    });

    const testCamp1 = await (prisma as any).camp.upsert({
      where: { campCode: 'CAMP-M04B-001' },
      update: { status: 'APPROVED', isReadyForCollection: true, title: 'Pune Metro Camp 1' },
      create: {
        campCode: 'CAMP-M04B-001',
        title: 'Pune Metro Camp 1',
        organizerName: 'Red Cross Pune',
        targetDate: new Date('2026-11-15T09:00:00Z'),
        timeSlot: '09:00 AM - 03:00 PM',
        venue: 'Metro Station Hall, Shivajinagar, Pune',
        districtCode: 521,
        stateCode: 27,
        status: 'APPROVED',
        isReadyForCollection: true,
        organisationId: testOrg.id,
      },
    });

    const testCamp2 = await (prisma as any).camp.upsert({
      where: { campCode: 'CAMP-M04B-002' },
      update: { status: 'APPROVED', isReadyForCollection: false },
      create: {
        campCode: 'CAMP-M04B-002',
        title: 'Kothrud Community Drive',
        organizerName: 'Rotary Club Kothrud',
        targetDate: new Date('2026-11-20T10:00:00Z'),
        timeSlot: '10:00 AM - 04:00 PM',
        venue: 'Kothrud Community Centre, Pune',
        districtCode: 521,
        stateCode: 27,
        status: 'APPROVED',
        isReadyForCollection: false,
        organisationId: testOrg.id,
      },
    });

    const assignment1 = await (prisma as any).campStaffAssignment.upsert({
      where: {
        userId_campId_role: {
          userId: donorRecord!.id,
          campId: testCamp1.id,
          role: 'CAMP_COORDINATOR',
        },
      },
      update: { isActive: true },
      create: {
        campId: testCamp1.id,
        userId: donorRecord!.id,
        organisationId: testOrg.id,
        role: 'CAMP_COORDINATOR',
        isActive: true,
        assignedBy: donorRecord!.id,
      },
    });

    // 8.3 Query assignments for coordinator with 1 assignment
    const coordinatorRes1 = await ApiClient.getMyCampAssignments();
    assert(coordinatorRes1.success === true, 'Coordinator assignment query returns success: true');
    assert(Array.isArray(coordinatorRes1.data) && coordinatorRes1.data.length >= 1,
      'Authorized coordinator receives assigned camp list');

    const matchedCamp1 = coordinatorRes1.data?.find((c) => c.campId === testCamp1.id);
    assert(!!matchedCamp1, 'Assigned camp 1 found in returned assignments');
    assert(matchedCamp1?.role === 'CAMP_COORDINATOR', 'Returned role is accurately CAMP_COORDINATOR');
    assert(matchedCamp1?.campCode === 'CAMP-M04B-001', 'Camp code matches expected identifier');
    assert(matchedCamp1?.isReadyForCollection === true, 'Operational readiness accurately reported as true');

    // 8.4 Multiple assignments support
    const assignment2 = await (prisma as any).campStaffAssignment.upsert({
      where: {
        userId_campId_role: {
          userId: donorRecord!.id,
          campId: testCamp2.id,
          role: 'CAMP_COORDINATOR',
        },
      },
      update: { isActive: true },
      create: {
        campId: testCamp2.id,
        userId: donorRecord!.id,
        organisationId: testOrg.id,
        role: 'CAMP_COORDINATOR',
        isActive: true,
        assignedBy: donorRecord!.id,
      },
    });

    const coordinatorRes2 = await ApiClient.getMyCampAssignments();
    assert(Array.isArray(coordinatorRes2.data) && coordinatorRes2.data.length >= 2,
      'Coordinator with multiple assignments receives all authorized camps');

    // 8.5 Local cache lifecycle
    await AuthStorage.saveCachedAssignments(coordinatorRes2.data || []);
    const cachedAssignments = await AuthStorage.getCachedAssignments();
    assert(Array.isArray(cachedAssignments) && cachedAssignments.length >= 2,
      'Cached assignments safely persisted in AuthStorage for display/offline resilience');

    // 8.6 Revocation / deactivation safety (server is strictly authoritative)
    await (prisma as any).campStaffAssignment.update({
      where: { id: assignment1.id },
      data: { isActive: false },
    });
    await (prisma as any).campStaffAssignment.update({
      where: { id: assignment2.id },
      data: { isActive: false },
    });

    const revokedRes = await ApiClient.getMyCampAssignments();
    assert(Array.isArray(revokedRes.data) && revokedRes.data.length === 0,
      'Revoked assignments are immediately excluded by backend (server is authoritative)');

    // -------------------------------------------------------------
    // 9. Milestone 04C: Camp Operations Hub & Logistical Management
    // -------------------------------------------------------------
    console.log('\n--- 9. Milestone 04C: Camp Operations Hub & Logistical Management ---');

    // Re-activate assignment 1 for testCamp1 to test operations methods
    await (prisma as any).campStaffAssignment.update({
      where: { id: assignment1.id },
      data: { isActive: true },
    });

    // 9.1 Hardened Assignment Authorization: Active vs Revoked
    const activeAssignmentsRes = await ApiClient.getMyCampAssignments();
    assert(activeAssignmentsRes.success === true, 'Server-verified assignment query succeeds');
    assert(activeAssignmentsRes.data?.some((c) => c.campId === testCamp1.id) === true,
      'Active assignment grants server verification');

    // 9.2 Camp Details Integration (GET /api/v1/camps/:id)
    const campDetailsRes = await ApiClient.getCampDetails(testCamp1.id);
    assert(campDetailsRes.success === true, 'getCampDetails returns success: true');
    assert(campDetailsRes.data?.camp?.campCode === 'CAMP-M04B-001', 'Camp details contains authoritative campCode');
    assert(campDetailsRes.data?.camp?.title === 'Pune Metro Camp 1', 'Camp details contains authoritative title');
    assert(campDetailsRes.data?.camp?.organisation?.name === testOrg.name, 'Camp details contains parent blood bank organisation');

    // 9.3 Camp Analytics Integration (GET /api/v1/camps/:id/analytics)
    const analyticsRes = await ApiClient.getCampAnalytics(testCamp1.id);
    assert(analyticsRes.success === true, 'getCampAnalytics returns success: true');
    assert(typeof analyticsRes.data?.registeredDonors === 'number', 'Analytics contains registeredDonors metric');
    assert(typeof analyticsRes.data?.checkedInDonors === 'number', 'Analytics contains checkedInDonors metric');
    assert(typeof analyticsRes.data?.screenedDonors === 'number', 'Analytics contains screenedDonors metric');
    assert(typeof analyticsRes.data?.completedDonations === 'number', 'Analytics contains completedDonations metric');
    assert(Array.isArray(analyticsRes.data?.bloodGroups), 'Analytics contains bloodGroups breakdown array');

    // 9.4 Operational Readiness Verification (POST /api/v1/camps/:id/readiness)
    // 9.4.1 Incomplete checklist must be rejected by backend
    const incompleteChecklistRes = await ApiClient.verifyCampReadiness(testCamp1.id, {
      isReadyForCollection: true,
      readinessChecklist: {
        staffAssigned: true,
        coldChainVerified: true,
        emergencyKitAvailable: true,
        consumablesStocked: false, // Incomplete!
        spaceSanitized: true,
      },
    });
    assert(incompleteChecklistRes.success === false, 'Incomplete readiness checklist rejected by backend (400)');

    // 9.4.2 Non-approved camp must be rejected
    await (prisma as any).camp.update({
      where: { id: testCamp2.id },
      data: { status: 'PROPOSED' },
    });
    const unapprovedCampReadinessRes = await ApiClient.verifyCampReadiness(testCamp2.id, {
      isReadyForCollection: true,
      readinessChecklist: {
        staffAssigned: true,
        coldChainVerified: true,
        emergencyKitAvailable: true,
        consumablesStocked: true,
        spaceSanitized: true,
      },
    });
    assert(unapprovedCampReadinessRes.success === false,
      'Readiness verification rejected for non-approved camp (400)');
    // Restore testCamp2 status
    await (prisma as any).camp.update({
      where: { id: testCamp2.id },
      data: { status: 'APPROVED' },
    });

    // 9.4.3 Valid 5-item checklist accepted
    const validReadinessRes = await ApiClient.verifyCampReadiness(testCamp1.id, {
      isReadyForCollection: true,
      readinessChecklist: {
        staffAssigned: true,
        coldChainVerified: true,
        emergencyKitAvailable: true,
        consumablesStocked: true,
        spaceSanitized: true,
      },
      readinessNotes: 'Cold chain verified at 4.2C; staff briefed.',
    });
    assert(validReadinessRes.success === true, 'Complete 5-item readiness checklist accepted (200)');
    assert(validReadinessRes.data?.isReadyForCollection === true, 'Camp declared ready for collection in response');

    // Verify persisted readiness in camp details
    const verifiedDetails = await ApiClient.getCampDetails(testCamp1.id);
    assert(verifiedDetails.data?.camp?.isReadyForCollection === true, 'Persisted readiness verified in camp details');
    assert(Boolean(verifiedDetails.data?.camp?.readinessVerifiedAt), 'readinessVerifiedAt timestamp populated');

    // 9.5 Camp Logistics Management (PATCH /api/v1/camps/:id)
    // 9.5.1 Invalid expected donors rejected
    const invalidDonorsRes = await ApiClient.editCamp(testCamp1.id, {
      expectedDonors: -5,
    });
    assert(invalidDonorsRes.success === false, 'Invalid negative expectedDonors rejected by backend');

    // 9.5.2 Valid update accepted
    const validEditRes = await ApiClient.editCamp(testCamp1.id, {
      title: 'Pune Metro Camp 1 (Updated)',
      venue: 'New Main Concourse, Shivajinagar Metro, Pune',
      expectedDonors: 125,
      timeSlot: '08:30 AM - 03:30 PM',
      coordinatorContact: '+919876543210',
    });
    assert(validEditRes.success === true, 'Valid logistics update accepted by backend');
    assert(validEditRes.data?.venue === 'New Main Concourse, Shivajinagar Metro, Pune', 'Updated venue returned');

    // 9.5.3 Completed/cancelled camp editing rejected
    await (prisma as any).camp.update({
      where: { id: testCamp2.id },
      data: { status: 'COMPLETED' },
    });
    const completedCampEditRes = await ApiClient.editCamp(testCamp2.id, {
      venue: 'Attempted edit on completed camp',
    });
    assert(completedCampEditRes.success === false, 'Editing completed camp rejected by backend');

    // 9.6 Assigned Staff Roster (GET /api/v1/camps/:id/staff)
    const staffRes = await ApiClient.getCampStaff(testCamp1.id);
    assert(staffRes.success === true, 'getCampStaff returns success: true');
    assert(Array.isArray(staffRes.data) && staffRes.data.length >= 1, 'Assigned staff roster returned as array');
    const matchedStaff = staffRes.data?.find((s) => s.userId === donorRecord!.id);
    assert(!!matchedStaff, 'Coordinator found in assigned staff roster');
    assert(matchedStaff?.role === 'CAMP_COORDINATOR', 'Staff role is CAMP_COORDINATOR');

    // -------------------------------------------------------------
    // 10. Milestone 04D: Donor Lookup, Walk-in Registration & Attendance
    // -------------------------------------------------------------
    console.log('\n--- 10. Milestone 04D: Donor Lookup, Walk-in Registration & Attendance ---');

    // 10.1 Phone Normalization & Validation Helper
    const validNorm1 = normalizeIndianMobile('9876543210');
    assert(validNorm1.valid === true && validNorm1.normalized === '+919876543210',
      'Normalizes standard 10-digit Indian phone to +91XXXXXXXXXX');

    const validNorm2 = normalizeIndianMobile('+919876543210');
    assert(validNorm2.valid === true && validNorm2.normalized === '+919876543210',
      'Preserves already normalized +91 phone');

    const validNorm3 = normalizeIndianMobile('919876543210');
    assert(validNorm3.valid === true && validNorm3.normalized === '+919876543210',
      'Normalizes 12-digit 91XXXXXXXXXX to +91XXXXXXXXXX');

    const invalidNorm1 = normalizeIndianMobile('12345');
    assert(invalidNorm1.valid === false, 'Rejects short phone numbers');

    const invalidNorm2 = normalizeIndianMobile('abcdefghij');
    assert(invalidNorm2.valid === false, 'Rejects non-numeric phone strings');

    // 10.2 Donor Lookup (GET /api/v1/camps/:id/donor-lookup)
    // 10.2.1 Donor not found in directory
    const notFoundLookupRes = await ApiClient.lookupDonor(testCamp1.id, '+919999900001');
    assert(notFoundLookupRes.success === true, 'lookupDonor returns success for unknown phone');
    assert(notFoundLookupRes.data?.found === false, 'Donor found flag is false for unregistered phone');
    assert(notFoundLookupRes.data?.alreadyRegistered === false, 'alreadyRegistered flag is false');
    assert(notFoundLookupRes.data?.donor === null, 'donor details null when not found');

    // 10.2.2 Existing donor lookup in directory
    const existingLookupRes = await ApiClient.lookupDonor(testCamp1.id, DEMO_PHONE);
    assert(existingLookupRes.success === true, 'lookupDonor returns success for existing donor');
    assert(existingLookupRes.data?.found === true, 'Donor found flag is true for existing donor');
    assert(typeof existingLookupRes.data?.donor?.maskedPhone === 'string',
      'Donor details contains masked phone number');
    assert(typeof existingLookupRes.data?.donor?.isEligible === 'boolean',
      'Donor details contains authoritative isEligible flag');

    // 10.3 Registration Gated by Operational Readiness
    // Camp 2 is not ready for collection -> registration must be rejected
    const unreadyRegRes = await ApiClient.registerCampAttendance(testCamp2.id, {
      phoneOrUserId: '9888877771',
      donorName: 'Unready Drive Walkin',
    });
    assert(unreadyRegRes.success === false,
      'Attendance registration rejected when camp is not ready for collection');

    // 10.4 Walk-in Donor Registration (POST /api/v1/camps/:id/attendance)
    const walkinPhone = '9888877771';
    const walkinRegRes = await ApiClient.registerCampAttendance(testCamp1.id, {
      phoneOrUserId: walkinPhone,
      donorName: 'Anil Deshmukh',
      bloodGroup: 'B_POS',
    });
    assert(walkinRegRes.success === true, 'Walk-in donor attendance registered successfully');
    assert(walkinRegRes.data?.status === 'REGISTERED', 'New attendance status is REGISTERED');
    assert(walkinRegRes.data?.donorName === 'Anil Deshmukh', 'Registered donor name matches input');
    const walkinAttendanceId = walkinRegRes.data?.id || '';

    // 10.5 Duplicate Registration Prevention (409 DUPLICATE_ATTENDANCE)
    const duplicateRegRes = await ApiClient.registerCampAttendance(testCamp1.id, {
      phoneOrUserId: walkinPhone,
      donorName: 'Anil Deshmukh Duplicate',
    });
    assert(duplicateRegRes.success === false,
      'Duplicate attendance registration rejected by backend');
    assert(duplicateRegRes.error?.code === 'DUPLICATE_ATTENDANCE',
      'Duplicate error code is DUPLICATE_ATTENDANCE (409)');

    // 10.6 Attendance Roster Listing (GET /api/v1/camps/:id/attendance)
    const rosterRes = await ApiClient.getCampAttendanceRoster(testCamp1.id);
    assert(rosterRes.success === true, 'getCampAttendanceRoster returns success: true');
    assert(Array.isArray(rosterRes.data) && rosterRes.data.length >= 1,
      'Attendance roster returned as array with registered donor');
    const matchedRosterItem = rosterRes.data?.find((a) => a.id === walkinAttendanceId);
    assert(!!matchedRosterItem, 'Registered walk-in donor found in camp roster');
    assert(matchedRosterItem?.status === 'REGISTERED', 'Roster item status is REGISTERED');
    assert(matchedRosterItem?.bloodGroup === 'B_POS', 'Roster item bloodGroup matches');

    // 10.7 Check-in Gated by Readiness
    // Ensure testCamp2 has isReadyForCollection = false
    await (prisma as any).camp.update({
      where: { id: testCamp2.id },
      data: { isReadyForCollection: false, status: 'APPROVED' },
    });
    // Create attendance record on testCamp2 directly in DB
    const camp2Attendance = await (prisma as any).campAttendance.create({
      data: {
        campId: testCamp2.id,
        userId: donorRecord!.id,
        donorName: 'Camp 2 Test Donor',
        donorPhone: DEMO_PHONE,
        status: 'REGISTERED',
      },
    });
    const unreadyCheckInRes = await ApiClient.checkInAttendance(testCamp2.id, camp2Attendance.id);
    assert(unreadyCheckInRes.success === false,
      'Physical arrival check-in blocked when camp is not ready for collection');

    // 10.8 Physical Arrival Check-in (POST /api/v1/camps/:id/attendance/:attendanceId/check-in)
    const checkInRes = await ApiClient.checkInAttendance(testCamp1.id, walkinAttendanceId);
    assert(checkInRes.success === true, 'Physical arrival check-in succeeds on ready camp');
    assert(checkInRes.data?.status === 'CHECKED_IN', 'Updated attendance status is CHECKED_IN');
    assert(typeof checkInRes.data?.checkedInAt === 'string', 'checkedInAt timestamp is populated');

    // 10.9 Check-in Idempotency
    const repeatedCheckInRes = await ApiClient.checkInAttendance(testCamp1.id, walkinAttendanceId);
    assert(repeatedCheckInRes.success === true, 'Repeated check-in is safe and idempotent (200)');
    assert(repeatedCheckInRes.data?.status === 'CHECKED_IN', 'Status remains CHECKED_IN');

    // 10.10 Attendance Cancellation & Re-activation Lifecycle
    // Register second walk-in donor to test cancellation
    const cancelDonorRes = await ApiClient.registerCampAttendance(testCamp1.id, {
      phoneOrUserId: '9888877772',
      donorName: 'Suresh Patil',
    });
    assert(cancelDonorRes.success === true, 'Second donor registered for cancellation test');
    const cancelAttendanceId = cancelDonorRes.data?.id || '';

    // Cancel attendance
    const cancelRes = await ApiClient.cancelCampAttendance(
      testCamp1.id,
      cancelAttendanceId,
      'Donor left venue due to personal emergency'
    );
    assert(cancelRes.success === true, 'Attendance registration cancelled successfully');
    assert(cancelRes.data?.status === 'CANCELLED', 'Cancelled attendance status is CANCELLED');
    assert(cancelRes.data?.cancellationReason === 'Donor left venue due to personal emergency',
      'cancellationReason matches input');

    // Check-in on cancelled attendance must be rejected
    const checkInCancelledRes = await ApiClient.checkInAttendance(testCamp1.id, cancelAttendanceId);
    assert(checkInCancelledRes.success === false,
      'Check-in on cancelled attendance rejected by backend');

    // Re-registering cancelled donor re-activates registration
    const reactivateRes = await ApiClient.registerCampAttendance(testCamp1.id, {
      phoneOrUserId: '9888877772',
      donorName: 'Suresh Patil',
    });
    assert(reactivateRes.success === true, 'Re-registration of cancelled donor succeeds');
    assert(reactivateRes.data?.status === 'REGISTERED',
      'Re-activated attendance status is returned as REGISTERED');

    // 10.11 Prohibited Cancellation (Clinical Clearance / Donation Invariant)
    // Mark an attendance as clinically cleared directly in DB
    const clearedAttendance = await (prisma as any).campAttendance.create({
      data: {
        campId: testCamp1.id,
        userId: donorRecord!.id,
        donorName: 'Screened Donor',
        donorPhone: DEMO_PHONE,
        status: 'CHECKED_IN',
        screening: {
          create: {
            donorUserId: donorRecord!.id,
            campId: testCamp1.id,
            status: 'CLEARED',
            screenedBy: donorRecord!.id,
          },
        },
      },
    });
    const cancelClearedRes = await ApiClient.cancelCampAttendance(
      testCamp1.id,
      clearedAttendance.id,
      'Attempt cancel on screened donor'
    );
    assert(cancelClearedRes.success === false,
      'Cancellation rejected when donor is already clinically cleared');

    // -------------------------------------------------------------
    // 11. Milestone 04E: Coordinator Permission Boundaries & Role Isolation
    // -------------------------------------------------------------
    console.log('\n--- 11. Milestone 04E: Coordinator Permission Boundaries & Role Isolation ---');

    // Helper for direct raw authenticated HTTP requests
    const coordinatorToken = await AuthStorage.getToken();
    const rawCall = async (endpoint: string, method: string = 'GET', body?: any, tokenOverride?: string) => {
      const authToken = tokenOverride !== undefined ? tokenOverride : coordinatorToken;
      const response = await fetch(`${TEST_API_URL}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const data = await response.json().catch(() => ({}));
      return { status: response.status, ok: response.ok, data };
    };

    // 11.1 Coordinator prohibited from performing Clinical Screening
    const clinicalRes = await rawCall(
      `/camps/${testCamp1.id}/attendance/${walkinAttendanceId}/screening`,
      'POST',
      {
        vitalSigns: { systolicBp: 120, diastolicBp: 80, pulseBpm: 72, hemoglobinGdl: 14.5, weightKg: 70 },
        eligibilityDecision: 'FIT',
        consentGiven: true,
      }
    );
    assert(clinicalRes.status === 403, 'Coordinator clinical screening attempt rejected with 403 Forbidden');
    assert(clinicalRes.data?.error?.message?.includes('CLINICAL_STAFF'),
      'Coordinator screening rejection identifies clinical staff restriction');

    // 11.2 Coordinator prohibited from recording Blood Donation / Phlebotomy
    const donationRes = await rawCall(
      `/camps/${testCamp1.id}/attendance/${walkinAttendanceId}/donation`,
      'POST',
      {
        bloodGroup: 'O_POS',
        volumeMl: 450,
        bagType: 'CPDA_SINGLE',
        unitNumber: 'UNIT-M04E-001',
      }
    );
    assert(donationRes.status === 403, 'Coordinator donation recording rejected with 403 Forbidden');
    assert(donationRes.data?.error?.message?.includes('COLLECTION_STAFF'),
      'Coordinator donation rejection identifies collection staff restriction');

    // 11.3 Coordinator prohibited from submitting Handover Manifest
    const handoverRes = await rawCall(
      `/camps/${testCamp1.id}/handover`,
      'POST',
      {
        carrierName: 'Govt Cold-Chain Logistics',
        vehicleNumber: 'MH-12-CC-4088',
        boxTempCelsius: 4.0,
      }
    );
    assert(handoverRes.status === 403, 'Coordinator handover creation rejected with 403 Forbidden');
    assert(handoverRes.data?.error?.message?.includes('Camp Admin'),
      'Coordinator handover rejection identifies Camp Admin restriction');

    // 11.4 Coordinator prohibited from formally closing camp
    const closeRes = await rawCall(
      `/camps/${testCamp1.id}/close`,
      'POST',
      { notes: 'Attempt closure by coordinator' }
    );
    assert(closeRes.status === 403, 'Coordinator formal camp closure rejected with 403 Forbidden');
    assert(closeRes.data?.error?.message?.includes('Camp Administrator'),
      'Coordinator camp closure rejection identifies Camp Admin / Org Admin restriction');

    // 11.5 Coordinator prohibited from assigning staff team members
    const assignStaffRes = await rawCall(
      `/camps/${testCamp1.id}/staff`,
      'POST',
      {
        userIdOrPhone: '9888877771',
        role: 'CAMP_COORDINATOR',
      }
    );
    assert(assignStaffRes.status === 403, 'Coordinator staff assignment rejected with 403 Forbidden');
    assert(assignStaffRes.data?.error?.message?.includes('Camp Admin'),
      'Coordinator staff assignment rejection identifies Camp Admin restriction');

    // 11.6 Cross-Camp Isolation: Coordinator cannot access unassigned camp
    // Create Camp 3 belonging to same org but without coordinator assignment
    const testCamp3 = await (prisma as any).camp.upsert({
      where: { campCode: 'CAMP-M04E-003' },
      update: { title: 'Pune Metro Camp 3', status: 'APPROVED', isReadyForCollection: true, organizerName: 'Pune Red Cross' },
      create: {
        campCode: 'CAMP-M04E-003',
        title: 'Pune Metro Camp 3',
        organizerName: 'Pune Red Cross',
        targetDate: new Date('2026-11-25T10:00:00Z'),
        timeSlot: '10:00 AM - 04:00 PM',
        venue: 'Bavdhan Community Hall, Pune',
        districtCode: 521,
        stateCode: 27,
        status: 'APPROVED',
        isReadyForCollection: true,
        organisationId: testOrg.id,
      },
    });

    const crossCampRosterRes = await rawCall(`/camps/${testCamp3.id}/attendance`, 'GET');
    assert(crossCampRosterRes.status === 403, 'Access to unassigned camp roster rejected with 403 Forbidden');
    assert(crossCampRosterRes.data?.error?.message?.includes('Permission denied'),
      'Cross-camp rejection message confirms Permission denied');

    const crossCampEditRes = await rawCall(`/camps/${testCamp3.id}`, 'PATCH', { venue: 'Hacked Venue' });
    assert(crossCampEditRes.status === 403, 'Editing unassigned camp logistics rejected with 403 Forbidden');

    // 11.7 Unassigned User (Regular Donor) Access Rejection
    const unassignedUser = await (prisma as any).user.upsert({
      where: { phoneNumber: '+919999000001' },
      update: {},
      create: {
        phoneNumber: '+919999000001',
        name: 'Unassigned Regular Donor',
        role: 'DONOR',
      },
    });
    await (prisma as any).session.upsert({
      where: { token: 'unassigned-donor-token-test' },
      update: { expiresAt: new Date(Date.now() + 86400000) },
      create: {
        token: 'unassigned-donor-token-test',
        userId: unassignedUser.id,
        expiresAt: new Date(Date.now() + 86400000),
      },
    });

    const unassignedRosterRes = await rawCall(
      `/camps/${testCamp1.id}/attendance`,
      'GET',
      undefined,
      'unassigned-donor-token-test'
    );
    assert(unassignedRosterRes.status === 403, 'Unassigned regular donor rejected from attendance roster (403)');

    const unassignedLookupRes = await rawCall(
      `/camps/${testCamp1.id}/donor-lookup?phone=9888877771`,
      'GET',
      undefined,
      'unassigned-donor-token-test'
    );
    assert(unassignedLookupRes.status === 403, 'Unassigned regular donor rejected from donor lookup (403)');

    // 11.8 End-to-End Flow A: Registered Donor Lookup, Registration & Check-in
    // Set up dedicated registered donor profile for Flow A
    await (prisma as any).user.upsert({
      where: { phoneNumber: '+919888877773' },
      update: {},
      create: {
        phoneNumber: '+919888877773',
        name: 'Aakash Verma',
        role: 'DONOR',
        donorProfile: {
          create: {
            bloodGroup: 'B_POS',
            districtCode: 521,
            isAvailable: true,
          },
        },
      },
    });

    // Lookup existing donor by phone
    const flowALookup = await ApiClient.lookupDonor(testCamp1.id, '9888877773');
    assert(flowALookup.success === true, 'Flow A: Lookup existing donor by phone succeeds');
    assert(flowALookup.data?.found === true, 'Flow A: Donor is found');
    assert(flowALookup.data?.donor?.maskedPhone.includes('XXXXX'), 'Flow A: Phone number is properly masked');
    assert(flowALookup.data?.alreadyRegistered === false, 'Flow A: Donor is not yet registered for this camp');
    assert(typeof flowALookup.data?.donor?.isEligible === 'boolean', 'Flow A: Server eligibility status is authoritative');

    // Register existing donor attendance
    const flowAReg = await ApiClient.registerCampAttendance(testCamp1.id, {
      phoneOrUserId: '9888877773',
      donorName: 'Aakash Verma',
    });
    assert(flowAReg.success === true, 'Flow A: Attendance registered for existing donor');
    assert(flowAReg.data?.status === 'REGISTERED', 'Flow A: Registered attendance status is REGISTERED');

    // Verify presence in roster
    const flowARoster = await ApiClient.getCampAttendanceRoster(testCamp1.id);
    const flowAItem = flowARoster.data?.find((a) => a.id === flowAReg.data?.id);
    assert(Boolean(flowAItem), 'Flow A: Registered donor appears in camp attendance roster');

    // Check-in on physical arrival
    const flowACheckIn = await ApiClient.checkInAttendance(testCamp1.id, flowAReg.data!.id);
    assert(flowACheckIn.success === true, 'Flow A: Check-in succeeds on arrival');
    assert(flowACheckIn.data?.status === 'CHECKED_IN', 'Flow A: Status transitions to CHECKED_IN');
    assert(Boolean(flowACheckIn.data?.checkedInAt), 'Flow A: checkedInAt timestamp is recorded');

    // 11.9 Assignment Revocation: Server Immediately Revokes Access
    await (prisma as any).campStaffAssignment.updateMany({
      where: { campId: testCamp1.id, userId: donorRecord!.id },
      data: { isActive: false },
    });

    const revokedRosterRes = await rawCall(`/camps/${testCamp1.id}/attendance`, 'GET');
    assert(revokedRosterRes.status === 403, 'Revoked assignment immediately rejected from roster with 403 Forbidden');

    const refreshedAssignments = await ApiClient.getMyCampAssignments();
    const revokedCampPresent = refreshedAssignments.data?.some((c) => c.campId === testCamp1.id);
    assert(revokedCampPresent === false, 'Revoked camp is immediately excluded from active assignments');

    // Restore assignment for clean teardown
    await (prisma as any).campStaffAssignment.updateMany({
      where: { campId: testCamp1.id, userId: donorRecord!.id },
      data: { isActive: true },
    });

    // Clean up test records
    await (prisma as any).clinicalScreening.deleteMany({
      where: { campId: { in: [testCamp1.id, testCamp2.id, testCamp3.id] } },
    });
    await (prisma as any).campAttendance.deleteMany({
      where: { campId: { in: [testCamp1.id, testCamp2.id, testCamp3.id] } },
    });
    await (prisma as any).donorProfile.deleteMany({
      where: { user: { phoneNumber: { in: testPhoneNumbers } } },
    });
    await (prisma as any).session.deleteMany({
      where: { user: { phoneNumber: { in: testPhoneNumbers } } },
    });
    await (prisma as any).user.deleteMany({
      where: { phoneNumber: { in: testPhoneNumbers } },
    });
    await (prisma as any).campStaffAssignment.deleteMany({
      where: { campId: { in: [testCamp1.id, testCamp2.id, testCamp3.id] } },
    });
    await (prisma as any).camp.deleteMany({
      where: { id: { in: [testCamp1.id, testCamp2.id, testCamp3.id] } },
    });

    // -------------------------------------------------------------
    // 12. Logout & Cleanup
    // -------------------------------------------------------------
    console.log('\n--- 12. Logout & Auth Cleanup ---');
    await AuthStorage.clearAll();
    const tokenAfterLogout = await AuthStorage.getToken();
    const userAfterLogout = await AuthStorage.getUser();
    const sessionAfterLogout = await AuthStorage.getActiveSessionId();

    assert(tokenAfterLogout === null, 'Session token cleared on logout');
    assert(userAfterLogout === null, 'User details cleared on logout');
    assert(sessionAfterLogout === null, 'Active session ID cleared on logout');

    const cachedAfterLogout = await AuthStorage.getCachedAssignments();
    assert(cachedAfterLogout === null, 'Cached camp assignments cleared on logout');

    // Calling assignments after logout without token must be rejected
    const unauthAssignmentsRes = await ApiClient.getMyCampAssignments();
    assert(unauthAssignmentsRes.success === false, 'Unauthenticated assignments call rejected without session token');

    // -------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------
    console.log('\n========================================================================');
    console.log(`  Mobile Test Summary: ${passed} passed, ${failed} failed`);
    console.log('========================================================================\n');

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await server.close();
    await prisma.$disconnect();
  }
}

runMobileTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
