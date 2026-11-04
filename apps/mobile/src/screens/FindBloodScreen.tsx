import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Alert,
  Platform,
  RefreshControl,
  TextInput,
} from 'react-native';
import { Header } from '../components/Header';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { SelectModal, SelectOption } from '../components/ui/SelectModal';
import { ApiClient, BloodCentreDTO } from '../services/apiClient';
import {
  MAHARASHTRA_DISTRICTS,
  BLOOD_GROUPS,
  BLOOD_COMPONENTS,
} from '../config/constants';

interface FindBloodScreenProps {
  onNavigateRequestWithDetails?: (details: { bloodGroup?: string; hospitalCode?: string; hospitalName?: string }) => void;
}

export type FindBloodTabType = 'STOCK' | 'DIRECTORY';

export const FindBloodScreen: React.FC<FindBloodScreenProps> = ({
  onNavigateRequestWithDetails,
}) => {
  // Navigation tab state
  const [activeTab, setActiveTab] = useState<FindBloodTabType>('STOCK');

  // Shared / Stock Availability Filter State
  const [selectedDistrictCode, setSelectedDistrictCode] = useState<number>(521); // Pune default
  const [selectedBloodGroup, setSelectedBloodGroup] = useState<string>('B+');
  const [selectedComponent, setSelectedComponent] = useState<string>('Packed Red Blood Cells');

  // Modals for filters
  const [showDistrictModal, setShowDistrictModal] = useState(false);
  const [showBloodGroupModal, setShowBloodGroupModal] = useState(false);
  const [showComponentModal, setShowComponentModal] = useState(false);

  // Stock Availability Results State
  const [stockResults, setStockResults] = useState<any[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockRefreshing, setStockRefreshing] = useState(false);
  const [stockSearched, setStockSearched] = useState(false);
  const [stockErrorMsg, setStockErrorMsg] = useState<string | null>(null);

  // Blood Centre Directory State
  const [dirCentres, setDirCentres] = useState<BloodCentreDTO[]>([]);
  const [dirLoading, setDirLoading] = useState(false);
  const [dirRefreshing, setDirRefreshing] = useState(false);
  const [dirSearched, setDirSearched] = useState(false);
  const [dirErrorMsg, setDirErrorMsg] = useState<string | null>(null);
  const [dirSearchQuery, setDirSearchQuery] = useState('');
  const [appliedDirSearch, setAppliedDirSearch] = useState('');

  // ----------------------------------------------------
  // Stock Availability API Query
  // ----------------------------------------------------
  const handleSearchStock = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setStockRefreshing(true);
    } else {
      setStockLoading(true);
    }
    setStockErrorMsg(null);
    setStockSearched(true);

    try {
      const res = await ApiClient.searchAvailability({
        districtCode: selectedDistrictCode,
        bloodGroup: selectedBloodGroup,
        component: selectedComponent,
      });

      if (res.success && Array.isArray(res.data)) {
        setStockResults(res.data);
      } else if (res.success && Array.isArray((res as any).results)) {
        setStockResults((res as any).results);
      } else {
        setStockResults([]);
        if (res.error?.message) setStockErrorMsg(res.error.message);
      }
    } catch (err: any) {
      setStockErrorMsg(err.message || 'Failed to search blood availability.');
      setStockResults([]);
    } finally {
      setStockLoading(false);
      setStockRefreshing(false);
    }
  }, [selectedDistrictCode, selectedBloodGroup, selectedComponent]);

  // ----------------------------------------------------
  // Blood Centre Directory API Query
  // ----------------------------------------------------
  const handleSearchCentres = useCallback(async (searchTerm = appliedDirSearch, isRefresh = false) => {
    if (isRefresh) {
      setDirRefreshing(true);
    } else {
      setDirLoading(true);
    }
    setDirErrorMsg(null);
    setDirSearched(true);

    try {
      const res = await ApiClient.searchBloodCentres({
        districtCode: selectedDistrictCode,
        stateCode: 27, // Maharashtra default
        search: searchTerm.trim() || undefined,
        limit: 50,
      });

      if (res.success && Array.isArray(res.data)) {
        setDirCentres(res.data);
      } else if (res.success && Array.isArray((res as any).centres)) {
        setDirCentres((res as any).centres);
      } else {
        setDirCentres([]);
        if (res.error?.message) setDirErrorMsg(res.error.message);
      }
    } catch (err: any) {
      setDirErrorMsg(err.message || 'Failed to load blood centres directory.');
      setDirCentres([]);
    } finally {
      setDirLoading(false);
      setDirRefreshing(false);
    }
  }, [selectedDistrictCode, appliedDirSearch]);

  // Trigger stock search on filter change when activeTab === 'STOCK'
  useEffect(() => {
    if (activeTab === 'STOCK') {
      handleSearchStock();
    }
  }, [activeTab, selectedDistrictCode, selectedBloodGroup, selectedComponent, handleSearchStock]);

  // Trigger directory search on district/tab change when activeTab === 'DIRECTORY'
  useEffect(() => {
    if (activeTab === 'DIRECTORY') {
      handleSearchCentres(appliedDirSearch);
    }
  }, [activeTab, selectedDistrictCode, appliedDirSearch, handleSearchCentres]);

  // Native phone call intent
  const handleDial = (phone?: string | null) => {
    if (!phone) {
      Alert.alert('No Phone Available', 'This centre does not have a verified telephone number listed.');
      return;
    }
    const clean = phone.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${clean}`).catch(() => {
      Alert.alert('Dialing Error', `Could not initiate call to ${clean}`);
    });
  };

  // Map navigation intent (Platform-specific geo / Apple Maps / Google Maps)
  const handleOpenMap = (address?: string | null, hospitalName?: string | null) => {
    const destination = address || hospitalName;
    if (!destination) {
      Alert.alert('Location Unavailable', 'No address or facility name is listed for map directions.');
      return;
    }

    const encoded = encodeURIComponent(destination);
    const mapUrl = Platform.select({
      ios: `maps:0,0?q=${encoded}`,
      android: `geo:0,0?q=${encoded}`,
      default: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    });

    Linking.canOpenURL(mapUrl).then((supported) => {
      if (supported) {
        Linking.openURL(mapUrl);
      } else {
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encoded}`);
      }
    }).catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encoded}`);
    });
  };

  // Directory search submit
  const handleApplyDirSearch = () => {
    setAppliedDirSearch(dirSearchQuery);
    handleSearchCentres(dirSearchQuery);
  };

  // Directory search reset
  const handleClearDirSearch = () => {
    setDirSearchQuery('');
    setAppliedDirSearch('');
    handleSearchCentres('');
  };

  const districtOptions: SelectOption[] = MAHARASHTRA_DISTRICTS.map((d) => ({
    label: d.name,
    value: d.code,
    subtitle: `District Code: ${d.code}`,
  }));

  const bloodGroupOptions: SelectOption[] = BLOOD_GROUPS.map((bg) => ({
    label: bg,
    value: bg,
  }));

  const componentOptions: SelectOption[] = BLOOD_COMPONENTS.map((c) => ({
    label: c,
    value: c,
  }));

  const selectedDistrictName =
    MAHARASHTRA_DISTRICTS.find((d) => d.code === selectedDistrictCode)?.name || 'Pune';

  return (
    <View style={styles.container}>
      <Header
        subtitle={
          activeTab === 'STOCK'
            ? 'Real-Time Blood Availability Search'
            : 'Verified Blood Centre & Bank Directory'
        }
      />

      {/* Segmented Switch / Tab Bar */}
      <View style={styles.segmentedContainer}>
        <View style={styles.segmentedWrapper}>
          <TouchableOpacity
            style={[
              styles.segmentedTab,
              activeTab === 'STOCK' && styles.segmentedTabActive,
            ]}
            onPress={() => setActiveTab('STOCK')}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'STOCK' }}
            accessibilityLabel="Stock Availability"
          >
            <Text
              style={[
                styles.segmentedTabText,
                activeTab === 'STOCK' && styles.segmentedTabTextActive,
              ]}
            >
              🩸 Stock Availability
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.segmentedTab,
              activeTab === 'DIRECTORY' && styles.segmentedTabActive,
            ]}
            onPress={() => setActiveTab('DIRECTORY')}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'DIRECTORY' }}
            accessibilityLabel="Blood Centre Directory"
          >
            <Text
              style={[
                styles.segmentedTabText,
                activeTab === 'DIRECTORY' && styles.segmentedTabTextActive,
              ]}
            >
              🏥 Blood Centre Directory
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={activeTab === 'STOCK' ? stockRefreshing : dirRefreshing}
            onRefresh={() => {
              if (activeTab === 'STOCK') {
                handleSearchStock(true);
              } else {
                handleSearchCentres(appliedDirSearch, true);
              }
            }}
            colors={['#DC2626']}
            tintColor="#DC2626"
          />
        }
      >
        {/* ==================================================== */}
        {/* TAB 1: STOCK AVAILABILITY                            */}
        {/* ==================================================== */}
        {activeTab === 'STOCK' && (
          <View>
            {/* Filter Section */}
            <Card style={styles.filterCard} variant="elevated">
              <Text style={styles.filterTitle}>Stock Search Criteria</Text>

              {/* District Selector */}
              <View style={styles.pickerBlock}>
                <Text style={styles.pickerLabel}>District</Text>
                <TouchableOpacity
                  style={styles.pickerBtn}
                  onPress={() => setShowDistrictModal(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.pickerValue}>📍 {selectedDistrictName}</Text>
                  <Text style={styles.pickerArrow}>▼</Text>
                </TouchableOpacity>
              </View>

              {/* Blood Group and Component Row */}
              <View style={styles.row}>
                <View style={[styles.pickerBlock, { flex: 1 }]}>
                  <Text style={styles.pickerLabel}>Blood Group</Text>
                  <TouchableOpacity
                    style={styles.pickerBtn}
                    onPress={() => setShowBloodGroupModal(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.pickerValue}>🩸 {selectedBloodGroup}</Text>
                    <Text style={styles.pickerArrow}>▼</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.pickerBlock, { flex: 2 }]}>
                  <Text style={styles.pickerLabel}>Component</Text>
                  <TouchableOpacity
                    style={styles.pickerBtn}
                    onPress={() => setShowComponentModal(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.pickerValue} numberOfLines={1}>
                      🧪 {selectedComponent}
                    </Text>
                    <Text style={styles.pickerArrow}>▼</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <Button
                title="Search Blood Availability"
                onPress={() => handleSearchStock(false)}
                variant="primary"
                loading={stockLoading}
                icon="🔍"
                style={{ marginTop: 6 }}
              />
            </Card>

            {/* Prototype Disclaimer */}
            <View style={styles.disclaimerBox}>
              <Text style={styles.disclaimerText}>
                ℹ️ <Text style={{ fontWeight: '700' }}>Verification Note:</Text> Stock quantities are reported directly by blood banks and e-RaktKosh integration. Always call the blood centre to verify clinical suitability before travelling.
              </Text>
            </View>

            {/* Results Header */}
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsHeading}>
                Centres in {selectedDistrictName}
              </Text>
              <Badge
                label={`${stockResults.length} REPORTED`}
                variant={stockResults.length > 0 ? 'primary' : 'neutral'}
                size="sm"
              />
            </View>

            {stockErrorMsg && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>⚠️ {stockErrorMsg}</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => handleSearchStock(false)}
                >
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {stockLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#DC2626" />
                <Text style={styles.loadingText}>Searching available blood units...</Text>
              </View>
            ) : stockResults.length === 0 && stockSearched ? (
              <Card style={styles.emptyCard}>
                <Text style={styles.emptyEmoji}>🏥</Text>
                <Text style={styles.emptyTitle}>No Stock Currently Reported</Text>
                <Text style={styles.emptyDesc}>
                  No verified blood centres in {selectedDistrictName} have reported available {selectedBloodGroup} ({selectedComponent}) units right now.
                </Text>
                {onNavigateRequestWithDetails && (
                  <Button
                    title="Create Emergency Blood Request"
                    onPress={() =>
                      onNavigateRequestWithDetails({ bloodGroup: selectedBloodGroup })
                    }
                    variant="primary"
                    size="sm"
                    style={{ marginTop: 14 }}
                  />
                )}
              </Card>
            ) : (
              <View style={styles.resultsList}>
                {stockResults.map((item, index) => {
                  const centre = item.bloodCentre || item;
                  const avail = item.availability || {};
                  const qty = avail.reportedQuantity ?? item.availableUnits ?? null;
                  const isStale = avail.isStale || false;
                  const sourceLabel = item.sourceLabel || (centre.isParticipatingCentre ? 'RaktaSetu Centre' : 'e-RaktKosh Directory');
                  const phone = centre.mobileNo || centre.phone;

                  return (
                    <Card key={centre.hospitalCode || index} style={styles.centreCard} variant="elevated">
                      <View style={styles.centreTopRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.centreName}>{centre.hospitalName || 'Blood Centre'}</Text>
                          {centre.address && (
                            <Text style={styles.centreAddress} numberOfLines={2}>
                              📍 {centre.address}
                            </Text>
                          )}
                        </View>

                        {/* Stock Quantity Badge */}
                        <View
                          style={[
                            styles.qtyBox,
                            qty > 0 ? styles.qtyBoxAvailable : styles.qtyBoxZero,
                          ]}
                        >
                          <Text
                            style={[
                              styles.qtyNumber,
                              qty > 0 ? styles.qtyNumberAvailable : styles.qtyNumberZero,
                            ]}
                          >
                            {qty !== null ? qty : '—'}
                          </Text>
                          <Text style={styles.qtyUnit}>UNITS</Text>
                        </View>
                      </View>

                      {/* Tags Row */}
                      <View style={styles.tagRow}>
                        <Badge
                          label={sourceLabel}
                          variant={centre.isParticipatingCentre ? 'success' : 'neutral'}
                          size="sm"
                        />
                        {isStale && (
                          <Badge label="STALE DATA" variant="warning" size="sm" />
                        )}
                        {avail.status && (
                          <Badge
                            label={avail.status.toUpperCase()}
                            variant={avail.status === 'available' ? 'success' : 'neutral'}
                            size="sm"
                          />
                        )}
                      </View>

                      {/* Actions Row */}
                      <View style={styles.actionRow}>
                        {phone ? (
                          <TouchableOpacity
                            style={styles.callBtn}
                            onPress={() => handleDial(phone)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.callBtnText}>📞 Call {phone}</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.noPhoneBadge}>
                            <Text style={styles.noPhoneText}>Phone unlisted</Text>
                          </View>
                        )}

                        {onNavigateRequestWithDetails && (
                          <TouchableOpacity
                            style={styles.reqBtn}
                            onPress={() =>
                              onNavigateRequestWithDetails({
                                bloodGroup: selectedBloodGroup,
                                hospitalCode: centre.hospitalCode,
                                hospitalName: centre.hospitalName,
                              })
                            }
                            activeOpacity={0.8}
                          >
                            <Text style={styles.reqBtnText}>Request Blood →</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </Card>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ==================================================== */}
        {/* TAB 2: BLOOD CENTRE DIRECTORY                        */}
        {/* ==================================================== */}
        {activeTab === 'DIRECTORY' && (
          <View>
            {/* Filter Section */}
            <Card style={styles.filterCard} variant="elevated">
              <Text style={styles.filterTitle}>Directory Filters</Text>

              {/* District Selector */}
              <View style={styles.pickerBlock}>
                <Text style={styles.pickerLabel}>District</Text>
                <TouchableOpacity
                  style={styles.pickerBtn}
                  onPress={() => setShowDistrictModal(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.pickerValue}>📍 {selectedDistrictName}</Text>
                  <Text style={styles.pickerArrow}>▼</Text>
                </TouchableOpacity>
              </View>

              {/* Search by Centre / Hospital Name */}
              <View style={styles.pickerBlock}>
                <Text style={styles.pickerLabel}>Search Facility Name</Text>
                <View style={styles.searchBar}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="e.g. Sassoon, Ruby Hall, Red Cross..."
                    placeholderTextColor="#9CA3AF"
                    value={dirSearchQuery}
                    onChangeText={setDirSearchQuery}
                    onSubmitEditing={handleApplyDirSearch}
                    returnKeyType="search"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {dirSearchQuery.length > 0 && (
                    <TouchableOpacity
                      style={styles.clearSearchBtn}
                      onPress={handleClearDirSearch}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Text style={styles.clearSearchText}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.dirBtnRow}>
                <Button
                  title="Search Directory"
                  onPress={handleApplyDirSearch}
                  variant="primary"
                  loading={dirLoading}
                  icon="🔍"
                  style={{ flex: 1 }}
                />
                {appliedDirSearch.length > 0 && (
                  <Button
                    title="Clear"
                    onPress={handleClearDirSearch}
                    variant="outline"
                    style={{ minWidth: 80 }}
                  />
                )}
              </View>
            </Card>

            {/* Directory Notice */}
            <View style={styles.disclaimerBox}>
              <Text style={styles.disclaimerText}>
                ℹ️ <Text style={{ fontWeight: '700' }}>Facility Directory:</Text> Contact details for verified blood banks and hospitals. To view currently available blood units, switch to the <Text style={{ fontWeight: '700' }}>Stock Availability</Text> tab.
              </Text>
            </View>

            {/* Results Header */}
            <View style={styles.resultsHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.resultsHeading}>
                  Centres in {selectedDistrictName}
                </Text>
                {appliedDirSearch ? (
                  <Text style={styles.searchFilterNotice}>
                    Matching "{appliedDirSearch}"
                  </Text>
                ) : null}
              </View>
              <Badge
                label={`${dirCentres.length} CENTRES`}
                variant={dirCentres.length > 0 ? 'primary' : 'neutral'}
                size="sm"
              />
            </View>

            {dirErrorMsg && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>⚠️ {dirErrorMsg}</Text>
                <TouchableOpacity
                  style={styles.retryBtn}
                  onPress={() => handleSearchCentres(appliedDirSearch, false)}
                >
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {dirLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#DC2626" />
                <Text style={styles.loadingText}>Loading verified blood centres...</Text>
              </View>
            ) : dirCentres.length === 0 && dirSearched ? (
              <Card style={styles.emptyCard}>
                <Text style={styles.emptyEmoji}>🏢</Text>
                <Text style={styles.emptyTitle}>No Blood Centres Found</Text>
                <Text style={styles.emptyDesc}>
                  {appliedDirSearch
                    ? `No registered blood centres matching "${appliedDirSearch}" were found in ${selectedDistrictName}.`
                    : `No registered blood centres are currently listed for ${selectedDistrictName}.`}
                </Text>
                {appliedDirSearch ? (
                  <Button
                    title="Clear Search Filter"
                    onPress={handleClearDirSearch}
                    variant="outline"
                    size="sm"
                    style={{ marginTop: 14 }}
                  />
                ) : (
                  <Button
                    title="Try Another District"
                    onPress={() => setShowDistrictModal(true)}
                    variant="outline"
                    size="sm"
                    style={{ marginTop: 14 }}
                  />
                )}
              </Card>
            ) : (
              <View style={styles.resultsList}>
                {dirCentres.map((centre, index) => {
                  const sourceLabel =
                    centre.sourceLabel ||
                    (centre.isParticipatingCentre
                      ? 'RaktaSetu Participating Centre'
                      : 'e-RaktKosh Blood Bank');
                  const phone = centre.mobileNo;
                  const hasAddress = !!centre.address && centre.address.trim().length > 0;

                  return (
                    <Card
                      key={centre.hospitalCode || `dir-${index}`}
                      style={styles.centreCard}
                      variant="elevated"
                    >
                      <View style={styles.centreTopRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.centreName}>
                            {centre.hospitalName || 'Blood Centre'}
                          </Text>
                          {hasAddress ? (
                            <Text style={styles.centreAddress}>
                              📍 {centre.address}
                            </Text>
                          ) : (
                            <Text style={styles.centreAddressNotProvided}>
                              📍 Address not provided
                            </Text>
                          )}
                        </View>
                      </View>

                      {/* Source & District Tags */}
                      <View style={styles.tagRow}>
                        <Badge
                          label={sourceLabel}
                          variant={centre.isParticipatingCentre ? 'success' : 'neutral'}
                          size="sm"
                        />
                        {centre.districtCode ? (
                          <Badge
                            label={`District ${centre.districtCode}`}
                            variant="neutral"
                            size="sm"
                          />
                        ) : null}
                      </View>

                      {/* Actions: Call, Directions, Request */}
                      <View style={styles.actionRow}>
                        <View style={styles.actionGroupLeft}>
                          {phone ? (
                            <TouchableOpacity
                              style={styles.callBtn}
                              onPress={() => handleDial(phone)}
                              activeOpacity={0.8}
                            >
                              <Text style={styles.callBtnText}>📞 {phone}</Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={styles.noPhoneBadge}>
                              <Text style={styles.noPhoneText}>Phone unlisted</Text>
                            </View>
                          )}

                          <TouchableOpacity
                            style={[
                              styles.mapBtn,
                              !hasAddress && !centre.hospitalName && styles.mapBtnDisabled,
                            ]}
                            onPress={() =>
                              handleOpenMap(centre.address, centre.hospitalName)
                            }
                            activeOpacity={0.8}
                          >
                            <Text style={styles.mapBtnText}>🗺️ Map</Text>
                          </TouchableOpacity>
                        </View>

                        {onNavigateRequestWithDetails && (
                          <TouchableOpacity
                            style={styles.reqBtn}
                            onPress={() =>
                              onNavigateRequestWithDetails({
                                hospitalCode: centre.hospitalCode,
                                hospitalName: centre.hospitalName,
                              })
                            }
                            activeOpacity={0.8}
                          >
                            <Text style={styles.reqBtnText}>Request Blood →</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </Card>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Select Modals */}
      <SelectModal
        visible={showDistrictModal}
        title="Select District"
        options={districtOptions}
        selectedValue={selectedDistrictCode}
        onSelect={(val) => {
          setSelectedDistrictCode(val);
          setShowDistrictModal(false);
        }}
        onClose={() => setShowDistrictModal(false)}
        searchable={true}
      />

      <SelectModal
        visible={showBloodGroupModal}
        title="Select Blood Group"
        options={bloodGroupOptions}
        selectedValue={selectedBloodGroup}
        onSelect={(val) => {
          setSelectedBloodGroup(val);
          setShowBloodGroupModal(false);
        }}
        onClose={() => setShowBloodGroupModal(false)}
        searchable={false}
      />

      <SelectModal
        visible={showComponentModal}
        title="Select Blood Component"
        options={componentOptions}
        selectedValue={selectedComponent}
        onSelect={(val) => {
          setSelectedComponent(val);
          setShowComponentModal(false);
        }}
        onClose={() => setShowComponentModal(false)}
        searchable={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  segmentedContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  segmentedWrapper: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segmentedTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  segmentedTabActive: {
    backgroundColor: '#DC2626',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentedTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  segmentedTabTextActive: {
    color: '#FFFFFF',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  filterCard: {
    padding: 16,
    marginBottom: 14,
  },
  filterTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
  },
  pickerBlock: {
    marginBottom: 12,
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
    marginBottom: 6,
  },
  pickerBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
  },
  pickerValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  pickerArrow: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  clearSearchBtn: {
    padding: 6,
  },
  clearSearchText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: 'bold',
  },
  dirBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  disclaimerBox: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  disclaimerText: {
    fontSize: 12,
    color: '#1E40AF',
    lineHeight: 17,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultsHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  searchFilterNotice: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
    fontStyle: 'italic',
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 13,
    color: '#B91C1C',
    flex: 1,
  },
  retryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#B91C1C',
    borderRadius: 6,
    marginLeft: 8,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  loadingContainer: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 17,
  },
  resultsList: {
    gap: 12,
  },
  centreCard: {
    padding: 14,
  },
  centreTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  centreName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  centreAddress: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
  centreAddressNotProvided: {
    fontSize: 12,
    color: '#9CA3AF',
    lineHeight: 16,
    fontStyle: 'italic',
  },
  qtyBox: {
    width: 60,
    height: 52,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  qtyBoxAvailable: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  qtyBoxZero: {
    backgroundColor: '#F3F4F6',
    borderColor: '#E5E7EB',
  },
  qtyNumber: {
    fontSize: 18,
    fontWeight: '900',
  },
  qtyNumberAvailable: {
    color: '#15803D',
  },
  qtyNumberZero: {
    color: '#6B7280',
  },
  qtyUnit: {
    fontSize: 9,
    fontWeight: '800',
    color: '#6B7280',
  },
  tagRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 10,
  },
  actionGroupLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  callBtn: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  callBtnText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '700',
  },
  mapBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  mapBtnDisabled: {
    opacity: 0.5,
  },
  mapBtnText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  noPhoneBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  noPhoneText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  reqBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  reqBtnText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },
});
