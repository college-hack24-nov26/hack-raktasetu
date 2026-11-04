import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

export type TabKey = 'HOME' | 'FIND_BLOOD' | 'DONORS' | 'REQUESTS' | 'PROFILE';
export type BottomTabType = TabKey;

export interface BottomTabsProps {
  currentTab?: TabKey;
  activeTab?: TabKey;
  onSelectTab?: (tab: TabKey) => void;
  onTabChange?: (tab: TabKey) => void;
  badgeCounts?: Partial<Record<TabKey, number>>;
}

interface TabConfig {
  key: TabKey;
  label: string;
  icon: string;
}

const TABS: TabConfig[] = [
  { key: 'HOME', label: 'Home', icon: '🩸' },
  { key: 'FIND_BLOOD', label: 'Find Blood', icon: '🏥' },
  { key: 'DONORS', label: 'Donors', icon: '👥' },
  { key: 'REQUESTS', label: 'Requests', icon: '📋' },
  { key: 'PROFILE', label: 'Profile', icon: '👤' },
];

export const BottomTabs: React.FC<BottomTabsProps> = ({
  currentTab,
  activeTab,
  onSelectTab,
  onTabChange,
  badgeCounts = {},
}) => {
  const active = activeTab || currentTab || 'HOME';
  const handleSelect = (key: TabKey) => {
    if (onTabChange) onTabChange(key);
    if (onSelectTab) onSelectTab(key);
  };

  return (
    <View style={styles.container}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        const count = badgeCounts[tab.key];

        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tabItem}
            onPress={() => handleSelect(tab.key)}
            activeOpacity={0.7}
          >
            <View style={styles.iconWrapper}>
              <Text style={[styles.icon, isActive && styles.iconActive]}>
                {tab.icon}
              </Text>
              {typeof count === 'number' && count > 0 && (
                <View style={styles.badgeWrapper}>
                  <Text style={styles.badgeText}>
                    {count > 99 ? '99+' : count}
                  </Text>
                </View>
              )}
            </View>
            <Text style={[styles.label, isActive && styles.labelActive]}>
              {tab.label}
            </Text>
            {isActive && <View style={styles.activeIndicator} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    height: Platform.OS === 'ios' ? 76 : 64,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingBottom: Platform.OS === 'ios' ? 18 : 6,
    paddingTop: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconWrapper: {
    position: 'relative',
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    fontSize: 20,
    opacity: 0.7,
  },
  iconActive: {
    opacity: 1,
    transform: [{ scale: 1.08 }],
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 3,
  },
  labelActive: {
    color: '#DC2626',
    fontWeight: '800',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -4,
    width: 16,
    height: 3,
    backgroundColor: '#DC2626',
    borderRadius: 2,
  },
  badgeWrapper: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: '#DC2626',
    borderRadius: 9,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
});
