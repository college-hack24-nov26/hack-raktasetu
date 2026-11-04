import { prisma } from './prisma';

export async function initDonorRegistrationSchema() {
  console.log('Ensuring donor_registrations table and indexes exist...');
  
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS donor_registrations (
      id TEXT PRIMARY KEY,
      registration_number TEXT UNIQUE NOT NULL,
      donor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      donor_profile_id TEXT REFERENCES donor_profiles(id) ON DELETE SET NULL,
      organisation_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE RESTRICT,
      blood_centre_id TEXT REFERENCES blood_centres("hospitalCode") ON DELETE SET NULL,
      camp_id TEXT REFERENCES camps(id) ON DELETE SET NULL,
      registered_by_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      registration_source TEXT NOT NULL DEFAULT 'CAMP',
      donation_type TEXT NOT NULL DEFAULT 'VOLUNTARY',
      current_step INTEGER NOT NULL DEFAULT 1,
      workflow_status TEXT NOT NULL DEFAULT 'DRAFT',
      is_completed BOOLEAN NOT NULL DEFAULT FALSE,
      completed_at TIMESTAMP WITHOUT TIME ZONE,

      donor_details JSONB NOT NULL DEFAULT '{}'::jsonb,

      counselling_status TEXT NOT NULL DEFAULT 'APPROVED_DEFAULT_DEMO',
      counselling_reviewed_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      counselling_reviewed_at TIMESTAMP WITHOUT TIME ZONE,
      counselling_remarks TEXT,
      can_issue_plasma BOOLEAN,
      counselling_deferral_type TEXT,
      counselling_deferral_reason TEXT,
      counselling_answers JSONB NOT NULL DEFAULT '[]'::jsonb,
      counselling_audit_history JSONB NOT NULL DEFAULT '[]'::jsonb,

      screening_status TEXT NOT NULL DEFAULT 'PENDING',
      weight_kg NUMERIC(5, 2),
      hemoglobin_g_dl NUMERIC(4, 2),
      blood_group_screening TEXT,
      systolic_bp INTEGER,
      diastolic_bp INTEGER,
      pulse_bpm INTEGER,
      temperature_celsius NUMERIC(4, 2),
      height_cm NUMERIC(5, 2),
      both_arms_inspected BOOLEAN DEFAULT FALSE,
      post_donation_tips_given BOOLEAN DEFAULT FALSE,
      screened_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      medical_officer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      registration_process_type TEXT DEFAULT 'DONOR',
      screening_remarks TEXT,
      screening_deferral_category TEXT,
      screening_deferral_reason TEXT,
      screening_performed_at TIMESTAMP WITHOUT TIME ZONE,

      collection_status TEXT NOT NULL DEFAULT 'NOT_COLLECTED',
      phlebotomy_date_time TIMESTAMP WITHOUT TIME ZONE,
      bag_type TEXT,
      manufacturer TEXT,
      lot_number TEXT,
      segment_number TEXT,
      unit_number TEXT UNIQUE,
      barcode TEXT UNIQUE,
      is_less_quantity BOOLEAN DEFAULT FALSE,
      volume_ml INTEGER,
      phlebotomy_duration_minutes INTEGER,
      phlebotomist_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      doctor_staff_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      collection_observations TEXT,
      adverse_reaction BOOLEAN DEFAULT FALSE,
      adverse_reaction_details TEXT,
      time_refreshments_provided TEXT,
      exit_time TEXT,
      collection_remarks TEXT,

      consent_given BOOLEAN NOT NULL DEFAULT TRUE,
      consent_recorded_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
      consent_version TEXT DEFAULT 'v1.0',
      pdf_generated_at TIMESTAMP WITHOUT TIME ZONE,
      pdf_document_version INTEGER DEFAULT 1,

      -- Working address & discovery consent
      working_address TEXT,
      working_state TEXT,
      working_state_code INTEGER,
      working_district TEXT,
      working_district_code INTEGER,
      working_city TEXT,
      working_pin_code TEXT,
      working_same_as_permanent BOOLEAN DEFAULT FALSE,

      discovery_consent BOOLEAN DEFAULT FALSE,
      discovery_consent_recorded_at TIMESTAMP WITHOUT TIME ZONE,
      discovery_consent_source TEXT,
      discovery_consent_version TEXT DEFAULT 'v1.0',

      medical_decision TEXT DEFAULT 'PENDING',
      medical_decision_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      medical_decision_at TIMESTAMP WITHOUT TIME ZONE,
      medical_decision_remarks TEXT,
      medical_deferral_category TEXT,
      medical_deferral_reason TEXT,

      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW()
    );
  `);

  // Ensure new columns exist on existing table installations
  const alterColumns = [
    'ALTER TABLE donor_registrations ADD COLUMN IF NOT EXISTS working_address TEXT',
    'ALTER TABLE donor_registrations ADD COLUMN IF NOT EXISTS working_state TEXT',
    'ALTER TABLE donor_registrations ADD COLUMN IF NOT EXISTS working_state_code INTEGER',
    'ALTER TABLE donor_registrations ADD COLUMN IF NOT EXISTS working_district TEXT',
    'ALTER TABLE donor_registrations ADD COLUMN IF NOT EXISTS working_district_code INTEGER',
    'ALTER TABLE donor_registrations ADD COLUMN IF NOT EXISTS working_city TEXT',
    'ALTER TABLE donor_registrations ADD COLUMN IF NOT EXISTS working_pin_code TEXT',
    'ALTER TABLE donor_registrations ADD COLUMN IF NOT EXISTS working_same_as_permanent BOOLEAN DEFAULT FALSE',
    'ALTER TABLE donor_registrations ADD COLUMN IF NOT EXISTS discovery_consent BOOLEAN DEFAULT FALSE',
    'ALTER TABLE donor_registrations ADD COLUMN IF NOT EXISTS discovery_consent_recorded_at TIMESTAMP WITHOUT TIME ZONE',
    'ALTER TABLE donor_registrations ADD COLUMN IF NOT EXISTS discovery_consent_source TEXT',
    'ALTER TABLE donor_registrations ADD COLUMN IF NOT EXISTS discovery_consent_version TEXT DEFAULT \'v1.0\'',
    'ALTER TABLE donor_registrations ADD COLUMN IF NOT EXISTS medical_decision TEXT DEFAULT \'PENDING\'',
    'ALTER TABLE donor_registrations ADD COLUMN IF NOT EXISTS medical_decision_by_id TEXT REFERENCES users(id) ON DELETE SET NULL',
    'ALTER TABLE donor_registrations ADD COLUMN IF NOT EXISTS medical_decision_at TIMESTAMP WITHOUT TIME ZONE',
    'ALTER TABLE donor_registrations ADD COLUMN IF NOT EXISTS medical_decision_remarks TEXT',
    'ALTER TABLE donor_registrations ADD COLUMN IF NOT EXISTS medical_deferral_category TEXT',
    'ALTER TABLE donor_registrations ADD COLUMN IF NOT EXISTS medical_deferral_reason TEXT',
  ];

  for (const colSql of alterColumns) {
    await prisma.$executeRawUnsafe(colSql);
  }

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_donor_reg_donor_user ON donor_registrations(donor_user_id)',
    'CREATE INDEX IF NOT EXISTS idx_donor_reg_camp ON donor_registrations(camp_id)',
    'CREATE INDEX IF NOT EXISTS idx_donor_reg_org ON donor_registrations(organisation_id)',
    'CREATE INDEX IF NOT EXISTS idx_donor_reg_status ON donor_registrations(workflow_status)',
    'CREATE INDEX IF NOT EXISTS idx_donor_reg_barcode ON donor_registrations(barcode)',
    'CREATE INDEX IF NOT EXISTS idx_donor_reg_unit ON donor_registrations(unit_number)',
    'CREATE INDEX IF NOT EXISTS idx_donor_reg_med_decision ON donor_registrations(medical_decision)',
  ];

  for (const idxSql of indexes) {
    await prisma.$executeRawUnsafe(idxSql);
  }

  console.log('donor_registrations table and indexes verified successfully.');
}

if (require.main === module) {
  initDonorRegistrationSchema()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
