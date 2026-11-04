import React, { useState, useEffect, useCallback } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  AppState,
} from 'react-native';
import { AuthStorage } from './src/services/authStorage';
import { ApiClient, CampAssignmentDTO } from './src/services/apiClient';
import { LocationTracking } from './src/services/locationTracking';

// UI Navigation Components & Screens
import { BottomTabs, BottomTabType } from './src/components/ui/BottomTabs';
import { PublicHomeScreen } from './src/screens/PublicHomeScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { DonorDashboardScreen } from './src/screens/DonorDashboardScreen';
import { DonorRegistrationScreen } from './src/screens/DonorRegistrationScreen';
import { FindBloodScreen } from './src/screens/FindBloodScreen';
import { NearbyDonorsScreen } from './src/screens/NearbyDonorsScreen';
import { BloodRequestsScreen } from './src/screens/BloodRequestsScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { DonationHistoryScreen } from './src/screens/DonationHistoryScreen';
import { CampOperationsWorkspaceScreen } from './src/screens/CampOperationsWorkspaceScreen';
import { CampOperationsDashboardScreen } from './src/screens/CampOperationsDashboardScreen';

// Ensure module-level background location task registration is executed at bundle initialization
import './src/services/locationTask';

type UnauthScreenType = 'PUBLIC_HOME' | 'FIND_BLOOD' | 'NEARBY_DONORS' | 'BLOOD_REQUESTS' | 'LOGIN';
type WorkspaceType = 'DONOR' | 'OPERATIONS';

export default function App() {
  const [isInitializing, setIsInitializing] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasDonorProfile, setHasDonorProfile] = useState(false);

  // Unauthenticated routing
  const [unauthScreen, setUnauthScreen] = useState<UnauthScreenType>('PUBLIC_HOME');

  // Authenticated tab routing
  const [activeTab, setActiveTab] = useState<BottomTabType>('HOME');

  // Sub-screens & modals
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [requestPrefill, setRequestPrefill] = useState<{ bloodGroup?: string; hospitalName?: string; hospitalCode?: string } | null>(null);

  // Milestone 04B & 04C: Operations Workspace state & authoritative server gating
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceType>('DONOR');
  const [opsScreen, setOpsScreen] = useState<'WORKSPACE_LIST' | 'DASHBOARD'>('DASHBOARD');
  const [campAssignments, setCampAssignments] = useState<CampAssignmentDTO[]>([]);
  const [isAssignmentsServerVerified, setIsAssignmentsServerVerified] = useState(false);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [selectedCampId, setSelectedCampId] = useState<string | null>(null);

  /**
   * Authoritative query for the authenticated user's camp staff assignments.
   * Gated strictly: Only a live, successful server response sets isAssignmentsServerVerified = true.
   * Cached assignments are loaded as an offline informational hint but cannot independently grant access.
   */
  const fetchCampAssignments = useCallback(async () => {
    setAssignmentsLoading(true);
    setAssignmentsError(null);
    try {
      const res = await ApiClient.getMyCampAssignments();
      if (res.success && Array.isArray(res.data)) {
        setCampAssignments(res.data);
        setIsAssignmentsServerVerified(true);
        await AuthStorage.saveCachedAssignments(res.data);
        if (res.data.length > 0) {
          setSelectedCampId((prev) =>
            prev && res.data!.some((c) => c.campId === prev) ? prev : res.data![0].campId
          );
        } else {
          // Assignment count is 0 (revoked or none) -> immediately revoke operations access
          setSelectedCampId(null);
          setCurrentWorkspace('DONOR');
        }
      } else {
        // Server responded with error, revoked session, or unauthorized
        setCampAssignments([]);
        setIsAssignmentsServerVerified(false);
        await AuthStorage.removeCachedAssignments();
        setSelectedCampId(null);
        setCurrentWorkspace('DONOR');
        if (res.error?.message) {
          setAssignmentsError(res.error.message);
        }
      }
    } catch (err: any) {
      // Network failure / offline: server cannot be reached
      setIsAssignmentsServerVerified(false);
      const cached = await AuthStorage.getCachedAssignments();
      if (cached && Array.isArray(cached) && cached.length > 0) {
        // Retain cached data purely for offline informative display
        setCampAssignments(cached);
      } else {
        setCampAssignments([]);
      }
      setAssignmentsError(
        err?.message || 'Server connection failed. Could not verify camp staff assignments.'
      );
    } finally {
      setAssignmentsLoading(false);
    }
  }, []);

  const checkAuthStatus = useCallback(async () => {
    try {
      const token = await AuthStorage.getToken();
      if (!token) {
        setIsAuthenticated(false);
        setHasDonorProfile(false);
        setCampAssignments([]);
        return;
      }

      setIsAuthenticated(true);
      // Check if user has an active donor profile
      const profileRes = await ApiClient.getProfile();
      if (profileRes.success && profileRes.data?.id) {
        setHasDonorProfile(true);
      } else {
        setHasDonorProfile(false);
      }

      // Concurrently query authoritative camp assignments
      await fetchCampAssignments();
    } catch {
      setIsAuthenticated(false);
      setHasDonorProfile(false);
      setCampAssignments([]);
    } finally {
      setIsInitializing(false);
    }
  }, [fetchCampAssignments]);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Refresh assignments whenever app returns to the active foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && isAuthenticated) {
        fetchCampAssignments();
      }
    });
    return () => subscription.remove();
  }, [isAuthenticated, fetchCampAssignments]);

  const handleLoginSuccess = async () => {
    setIsAuthenticated(true);
    try {
      const profileRes = await ApiClient.getProfile();
      if (profileRes.success && profileRes.data?.id) {
        setHasDonorProfile(true);
        setActiveTab('HOME');
      } else {
        setHasDonorProfile(false);
      }
      await fetchCampAssignments();
    } catch {
      setHasDonorProfile(false);
    }
  };

  const handleLogout = async () => {
    try {
      const isTracking = await LocationTracking.isTrackingActive();
      if (isTracking) {
        await LocationTracking.stopTracking();
      }
    } catch {
      // Ignore location stop error on logout
    }
    await AuthStorage.clearAll();
    setIsAuthenticated(false);
    setHasDonorProfile(false);
    setActiveTab('HOME');
    setCurrentWorkspace('DONOR');
    setOpsScreen('DASHBOARD');
    setCampAssignments([]);
    setIsAssignmentsServerVerified(false);
    setSelectedCampId(null);
    setAssignmentsError(null);
    setShowHistoryModal(false);
    setUnauthScreen('PUBLIC_HOME');
  };

  if (isInitializing) {
    return (
      <View style={styles.splash}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <View style={styles.splashBadge}>
          <Text style={styles.splashIcon}>🩸</Text>
        </View>
        <Text style={styles.splashTitle}>RaktaSetu</Text>
        <Text style={styles.splashSubtitle}>Connecting Blood Donors & Patients</Text>
        <ActivityIndicator size="small" color="#DC2626" style={{ marginTop: 20 }} />
      </View>
    );
  }

  // --- UNAUTHENTICATED EXPERIENCE ---
  if (!isAuthenticated) {
    // Top bar for non-home unauthenticated screens
    const renderUnauthTopBar = (title: string) => (
      <View style={styles.unauthBar}>
        <TouchableOpacity
          style={styles.unauthBackBtn}
          onPress={() => setUnauthScreen('PUBLIC_HOME')}
        >
          <Text style={styles.unauthBackText}>← RaktaSetu Home</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.unauthLoginBtn}
          onPress={() => setUnauthScreen('LOGIN')}
        >
          <Text style={styles.unauthLoginText}>Sign In / Register</Text>
        </TouchableOpacity>
      </View>
    );

    switch (unauthScreen) {
      case 'LOGIN':
        return (
          <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
            <LoginScreen
              onLoginSuccess={handleLoginSuccess}
              onBack={() => setUnauthScreen('PUBLIC_HOME')}
            />
          </SafeAreaView>
        );

      case 'FIND_BLOOD':
        return (
          <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
            {renderUnauthTopBar('Find Blood')}
            <FindBloodScreen
              onNavigateRequestWithDetails={(details) => {
                setRequestPrefill({
                  bloodGroup: details.bloodGroup,
                  hospitalName: details.hospitalName || details.hospitalCode,
                  hospitalCode: details.hospitalCode,
                });
                setUnauthScreen('BLOOD_REQUESTS');
              }}
            />
          </SafeAreaView>
        );

      case 'NEARBY_DONORS':
        return (
          <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
            {renderUnauthTopBar('Nearby Donors')}
            <NearbyDonorsScreen
              onNavigateRequestWithGroup={(group) => {
                setRequestPrefill({ bloodGroup: group });
                setUnauthScreen('BLOOD_REQUESTS');
              }}
            />
          </SafeAreaView>
        );

      case 'BLOOD_REQUESTS':
        return (
          <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
            {renderUnauthTopBar('Blood Requests')}
            <BloodRequestsScreen
              initialBloodGroup={requestPrefill?.bloodGroup}
              initialHospitalName={requestPrefill?.hospitalName}
              initialHospitalCode={requestPrefill?.hospitalCode}
              isAuthenticated={false}
              onRequireAuth={() => setUnauthScreen('LOGIN')}
            />
          </SafeAreaView>
        );

      case 'PUBLIC_HOME':
      default:
        return (
          <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
            <PublicHomeScreen
              onNavigateLogin={() => setUnauthScreen('LOGIN')}
              onNavigateRegister={() => setUnauthScreen('LOGIN')}
              onNavigateFindBlood={() => setUnauthScreen('FIND_BLOOD')}
              onNavigateDonors={() => setUnauthScreen('NEARBY_DONORS')}
              onNavigateRequests={() => setUnauthScreen('BLOOD_REQUESTS')}
            />
          </SafeAreaView>
        );
    }
  }

  // --- AUTHENTICATED EXPERIENCE ---

  // 1. If authenticated user does not have a donor profile yet, prompt Registration
  if (!hasDonorProfile) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <DonorRegistrationScreen
          onRegistrationSuccess={() => {
            setHasDonorProfile(true);
            setActiveTab('HOME');
          }}
          onCancel={() => {
            setHasDonorProfile(true);
            setActiveTab('HOME');
          }}
        />
      </SafeAreaView>
    );
  }

  // 2. Donation History modal
  if (showHistoryModal) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <DonationHistoryScreen
          onBack={() => setShowHistoryModal(false)}
          onNavigateDonate={() => {
            setShowHistoryModal(false);
            setActiveTab('FIND_BLOOD');
          }}
        />
      </SafeAreaView>
    );
  }

  const handleOpenOperations = (targetCampId?: string) => {
    // Hardening: Only server-verified assignments authorize entry into Operations
    if (!isAssignmentsServerVerified || campAssignments.length === 0) {
      return;
    }
    const campToFocus = targetCampId || selectedCampId || campAssignments[0]?.campId;
    if (campToFocus) {
      setSelectedCampId(campToFocus);
      setOpsScreen('DASHBOARD');
    } else {
      setOpsScreen('WORKSPACE_LIST');
    }
    setCurrentWorkspace('OPERATIONS');
  };

  // 3. Operations Workspace Mode (Active switch for authorized staff)
  if (currentWorkspace === 'OPERATIONS') {
    // Hardening check: if server verification fails or assignments revoked, revert to DONOR
    if (!isAssignmentsServerVerified || campAssignments.length === 0) {
      setCurrentWorkspace('DONOR');
      return null;
    }

    if (opsScreen === 'DASHBOARD' && selectedCampId) {
      return (
        <SafeAreaView style={styles.container}>
          <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
          <CampOperationsDashboardScreen
            campId={selectedCampId}
            assignments={campAssignments}
            onSelectCamp={(id) => setSelectedCampId(id)}
            onBackToSelector={() => setOpsScreen('WORKSPACE_LIST')}
            onReturnToDonor={() => setCurrentWorkspace('DONOR')}
            onLogout={handleLogout}
          />
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        <CampOperationsWorkspaceScreen
          assignments={campAssignments}
          selectedCampId={selectedCampId}
          onSelectCamp={(id) => setSelectedCampId(id)}
          onOpenDashboard={(id) => {
            setSelectedCampId(id);
            setOpsScreen('DASHBOARD');
          }}
          onRefreshAssignments={fetchCampAssignments}
          onReturnToDonor={() => setCurrentWorkspace('DONOR')}
          onLogout={handleLogout}
          loading={assignmentsLoading}
          error={assignmentsError}
        />
      </SafeAreaView>
    );
  }

  // 4. Standard Authenticated Donor Tab Views
  const renderTabContent = () => {
    switch (activeTab) {
      case 'HOME':
        return (
          <DonorDashboardScreen
            onLogout={handleLogout}
            onNavigateHistory={() => setShowHistoryModal(true)}
            onNavigateFindBlood={() => setActiveTab('FIND_BLOOD')}
            onNavigateDonors={() => setActiveTab('DONORS')}
            onNavigateRequests={() => setActiveTab('REQUESTS')}
            onNavigateProfile={() => setActiveTab('PROFILE')}
            campAssignments={campAssignments}
            assignmentsLoading={assignmentsLoading}
            assignmentsError={assignmentsError}
            isAssignmentsServerVerified={isAssignmentsServerVerified}
            onRetryAssignments={fetchCampAssignments}
            onOpenOperations={() => handleOpenOperations()}
          />
        );

      case 'FIND_BLOOD':
        return (
          <FindBloodScreen
            onNavigateRequestWithDetails={(details) => {
              setRequestPrefill({
                bloodGroup: details.bloodGroup,
                hospitalName: details.hospitalName || details.hospitalCode,
                hospitalCode: details.hospitalCode,
              });
              setActiveTab('REQUESTS');
            }}
          />
        );

      case 'DONORS':
        return (
          <NearbyDonorsScreen
            onNavigateRequestWithGroup={(group) => {
              setRequestPrefill({ bloodGroup: group });
              setActiveTab('REQUESTS');
            }}
          />
        );

      case 'REQUESTS':
        return (
          <BloodRequestsScreen
            initialBloodGroup={requestPrefill?.bloodGroup}
            initialHospitalName={requestPrefill?.hospitalName}
            initialHospitalCode={requestPrefill?.hospitalCode}
            isAuthenticated={true}
          />
        );

      case 'PROFILE':
        return (
          <ProfileScreen
            onBack={() => setActiveTab('HOME')}
            onLogout={handleLogout}
            campAssignments={campAssignments}
            isAssignmentsServerVerified={isAssignmentsServerVerified}
            onOpenOperations={() => handleOpenOperations()}
          />
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
      <View style={styles.mainContent}>{renderTabContent()}</View>
      <BottomTabs activeTab={activeTab} onTabChange={setActiveTab} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  mainContent: {
    flex: 1,
  },
  splash: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
  },
  splashBadge: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  splashIcon: {
    fontSize: 32,
  },
  splashTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  splashSubtitle: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 6,
    fontWeight: '500',
  },
  unauthBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  unauthBackBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  unauthBackText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991B1B',
  },
  unauthLoginBtn: {
    backgroundColor: '#991B1B',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  unauthLoginText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
