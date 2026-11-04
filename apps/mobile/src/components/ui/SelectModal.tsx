import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  StyleSheet,
  SafeAreaView,
} from 'react-native';

export interface SelectOption {
  label: string;
  value: string | number;
  subtitle?: string;
}

interface SelectModalProps {
  visible: boolean;
  title: string;
  options: SelectOption[];
  selectedValue?: string | number | null;
  onSelect: (value: any) => void;
  onClose: () => void;
  searchable?: boolean;
}

export const SelectModal: React.FC<SelectModalProps> = ({
  visible,
  title,
  options,
  selectedValue,
  onSelect,
  onClose,
  searchable = true,
}) => {
  const [search, setSearch] = useState('');

  const filtered = options.filter(
    (o) =>
      o.label.toLowerCase().includes(search.toLowerCase()) ||
      (o.subtitle && o.subtitle.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>Done</Text>
          </TouchableOpacity>
        </View>

        {searchable && (
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search..."
              placeholderTextColor="#9CA3AF"
              value={search}
              onChangeText={setSearch}
              clearButtonMode="while-editing"
            />
          </View>
        )}

        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.value)}
          renderItem={({ item }) => {
            const isSelected = item.value === selectedValue;
            return (
              <TouchableOpacity
                style={[styles.item, isSelected && styles.itemSelected]}
                onPress={() => {
                  onSelect(item.value);
                  onClose();
                }}
              >
                <View style={styles.itemContent}>
                  <Text style={[styles.itemLabel, isSelected && styles.itemLabelSelected]}>
                    {item.label}
                  </Text>
                  {item.subtitle && <Text style={styles.itemSubtitle}>{item.subtitle}</Text>}
                </View>
                {isSelected && <Text style={styles.checkMark}>✓</Text>}
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.listContent}
        />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  closeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  closeText: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '700',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  searchInput: {
    height: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    fontSize: 14,
    color: '#111827',
  },
  listContent: {
    paddingVertical: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  itemSelected: {
    backgroundColor: '#FEF2F2',
  },
  itemContent: {
    flex: 1,
  },
  itemLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  itemLabelSelected: {
    color: '#DC2626',
    fontWeight: '800',
  },
  itemSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  checkMark: {
    fontSize: 18,
    color: '#DC2626',
    fontWeight: '800',
  },
  separator: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginLeft: 20,
  },
});

