import type { DangerSign, MedicineEntry, RuleId, SymptomKey } from './types';

export interface SymptomCatalogueItem {
  key: SymptomKey;
  labelKey: string;
  defaultLabel: string;
  readByRules: readonly RuleId[];
}

/**
 * Fixed symptom chips. No triage rule reads them; they go to the doctor file.
 */
export const SYMPTOM_CATALOGUE: readonly SymptomCatalogueItem[] = [
  { key: 'cramps', labelKey: 'symptoms.cramps', defaultLabel: 'Cramps', readByRules: [] },
  { key: 'headache', labelKey: 'symptoms.headache', defaultLabel: 'Headache', readByRules: [] },
  { key: 'bloating', labelKey: 'symptoms.bloating', defaultLabel: 'Bloating', readByRules: [] },
  {
    key: 'tender-breasts',
    labelKey: 'symptoms.tenderBreasts',
    defaultLabel: 'Tender breasts',
    readByRules: [],
  },
  { key: 'back-pain', labelKey: 'symptoms.backPain', defaultLabel: 'Back pain', readByRules: [] },
  { key: 'tiredness', labelKey: 'symptoms.tiredness', defaultLabel: 'Tiredness', readByRules: [] },
  { key: 'cravings', labelKey: 'symptoms.cravings', defaultLabel: 'Cravings', readByRules: [] },
  {
    key: 'constipation',
    labelKey: 'symptoms.constipation',
    defaultLabel: 'Constipation',
    readByRules: [],
  },
] as const;

export interface DangerSignCatalogueItem {
  key: DangerSign;
  labelKey: string;
  defaultLabel: string;
  readByRules: readonly RuleId[];
  oestrogenOnly: boolean;
}

/**
 * Fixed danger-sign chips asked on "Any of these right now?".
 * Rules read warning signs from this list and nowhere else.
 */
export const DANGER_SIGN_CATALOGUE: readonly DangerSignCatalogueItem[] = [
  {
    key: 'fainted',
    labelKey: 'dangerSigns.fainted',
    defaultLabel: 'Fainted',
    readByRules: ['RED-02', 'RED-03', 'RED-06', 'RED-09'],
    oestrogenOnly: false,
  },
  {
    key: 'chest-pain',
    labelKey: 'dangerSigns.chestPain',
    defaultLabel: 'Chest pain',
    readByRules: ['RED-02', 'RED-09'],
    oestrogenOnly: false,
  },
  {
    key: 'short-of-breath',
    labelKey: 'dangerSigns.shortOfBreath',
    defaultLabel: 'Trouble breathing',
    readByRules: ['RED-02', 'RED-09'],
    oestrogenOnly: false,
  },
  {
    key: 'confused',
    labelKey: 'dangerSigns.confused',
    defaultLabel: 'Confused',
    readByRules: ['RED-06', 'RED-09'],
    oestrogenOnly: false,
  },
  {
    key: 'dizzy',
    labelKey: 'dangerSigns.dizzy',
    defaultLabel: 'Dizzy',
    readByRules: ['RED-02', 'RED-03', 'RED-06', 'ORG-14'],
    oestrogenOnly: false,
  },
  {
    key: 'nausea',
    labelKey: 'dangerSigns.nausea',
    defaultLabel: 'Sick to my stomach',
    readByRules: ['RED-03', 'ORG-14'],
    oestrogenOnly: false,
  },
  {
    key: 'very-pale',
    labelKey: 'dangerSigns.veryPale',
    defaultLabel: 'Very pale',
    readByRules: ['RED-03', 'ORG-10', 'ORG-14'],
    oestrogenOnly: false,
  },
  {
    key: 'vomiting',
    labelKey: 'dangerSigns.vomiting',
    defaultLabel: 'Vomiting',
    readByRules: ['RED-06', 'RED-10'],
    oestrogenOnly: false,
  },
  {
    key: 'sunburn-rash',
    labelKey: 'dangerSigns.sunburnRash',
    defaultLabel: 'Sunburn-like rash',
    readByRules: ['RED-06'],
    oestrogenOnly: false,
  },
  {
    key: 'diarrhoea',
    labelKey: 'dangerSigns.diarrhoea',
    defaultLabel: 'Diarrhoea',
    readByRules: ['RED-06'],
    oestrogenOnly: false,
  },
  {
    key: 'unusual-tiredness',
    labelKey: 'dangerSigns.unusualTiredness',
    defaultLabel: 'Unusually tired',
    readByRules: ['ORG-10'],
    oestrogenOnly: false,
  },
  {
    key: 'breathless-on-effort',
    labelKey: 'dangerSigns.breathlessOnEffort',
    defaultLabel: 'Breathless on effort',
    readByRules: ['ORG-10'],
    oestrogenOnly: false,
  },
  {
    key: 'leg-pain-or-swelling',
    labelKey: 'dangerSigns.legPainOrSwelling',
    defaultLabel: 'Leg pain or swelling',
    readByRules: ['RED-11'],
    oestrogenOnly: true,
  },
  {
    key: 'severe-headache',
    labelKey: 'dangerSigns.severeHeadache',
    defaultLabel: 'Sudden severe headache',
    readByRules: ['RED-11'],
    oestrogenOnly: true,
  },
  {
    key: 'vision-change',
    labelKey: 'dangerSigns.visionChange',
    defaultLabel: 'Sudden change in vision',
    readByRules: ['RED-11'],
    oestrogenOnly: true,
  },
] as const;

export interface MedicineCatalogueItem {
  id: string;
  labelKey: string;
  nameShown: string;
  genericName: string | null;
  category: MedicineEntry['category'];
  defaultKind: MedicineEntry['kind'];
  hormoneType?: 'combined-pill' | 'progestin-pill' | 'other';
}

/**
 * Starter medicine list: names and categories only.
 * Holds NO strengths and NO dose limits; she enters strength from her own pack.
 */
export const MEDICINE_CATALOGUE: readonly MedicineCatalogueItem[] = [
  {
    id: 'ponstan',
    labelKey: 'medicines.ponstan',
    nameShown: 'Ponstan',
    genericName: 'mefenamic acid',
    category: 'pain-relief',
    defaultKind: 'dose',
  },
  {
    id: 'ponstan-forte',
    labelKey: 'medicines.ponstanForte',
    nameShown: 'Ponstan Forte',
    genericName: 'mefenamic acid',
    category: 'pain-relief',
    defaultKind: 'dose',
  },
  {
    id: 'brufen',
    labelKey: 'medicines.brufen',
    nameShown: 'Brufen',
    genericName: 'ibuprofen',
    category: 'pain-relief',
    defaultKind: 'dose',
  },
  {
    id: 'panadol',
    labelKey: 'medicines.panadol',
    nameShown: 'Panadol',
    genericName: 'paracetamol',
    category: 'pain-relief',
    defaultKind: 'dose',
  },
  {
    id: 'calpol',
    labelKey: 'medicines.calpol',
    nameShown: 'Calpol',
    genericName: 'paracetamol',
    category: 'pain-relief',
    defaultKind: 'dose',
  },
  {
    id: 'combined-pill',
    labelKey: 'medicines.combinedPill',
    nameShown: 'Combined pill',
    genericName: 'combined pill',
    category: 'hormone',
    defaultKind: 'course',
    hormoneType: 'combined-pill',
  },
  {
    id: 'progestin-pill',
    labelKey: 'medicines.progestinPill',
    nameShown: 'Progestin-only pill',
    genericName: 'progestin-only pill',
    category: 'hormone',
    defaultKind: 'course',
    hormoneType: 'progestin-pill',
  },
  {
    id: 'other-hormone',
    labelKey: 'medicines.otherHormone',
    nameShown: 'Other hormone medicine',
    genericName: null,
    category: 'hormone',
    defaultKind: 'course',
    hormoneType: 'other',
  },
  {
    id: 'iron-supplement',
    labelKey: 'medicines.iron',
    nameShown: 'Iron supplement',
    genericName: 'iron',
    category: 'iron-or-supplement',
    defaultKind: 'course',
  },
] as const;

export const SYMPTOM_KEYS: readonly SymptomKey[] = SYMPTOM_CATALOGUE.map((item) => item.key);
export const DANGER_SIGN_KEYS: readonly DangerSign[] = DANGER_SIGN_CATALOGUE.map((item) => item.key);
