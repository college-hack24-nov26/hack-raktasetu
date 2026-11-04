import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { CampAssignmentDTO } from '../services/apiClient';

interface CampOperationsWorkspaceScreenProps {
  assignments: CampAssignmentDTO[];
  selectedCampId: string | null;
  onSelectCamp: (campId: string) => void;
  onOpenDashboard?: (campId: string) => void;
  onRefreshAssignments: () => Promise<void>;
  onReturnToDonor: () => void;
  onLogout: () => void;
  loading: boolean;
  error: string | null;
  userName?: string | null;
}

export const CampOperationsWorkspaceScreen: React.FC<CampOperationsWorkspaceScreenProps> = ({
  assignments,
  selectedCampId,
  onSelectCamp,
  onOpenDashboard,
  onRefreshAssignments,
  onReturnToDonor,
  onLogout,
  loading,
  error,
  userName,
}) => {
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefreshAssignments();
    } finally {
      setRefreshing(false);
    }
  };

  const selectedCamp = assignments.find((c) => c.campId === selectedCampId) || assignments[0] || null;

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Operations Navigation Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.returnBtn} onPress={onReturnToDonor}>
          <Text style={styles.returnBtnText}>← Return to Donor Home</Text>
        </TouchableOpacity>
        <Badge label="OPERATIONS" variant="info" />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#991B1B']} />
        }
      >
        {/* Workspace Identity Banner */}
        <View style={styles.brandSection}>
          <View style={styles.brandBadge}>
            <Text style={styles.brandIcon}>🏥</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.brandTitle}>Camp Operations Hub</Text>
            <Text style={styles.brandSubtitle}>
              {userName ? `Staff: ${userName}` : 'Camp Coordinator & Staff Workspace'}
            </Text>
          </View>
        </View>

        {/* Error Notice with Retry */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
            <TouchableOpacity onPress={handleRefresh} style={styles.retryBtn}>
              <Text style={styles.retryBtnText}>Tap to Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Loading Indicator */}
        {loading && !refreshing && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#991B1B" />
            <Text style={styles.loadingText}>Synchronizing camp assignments with blood bank grid...</Text>
          </View>
        )}

        {/* Empty State */}
        {!loading && assignments.length === 0 && (
          <EmptyState
            icon="📋"
            title="No Active Camp Assignments"
            description="Your authenticated account does not currently hold active camp coordinator or staff assignments. Please contact your parent blood bank administrator to assign you to an approved voluntary blood donation drive."
            actionTitle="Return to Donor Home"
            onAction={onReturnToDonor}
          />
        )}

        {/* Authorized Camp Assignments Section */}
        {assignments.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>
                Authorized Camp Assignments ({assignments.length})
              </Text>
              {assignments.length > 1 && (
                <Text style={styles.multiCampHint}>Select active camp</Text>
              )}
            </View>

            {assignments.map((camp) => {
              const isSelected = selectedCamp?.campId === camp.campId;
              const isApproved = camp.status === 'APPROVED';

              return (
                <TouchableOpacity
                  key={camp.campId}
                  activeOpacity={0.8}
                  onPress={() => onSelectCamp(camp.campId)}
                >
                  <Card
                    style={[
                      styles.campCard,
                      isSelected && styles.selectedCampCard,
                    ]}
                    variant={isSelected ? 'elevated' : 'outlined'}
                  >
                    <View style={styles.campHeaderRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.campTitle}>{camp.title}</Text>
                        <Text style={styles.campCode}>Code: {camp.campCode}</Text>
                      </View>
                      <View style={styles.badgeColumn}>
                        <Badge
                          label={camp.role.replace('_', ' ')}
                          variant={camp.role === 'CAMP_COORDINATOR' ? 'info' : 'neutral'}
                        />
                        <View style={{ marginTop: 4 }}>
                          <Badge
                            label={camp.status}
                            variant={isApproved ? 'success' : camp.status === 'COMPLETED' ? 'neutral' : 'warning'}
                          />
                        </View>
                      </View>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>📅 Date:</Text>
                      <Text style={styles.metaValue}>
                        {formatDate(camp.targetDate)} {camp.timeSlot ? `• ${camp.timeSlot}` : ''}
                      </Text>
                    </View>

                    <View style={styles.metaRow}>
                      <Text style={styles.metaLabel}>📍 Venue:</Text>
                      <Text style={styles.metaValue} numberOfLines={2}>
                        {camp.venue}
                      </Text>
                    </View>

                    {camp.parentOrganisation?.name && (
                      <View style={styles.metaRow}>
                        <Text style={styles.metaLabel}>🏦 Parent Bank:</Text>
                        <Text style={styles.metaValue}>
                          {camp.parentOrganisation.name}
                        </Text>
                      </View>
                    )}

                    <View style={styles.readinessRow}>
                      <View
                        style={[
                          styles.readinessDot,
                          { backgroundColor: camp.isReadyForCollection ? '#10B981' : '#F59E0B' },
                        ]}
                      />
                      <Text style={styles.readinessText}>
                        {camp.isReadyForCollection
                          ? 'Operational Readiness: Verified'
                          : 'Operational Readiness: Verification Pending'}
                      </Text>
                    </View>

                    {isSelected && (
                      <View style={styles.selectedPill}>
                        <Text style={styles.selectedPillText}>✓ Active Operational Focus</Text>
                      </View>
                    )}

                    {onOpenDashboard && (
                      <Button
                        title="Open Camp Operations Hub →"
                        variant={isSelected ? 'primary' : 'outline'}
                        size="sm"
                        onPress={() => {
                          onSelectCamp(camp.campId);
                          onOpenDashboard(camp.campId);
                        }}
                        style={{ marginTop: 10 }}
                      />
                    )}
                  </Card>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Milestone 04B Shell & Future Scope Notice */}
        {selectedCamp && (
          <Card style={styles.infoCard} variant="flat">
            <Text style={styles.infoTitle}>ℹ️ Milestone 04B Operations Shell Active</Text>
            <Text style={styles.infoDesc}>
              You are authenticated with server-verified credentials for{' '}
              <Text style={{ fontWeight: '700' }}>{selectedCamp.title}</Text> ({selectedCamp.campCode}).
            </Text>
            <View style={styles.bulletList}>
              <Text style={styles.bulletItem}>
                • Role Assignment:{' '}
                <Text style={{ fontWeight: '700' }}>{selectedCamp.role.replace('_', ' ')}</Text> via{' '}
                {selectedCamp.assignmentSource}
              </Text>
              <Text style={styles.bulletItem}>
                • Milestone 04C (Next): Operational Readiness Checklist & Logistical Editing
              </Text>
              <Text style={styles.bulletItem}>
                • Milestone 04D: Phone-First Walk-In Donor Registration & Arrival Check-In Roster
              </Text>
            </View>
          </Card>
        )}

        {/* Safety & Clinical Boundary Card */}
        <Card style={styles.securityCard} variant="flat">
          <Text style={styles.securityTitle}>🛡️ Clinical Safety & Permission Notice</Text>
          <Text style={styles.securityText}>
            Medical screening, fitness evaluation, deferral recording, and phlebotomy units are strictly
            restricted to licensed Clinical Staff and Collection Personnel as per national blood transfusion
            safety guidelines. Medical clearances cannot be issued through this coordinator workspace.
          </Text>
        </Card>

        {/* Primary Return Button */}
        <Button
          title="Return to Donor Dashboard"
          variant="outline"
          onPress={onReturnToDonor}
          style={{ marginTop: 8 }}
        />

        {/* Logout action */}
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
          <Text style={styles.logoutBtnText}>Sign Out of RaktaSetu</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  returnBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  returnBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991B1B',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  brandSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  brandBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  brandIcon: {
    fontSize: 22,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  brandSubtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: {
    color: '#991B1B',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  retryBtn: {
    backgroundColor: '#991B1B',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  loadingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
    flex: 1,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
  },
  multiCampHint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563EB',
  },
  campCard: {
    padding: 16,
    marginBottom: 12,
    borderColor: '#E2E8F0',
  },
  selectedCampCard: {
    borderColor: '#2563EB',
    borderWidth: 2,
    backgroundColor: '#FFFFFF',
  },
  campHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  campTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  campCode: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  badgeColumn: {
    alignItems: 'flex-end',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    gap: 6,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    width: 95,
  },
  metaValue: {
    fontSize: 12,
    color: '#1E293B',
    flex: 1,
    fontWeight: '500',
  },
  readinessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  readinessDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  readinessText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  selectedPill: {
    marginTop: 10,
    backgroundColor: '#EFF6FF',
    paddingVertical: 5,
    borderRadius: 6,
    alignItems: 'center',
  },
  selectedPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E40AF',
  },
  infoCard: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    padding: 14,
    marginBottom: 14,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 6,
  },
  infoDesc: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 8,
  },
  bulletList: {
    gap: 4,
  },
  bulletItem: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
  },
  securityCard: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    padding: 12,
    marginBottom: 16,
  },
  securityTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 4,
  },
  securityText: {
    fontSize: 10,
    color: '#78350F',
    lineHeight: 15,
  },
  logoutBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  logoutBtnText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
});
