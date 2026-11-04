import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { MAHARASHTRA_DISTRICTS } from '../config/constants';

interface PublicHomeScreenProps {
  onNavigateLogin: () => void;
  onNavigateRegister: () => void;
  onNavigateFindBlood: () => void;
  onNavigateDonors: () => void;
  onNavigateRequests: () => void;
  onOpenDevSettings?: () => void;
}

export const PublicHomeScreen: React.FC<PublicHomeScreenProps> = ({
  onNavigateLogin,
  onNavigateRegister,
  onNavigateFindBlood,
  onNavigateDonors,
  onNavigateRequests,
  onOpenDevSettings,
}) => {
  // Interactive Donor Quick Check State
  const [quickCheckAge, setQuickCheckAge] = useState<boolean | null>(null);
  const [quickCheckWeight, setQuickCheckWeight] = useState<boolean | null>(null);
  const [quickCheckHealthy, setQuickCheckHealthy] = useState<boolean | null>(null);
  const [quickCheckRecent, setQuickCheckRecent] = useState<boolean | null>(null);

  const getQuickCheckResult = () => {
    if (
      quickCheckAge === null ||
      quickCheckWeight === null ||
      quickCheckHealthy === null ||
      quickCheckRecent === null
    ) {
      return null;
    }

    if (!quickCheckAge) {
      return {
        eligible: false,
        title: 'Age Outside Standard Guidelines',
        detail: 'Standard regulatory guidelines in India require voluntary donors to be between 18 and 65 years old.',
      };
    }
    if (!quickCheckWeight) {
      return {
        eligible: false,
        title: 'Weight Below Regulatory Minimum',
        detail: 'Whole blood donation requires a minimum body weight of 45 kg (or 50 kg for 450ml collections).',
      };
    }
    if (!quickCheckHealthy) {
      return {
        eligible: false,
        title: 'Must Be Fully Symptom-Free',
        detail: 'Donors should feel in normal good health on the day of donation without acute fever, flu or infection symptoms.',
      };
    }
    if (quickCheckRecent) {
      return {
        eligible: false,
        title: '90-Day Waiting Period Required',
        detail: 'Whole blood donation interval is at least 90 days (3 months) to allow full hemoglobin regeneration.',
      };
    }

    return {
      eligible: true,
      title: 'Preliminary Self-Check Passed!',
      detail: 'You meet general preliminary criteria! Final clinical screening and hemoglobin check are performed by medical staff before collection.',
    };
  };

  const quickResult = getQuickCheckResult();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 1. Header with Logo & Login Actions */}
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoEmoji}>🩸</Text>
          </View>
          <View>
            <Text style={styles.brandTitle}>RaktaSetu</Text>
            <Text style={styles.brandSubtitle}>Donor & Blood Network</Text>
          </View>
        </View>

        <View style={styles.authButtonsRow}>
          <TouchableOpacity
            style={styles.loginBtn}
            onPress={onNavigateLogin}
            activeOpacity={0.8}
          >
            <Text style={styles.loginBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. Hero Section: Clean, Balanced Blood Discovery & Donor Call */}
      <View style={styles.heroSection}>
        <View style={styles.trustBadge}>
          <Text style={styles.trustBadgeText}>🤝 VOLUNTARY DONOR COMMUNITY</Text>
        </View>

        <Text style={styles.heroHeading} accessibilityRole="header">
          Become a donor.
          <Text style={styles.heroHeadingAccent}> Help save lives.</Text>
        </Text>

        <Text style={styles.heroDescription}>
          Voluntary blood donation takes just a few minutes and connects with registered centres in genuine clinical need across Maharashtra districts.
        </Text>

        <View style={styles.heroCtaRow}>
          <Button
            title="Register as a Donor"
            onPress={onNavigateRegister}
            variant="primary"
            size="lg"
            style={styles.heroPrimaryBtn}
          />
          <Button
            title="Find Blood Stock"
            onPress={onNavigateFindBlood}
            variant="outline"
            size="lg"
            icon="🔍"
            style={styles.heroSecondaryBtn}
          />
        </View>
      </View>

      {/* 3. Emergency Blood Request Entry Point Card */}
      <Card style={styles.emergencyCard} variant="elevated">
        <View style={styles.emergencyHeader}>
          <View style={styles.emergencyBadge}>
            <View style={styles.pulseDot} />
            <Text style={styles.emergencyBadgeText}>EMERGENCY ACCESS</Text>
          </View>
          <Text style={styles.liveIndicator}>🟢 Live Directory</Text>
        </View>

        <Text style={styles.emergencyTitle}>Need blood urgently?</Text>
        <Text style={styles.emergencyDesc}>
          Search reported hospital and centre stock or create a patient blood request across verified Maharashtra centres.
        </Text>

        <View style={styles.emergencyBtnRow}>
          <Button
            title="Search Available Blood Units"
            onPress={onNavigateFindBlood}
            variant="primary"
            style={{ flex: 1 }}
          />
          <Button
            title="Create Request"
            onPress={onNavigateRequests}
            variant="secondary"
            style={{ flex: 1 }}
          />
        </View>
      </Card>

      {/* 4. Core Features Grid */}
      <View style={styles.section}>
        <Text style={styles.sectionHeading}>Core Services</Text>
        <Text style={styles.sectionSubtitle}>
          Direct connection between clinical demand and voluntary community support.
        </Text>

        <View style={styles.featureGrid}>
          {/* Feature 1 */}
          <TouchableOpacity
            style={styles.featureCard}
            onPress={onNavigateFindBlood}
            activeOpacity={0.8}
          >
            <View style={styles.featureIconContainer}>
              <Text style={styles.featureEmoji}>🏥</Text>
            </View>
            <Text style={styles.featureTitle}>Find Blood Centres</Text>
            <Text style={styles.featureDesc}>
              Locate registered blood banks and hospital centres with verified contact details and address directory.
            </Text>
            <Text style={styles.featureLink}>Browse centres →</Text>
          </TouchableOpacity>

          {/* Feature 2 */}
          <TouchableOpacity
            style={styles.featureCard}
            onPress={onNavigateFindBlood}
            activeOpacity={0.8}
          >
            <View style={styles.featureIconContainer}>
              <Text style={styles.featureEmoji}>🩸</Text>
            </View>
            <Text style={styles.featureTitle}>Stock Availability</Text>
            <Text style={styles.featureDesc}>
              Check real-time stock for PRBC, Whole Blood, Platelets, and FFP with explicit zero and freshness tags.
            </Text>
            <Text style={styles.featureLink}>Check units →</Text>
          </TouchableOpacity>

          {/* Feature 3 */}
          <TouchableOpacity
            style={styles.featureCard}
            onPress={onNavigateDonors}
            activeOpacity={0.8}
          >
            <View style={styles.featureIconContainer}>
              <Text style={styles.featureEmoji}>👥</Text>
            </View>
            <Text style={styles.featureTitle}>Nearby Donors</Text>
            <Text style={styles.featureDesc}>
              Discover willing community donors by district with privacy-guaranteed name masking and contact protection.
            </Text>
            <Text style={styles.featureLink}>Discover donors →</Text>
          </TouchableOpacity>

          {/* Feature 4 */}
          <TouchableOpacity
            style={styles.featureCard}
            onPress={onNavigateRegister}
            activeOpacity={0.8}
          >
            <View style={styles.featureIconContainer}>
              <Text style={styles.featureEmoji}>✨</Text>
            </View>
            <Text style={styles.featureTitle}>Join as a Donor</Text>
            <Text style={styles.featureDesc}>
              Register your blood group and receive coordinated emergency alerts when a patient nearby needs blood.
            </Text>
            <Text style={styles.featureLink}>Register now →</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 5. How RaktaSetu Works */}
      <View style={[styles.section, styles.howSection]}>
        <View style={styles.centerBadge}>
          <Text style={styles.centerBadgeText}>TRANSPARENT PROCESS</Text>
        </View>
        <Text style={[styles.sectionHeading, { textAlign: 'center' }]}>
          How Blood Donation Works
        </Text>
        <Text style={[styles.sectionSubtitle, { textAlign: 'center' }]}>
          Every step is governed by standard clinical protocols and medical safety.
        </Text>

        <View style={styles.stepsList}>
          <View style={styles.stepCard}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>1</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Registration & Screening</Text>
              <Text style={styles.stepDesc}>
                Health history questionnaire, vital signs check (BP, pulse, weight) and immediate hemoglobin test by clinical staff.
              </Text>
            </View>
          </View>

          <View style={styles.stepCard}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>2</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Voluntary Donation</Text>
              <Text style={styles.stepDesc}>
                Takes 8-10 minutes using sterile, single-use collection equipment with trained phlebotomists.
              </Text>
            </View>
          </View>

          <View style={styles.stepCard}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>3</Text>
            </View>
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Rest & Refreshment</Text>
              <Text style={styles.stepDesc}>
                Brief 10-15 minute recovery with refreshments. Your donation is tested, processed and saves up to 3 lives.
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* 6. Interactive Donor Quick Check */}
      <Card style={styles.quickCheckCard}>
        <View style={styles.quickCheckHeader}>
          <Text style={styles.quickCheckIcon}>📋</Text>
          <View>
            <Text style={styles.quickCheckTitle}>Donor Quick Self-Check</Text>
            <Text style={styles.quickCheckSubtitle}>
              Check your general preliminary eligibility before heading to a centre.
            </Text>
          </View>
        </View>

        {/* Question 1: Age */}
        <View style={styles.questionBlock}>
          <Text style={styles.questionText}>1. Are you between 18 and 65 years of age?</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity
              style={[
                styles.optionBtn,
                quickCheckAge === true && styles.optionBtnSelected,
              ]}
              onPress={() => setQuickCheckAge(true)}
            >
              <Text
                style={[
                  styles.optionText,
                  quickCheckAge === true && styles.optionTextSelected,
                ]}
              >
                Yes
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.optionBtn,
                quickCheckAge === false && styles.optionBtnSelected,
              ]}
              onPress={() => setQuickCheckAge(false)}
            >
              <Text
                style={[
                  styles.optionText,
                  quickCheckAge === false && styles.optionTextSelected,
                ]}
              >
                No
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Question 2: Weight */}
        <View style={styles.questionBlock}>
          <Text style={styles.questionText}>2. Is your weight at least 45 kg?</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity
              style={[
                styles.optionBtn,
                quickCheckWeight === true && styles.optionBtnSelected,
              ]}
              onPress={() => setQuickCheckWeight(true)}
            >
              <Text
                style={[
                  styles.optionText,
                  quickCheckWeight === true && styles.optionTextSelected,
                ]}
              >
                Yes
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.optionBtn,
                quickCheckWeight === false && styles.optionBtnSelected,
              ]}
              onPress={() => setQuickCheckWeight(false)}
            >
              <Text
                style={[
                  styles.optionText,
                  quickCheckWeight === false && styles.optionTextSelected,
                ]}
              >
                No
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Question 3: Healthy Today */}
        <View style={styles.questionBlock}>
          <Text style={styles.questionText}>3. Do you feel in normal good health today without fever or cold?</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity
              style={[
                styles.optionBtn,
                quickCheckHealthy === true && styles.optionBtnSelected,
              ]}
              onPress={() => setQuickCheckHealthy(true)}
            >
              <Text
                style={[
                  styles.optionText,
                  quickCheckHealthy === true && styles.optionTextSelected,
                ]}
              >
                Yes
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.optionBtn,
                quickCheckHealthy === false && styles.optionBtnSelected,
              ]}
              onPress={() => setQuickCheckHealthy(false)}
            >
              <Text
                style={[
                  styles.optionText,
                  quickCheckHealthy === false && styles.optionTextSelected,
                ]}
              >
                No
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Question 4: Donated in last 90 days */}
        <View style={styles.questionBlock}>
          <Text style={styles.questionText}>4. Have you donated blood in the past 90 days (3 months)?</Text>
          <View style={styles.optionRow}>
            <TouchableOpacity
              style={[
                styles.optionBtn,
                quickCheckRecent === true && styles.optionBtnSelected,
              ]}
              onPress={() => setQuickCheckRecent(true)}
            >
              <Text
                style={[
                  styles.optionText,
                  quickCheckRecent === true && styles.optionTextSelected,
                ]}
              >
                Yes
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.optionBtn,
                quickCheckRecent === false && styles.optionBtnSelected,
              ]}
              onPress={() => setQuickCheckRecent(false)}
            >
              <Text
                style={[
                  styles.optionText,
                  quickCheckRecent === false && styles.optionTextSelected,
                ]}
              >
                No
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Result Box */}
        {quickResult && (
          <View
            style={[
              styles.quickResultBox,
              quickResult.eligible
                ? styles.quickResultSuccess
                : styles.quickResultWarning,
            ]}
          >
            <Text
              style={[
                styles.quickResultTitle,
                quickResult.eligible
                  ? styles.quickResultSuccessTitle
                  : styles.quickResultWarningTitle,
              ]}
            >
              {quickResult.eligible ? '✅ ' : 'ℹ️ '}
              {quickResult.title}
            </Text>
            <Text style={styles.quickResultDetail}>{quickResult.detail}</Text>
          </View>
        )}

        <Text style={styles.medicalDisclaimer}>
          * Note: This quick tool provides preliminary self-screening guidance only. Definitive fitness evaluation is conducted in person by qualified clinical staff at blood centres.
        </Text>
      </Card>

      {/* 7. Safety Information Section */}
      <View style={styles.section}>
        <Text style={styles.sectionHeading}>Blood Donation Safety</Text>
        <Text style={styles.sectionSubtitle}>
          Common safety facts that every voluntary donor should know.
        </Text>

        <Card style={styles.safetyCard}>
          <View style={styles.safetyRow}>
            <Text style={styles.safetyIcon}>🛡️</Text>
            <View style={styles.safetyTextWrapper}>
              <Text style={styles.safetyTitle}>Zero Risk of Infection</Text>
              <Text style={styles.safetyBody}>
                All needles, tubing, and blood collection bags are completely sterile, single-use, and disposed of immediately after collection.
              </Text>
            </View>
          </View>

          <View style={styles.safetyDivider} />

          <View style={styles.safetyRow}>
            <Text style={styles.safetyIcon}>⚡</Text>
            <View style={styles.safetyTextWrapper}>
              <Text style={styles.safetyTitle}>Fast Fluid Recovery</Text>
              <Text style={styles.safetyBody}>
                Your body replaces the donated plasma fluid within 24 to 48 hours. Red blood cells fully regenerate within 4 to 8 weeks.
              </Text>
            </View>
          </View>

          <View style={styles.safetyDivider} />

          <View style={styles.safetyRow}>
            <Text style={styles.safetyIcon}>👨‍⚕️</Text>
            <View style={styles.safetyTextWrapper}>
              <Text style={styles.safetyTitle}>Doctor Screened</Text>
              <Text style={styles.safetyBody}>
                Trained medical professionals check blood pressure, pulse, and hemoglobin before every single donation.
              </Text>
            </View>
          </View>
        </Card>
      </View>

      {/* 8. Verified District Directory Coverage */}
      <View style={styles.section}>
        <Text style={styles.sectionHeading}>District Coverage</Text>
        <Text style={styles.sectionSubtitle}>
          Active blood centre directory integration across Maharashtra.
        </Text>

        <View style={styles.districtChipsRow}>
          {MAHARASHTRA_DISTRICTS.map((d) => (
            <TouchableOpacity
              key={d.code}
              style={styles.districtChip}
              onPress={onNavigateFindBlood}
            >
              <Text style={styles.districtChipText}>{d.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 9. Final CTA & Footer */}
      <View style={styles.footerCta}>
        <Text style={styles.footerCtaTitle}>Ready to make a difference?</Text>
        <Text style={styles.footerCtaDesc}>
          Join thousands of voluntary donors across Maharashtra. Sign in to manage your donations or share live emergency coordinates.
        </Text>
        <Button
          title="Sign In or Register"
          onPress={onNavigateLogin}
          variant="primary"
          size="lg"
          style={{ width: '100%', marginTop: 12 }}
        />

        {onOpenDevSettings && (
          <TouchableOpacity
            style={styles.devSettingsLink}
            onPress={onOpenDevSettings}
          >
            <Text style={styles.devSettingsLinkText}>⚙️ Developer API Settings</Text>
          </TouchableOpacity>
        )}

        <View style={styles.footerLegal}>
          <Text style={styles.footerLegalText}>
            RaktaSetu Prototype Platform • Government of Maharashtra e-RaktKosh Directory Integration
          </Text>
          <Text style={styles.footerLegalSubtext}>
            In urgent situations, always contact hospital emergency or national emergency services directly.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    paddingBottom: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoEmoji: {
    fontSize: 20,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
  },
  authButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  loginBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#DC2626',
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  heroSection: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 24,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  trustBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 12,
  },
  trustBadgeText: {
    color: '#B91C1C',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  heroHeading: {
    fontSize: 30,
    fontWeight: '900',
    color: '#111827',
    lineHeight: 38,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  heroHeadingAccent: {
    color: '#DC2626',
  },
  heroDescription: {
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 22,
    marginBottom: 20,
  },
  heroCtaRow: {
    flexDirection: 'column',
    gap: 10,
  },
  heroPrimaryBtn: {
    width: '100%',
  },
  heroSecondaryBtn: {
    width: '100%',
  },
  emergencyCard: {
    marginHorizontal: 20,
    marginTop: 20,
    backgroundColor: '#1E293B',
    borderColor: '#334155',
  },
  emergencyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  emergencyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#DC2626',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  emergencyBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  liveIndicator: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '700',
  },
  emergencyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  emergencyDesc: {
    fontSize: 13,
    color: '#CBD5E1',
    lineHeight: 18,
    marginBottom: 16,
  },
  emergencyBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  section: {
    paddingHorizontal: 20,
    marginTop: 28,
  },
  sectionHeading: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 18,
  },
  featureGrid: {
    gap: 12,
  },
  featureCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  featureIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  featureEmoji: {
    fontSize: 20,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 17,
    marginBottom: 8,
  },
  featureLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  howSection: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 28,
    marginHorizontal: 0,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  centerBadge: {
    alignSelf: 'center',
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    marginBottom: 8,
  },
  centerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  stepsList: {
    gap: 12,
    marginTop: 8,
  },
  stepCard: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 4,
  },
  stepDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
  quickCheckCard: {
    marginHorizontal: 20,
    marginTop: 28,
  },
  quickCheckHeader: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  quickCheckIcon: {
    fontSize: 28,
  },
  quickCheckTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  quickCheckSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    maxWidth: 260,
  },
  questionBlock: {
    marginBottom: 14,
  },
  questionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  optionBtn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionBtnSelected: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  optionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },
  optionTextSelected: {
    color: '#FFFFFF',
  },
  quickResultBox: {
    padding: 14,
    borderRadius: 10,
    marginTop: 8,
    marginBottom: 10,
    borderWidth: 1,
  },
  quickResultSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  quickResultWarning: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  quickResultTitle: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 4,
  },
  quickResultSuccessTitle: {
    color: '#065F46',
  },
  quickResultWarningTitle: {
    color: '#92400E',
  },
  quickResultDetail: {
    fontSize: 12,
    color: '#374151',
    lineHeight: 16,
  },
  medicalDisclaimer: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
    lineHeight: 15,
  },
  safetyCard: {
    padding: 16,
  },
  safetyRow: {
    flexDirection: 'row',
    gap: 12,
  },
  safetyIcon: {
    fontSize: 22,
  },
  safetyTextWrapper: {
    flex: 1,
  },
  safetyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 3,
  },
  safetyBody: {
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 17,
  },
  safetyDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 12,
  },
  districtChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  districtChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  districtChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  footerCta: {
    marginHorizontal: 20,
    marginTop: 36,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  footerCtaTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'center',
  },
  footerCtaDesc: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  devSettingsLink: {
    marginTop: 14,
    paddingVertical: 6,
  },
  devSettingsLinkText: {
    fontSize: 12,
    color: '#9CA3AF',
    textDecorationLine: 'underline',
  },
  footerLegal: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    alignItems: 'center',
  },
  footerLegalText: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 4,
  },
  footerLegalSubtext: {
    fontSize: 10,
    color: '#D1D5DB',
    textAlign: 'center',
    lineHeight: 14,
  },
});
