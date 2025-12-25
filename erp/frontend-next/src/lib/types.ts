export type Employee = {
  id: number;
  employee_id: string;
  first_name: string;
  last_name: string;
  warning_count?: number | null;
  gender?: string | null;
  date_of_birth?: string | null;
  profile_photo?: string | null;
  government_id?: string | null;
  cnic?: string | null;
  cnic_expiry_date?: string | null;
  domicile?: string | null;
  languages_spoken?: string[] | null;
  languages_proficiency?: { language: string; level: string }[] | null;
  height_cm?: number | null;
  email: string;
  mobile_number?: string | null;
  personal_phone_number?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_number?: string | null;
  father_name?: string | null;
  previous_employment?: string | null;
  next_of_kin_name?: string | null;
  next_of_kin_cnic?: string | null;
  next_of_kin_mobile_number?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  permanent_address?: string | null;
  temporary_address?: string | null;

  permanent_village?: string | null;
  permanent_post_office?: string | null;
  permanent_thana?: string | null;
  permanent_tehsil?: string | null;
  permanent_district?: string | null;

  present_village?: string | null;
  present_post_office?: string | null;
  present_thana?: string | null;
  present_tehsil?: string | null;
  present_district?: string | null;

  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  department?: string | null;
  designation?: string | null;
  enrolled_as?: string | null;
  employment_type?: string | null;
  shift_type?: string | null;
  reporting_manager?: string | null;
  base_location?: string | null;
  interviewed_by?: string | null;
  introduced_by?: string | null;
  security_clearance?: string | null;
  basic_security_training: boolean;
  fire_safety_training: boolean;
  first_aid_certification: boolean;
  agreement: boolean;
  police_clearance: boolean;
  fingerprint_check: boolean;
  background_screening: boolean;
  reference_verification: boolean;
  guard_card: boolean;
  guard_card_doc?: string | null;
  police_clearance_doc?: string | null;
  fingerprint_check_doc?: string | null;
  background_screening_doc?: string | null;
  reference_verification_doc?: string | null;
  other_certificates?: string | null;
  basic_salary?: string | null;
  allowances?: string | null;
  total_salary?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  ifsc_code?: string | null;
  account_type?: string | null;
  tax_id?: string | null;
  bank_accounts?:
    | Array<{
        bank_name?: string | null;
        account_number?: string | null;
        ifsc_code?: string | null;
        account_type?: string | null;
        tax_id?: string | null;
      }>
    | null;
  system_access_rights?: string | null;
  employment_status: string;
  last_site_assigned?: string | null;
  remarks?: string | null;

  retired_from?: string[] | null;
  service_unit?: string | null;
  service_rank?: string | null;
  service_enrollment_date?: string | null;
  service_reenrollment_date?: string | null;
  medical_category?: string | null;
  discharge_cause?: string | null;

  blood_group?: string | null;
  civil_education_type?: string | null;
  civil_education_detail?: string | null;

  sons_names?: string | null;
  daughters_names?: string | null;
  brothers_names?: string | null;
  sisters_names?: string | null;

  particulars_verified_by_sho_on?: string | null;
  particulars_verified_by_ssp_on?: string | null;
  police_khidmat_verification_on?: string | null;

  signature_recording_officer?: string | null;
  signature_individual?: string | null;
  fss_number?: string | null;
  fss_name?: string | null;
  fss_so?: string | null;

  documents_handed_over_to?: string | null;
  photo_on_document?: string | null;
  eobi_no?: string | null;
  insurance?: string | null;
  social_security?: string | null;
  home_contact_no?: string | null;
  police_training_letter_date?: string | null;
  vaccination_certificate?: string | null;
  volume_no?: string | null;
  payments?: string | null;

  original_doc_held?: string | null;
  fingerprint_attested_by?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type EmployeeCreate = Omit<Employee, "id" | "employee_id" | "created_at" | "updated_at">;

export type EmployeeUpdate = Partial<EmployeeCreate>;

export type EmployeeListResponse = {
  employees: Employee[];
  total: number;
};

export type Employee2 = {
  id: number;
  serial_no: string | null;
  fss_no: string | null;
  rank: string | null;
  name: string;
  father_name: string | null;
  salary: string | null;
  status: string | null;
  unit: string | null;
  service_rank: string | null;
  blood_group: string | null;
  status2: string | null;
  unit2: string | null;
  rank2: string | null;
  cnic: string | null;
  dob: string | null;
  cnic_expiry: string | null;
  documents_held: string | null;
  documents_handed_over_to: string | null;
  photo_on_doc: string | null;
  eobi_no: string | null;
  insurance: string | null;
  social_security: string | null;
  mobile_no: string | null;
  home_contact: string | null;
  verified_by_sho: string | null;
  verified_by_khidmat_markaz: string | null;
  domicile: string | null;
  verified_by_ssp: string | null;
  enrolled: string | null;
  re_enrolled: string | null;
  village: string | null;
  post_office: string | null;
  thana: string | null;
  tehsil: string | null;
  district: string | null;
  duty_location: string | null;
  police_trg_ltr_date: string | null;
  vaccination_cert: string | null;
  vol_no: string | null;
  payments: string | null;
  category: string | null;
  created_at: string;
  updated_at: string | null;
};

export type Employee2ListResponse = {
  employees: Employee2[];
  total: number;
};

export type EmployeeDocumentOut = {
  id: number;
  employee_db_id: number;
  name: string;
  filename: string;
  url: string;
  mime_type: string;
  created_at: string;
  updated_at?: string | null;
};

export type EmployeeWarning = {
  id: number;
  employee_db_id: number;
  warning_number: string;
  found_with?: string | null;
  notice_text?: string | null;
  supervisor_signature?: string | null;
  supervisor_signature_date?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type EmployeeWarningCreate = {
  warning_number: string;
  found_with?: string | null;
  notice_text?: string | null;
  supervisor_signature?: string | null;
  supervisor_signature_date?: string | null;
};

export type EmployeeWarningDocumentOut = {
  id: number;
  warning_id: number;
  filename: string;
  url: string;
  mime_type: string;
  created_at: string;
  updated_at?: string | null;
};

export type Vehicle = {
  id: number;
  vehicle_id: string;
  vehicle_type: string;
  category: string;
  make_model: string;
  license_plate: string;
  chassis_number?: string | null;
  asset_tag?: string | null;
  year: number;
  status: string;
  compliance: string;
  government_permit: string;
  created_at: string;
  updated_at?: string | null;
};

export type VehicleCreate = Omit<Vehicle, "id" | "created_at" | "updated_at">;

export type VehicleUpdate = Partial<VehicleCreate>;

export type VehicleAssignment = {
  id: number;
  vehicle_id: string;
  employee_ids: string[];
  route_stops?: string[] | null;
  route_from: string;
  route_to: string;
  assignment_date?: string | null;
  notes?: string | null;
  status: string;
  distance_km?: number | null;
  rate_per_km?: number | null;
  amount?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type VehicleAssignmentCreate = {
  vehicle_id: string;
  employee_ids: string[];
  route_stops?: string[] | null;
  route_from?: string | null;
  route_to?: string | null;
  assignment_date?: string | null;
  notes?: string | null;
};

export type VehicleAssignmentUpdate = Partial<VehicleAssignmentCreate> & {
  status?: string;
  distance_km?: number | null;
  rate_per_km?: number | null;
  amount?: number | null;
  start_time?: string | null;
  end_time?: string | null;
};

export type VehicleAssignmentAggRow = {
  vehicle_id: string;
  assignments: number;
  total_km: number;
  total_amount: number;
  avg_rate_per_km?: number | null;
  cost_per_km?: number | null;
};

export type VehicleAssignmentAnalyticsResponse = {
  period: string;
  date?: string | null;
  month?: string | null;
  year?: number | null;
  vehicle_id?: string | null;
  rows: VehicleAssignmentAggRow[];
  best_cost_per_km: VehicleAssignmentAggRow[];
  worst_cost_per_km: VehicleAssignmentAggRow[];
};

export type AssignmentEfficiencyRow = {
  assignment_id: number;
  assignment_date?: string | null;
  vehicle_id: string;
  employee_ids: string[];
  route_from?: string | null;
  route_to?: string | null;
  distance_km: number;
  amount: number;
  rate_per_km: number;
  cost_per_km: number;
  vehicle_avg_cost_per_km?: number | null;
  delta_vs_vehicle_avg?: number | null;
};

export type VehicleEfficiencySummaryRow = {
  vehicle_id: string;
  assignments: number;
  total_km: number;
  total_amount: number;
  avg_cost_per_km?: number | null;
  min_cost_per_km?: number | null;
  max_cost_per_km?: number | null;
};

export type EmployeeEfficiencySummaryRow = {
  employee_id: string;
  assignments: number;
  total_km: number;
  total_amount: number;
  avg_cost_per_km?: number | null;
  expensive_assignments: number;
};

export type VehicleAssignmentEfficiencyResponse = {
  period: string;
  date?: string | null;
  month?: string | null;
  year?: number | null;
  vehicle_id?: string | null;
  assignments: number;
  total_km: number;
  total_amount: number;
  avg_cost_per_km?: number | null;
  vehicles: VehicleEfficiencySummaryRow[];
  expensive_assignments: AssignmentEfficiencyRow[];
  efficient_assignments: AssignmentEfficiencyRow[];
  employees: EmployeeEfficiencySummaryRow[];
};

export type VehicleMaintenance = {
  id: number;
  vehicle_id: string;
  employee_id?: string | null;
  description?: string | null;
  maintenance_date: string;
  cost?: number | null;
  odometer_km?: number | null;
  service_vendor?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type VehicleMaintenanceCreate = {
  vehicle_id: string;
  employee_id?: string | null;
  description?: string | null;
  maintenance_date: string;
  cost?: number | null;
  odometer_km?: number | null;
  service_vendor?: string | null;
};

export type VehicleMaintenanceUpdate = Partial<VehicleMaintenanceCreate>;

 export type FinanceAccount = {
   id: number;
   code: string;
   name: string;
   account_type: string;
   parent_id?: number | null;
   is_system: boolean;
   is_active: boolean;
   created_at: string;
   updated_at?: string | null;
 };

 export type FinanceAccountCreate = {
   code: string;
   name: string;
   account_type: string;
   parent_id?: number | null;
   is_system?: boolean;
   is_active?: boolean;
 };

 export type FinanceAccountUpdate = {
   name?: string | null;
   account_type?: string | null;
   parent_id?: number | null;
   is_active?: boolean | null;
 };

 export type FinanceJournalLine = {
   id: number;
   account_id: number;
   description?: string | null;
   debit: string;
   credit: string;
   employee_id?: number | null;
   created_at: string;
 };

 export type FinanceJournalLineCreate = {
   account_id: number;
   description?: string | null;
   debit?: string | number;
   credit?: string | number;
   employee_id?: number | null;
 };

 export type FinanceJournalEntry = {
   id: number;
   entry_no: string;
   entry_date: string;
   memo?: string | null;
   source_type?: string | null;
   source_id?: string | null;
   status: string;
   created_at: string;
   posted_at?: string | null;
   lines: FinanceJournalLine[];
 };

 export type FinanceJournalEntryCreate = {
   entry_date: string;
   memo?: string | null;
   source_type?: string | null;
   source_id?: string | null;
   lines: FinanceJournalLineCreate[];
 };

 export type FinanceJournalEntryUpdate = {
   entry_date?: string | null;
   memo?: string | null;
 };

export type FuelEntry = {
  id: number;
  vehicle_id: string;
  entry_date: string;
  fuel_type?: string | null;
  liters: number;
  price_per_liter?: number | null;
  total_cost?: number | null;
  odometer_km?: number | null;
  vendor?: string | null;
  location?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type FuelEntryCreate = Omit<FuelEntry, "id" | "created_at" | "updated_at">;

export type FuelEntryUpdate = Partial<FuelEntryCreate>;

export type FuelMileageTip = {
  level: string;
  title: string;
  detail: string;
};

export type FuelMileageSummary = {
  vehicle_id?: string | null;
  from_date?: string | null;
  to_date?: string | null;
  entries: number;
  total_liters: number;
  total_cost: number;
  start_odometer_km?: number | null;
  end_odometer_km?: number | null;
  distance_km?: number | null;
  avg_km_per_liter?: number | null;
  avg_cost_per_km?: number | null;
  tips: FuelMileageTip[];
};

export type AttendanceStatus = "unmarked" | "present" | "late" | "absent" | "leave";

export type AttendanceRecordOut = {
  id: number;
  employee_id: string;
  date: string;
  status: string;
  note?: string | null;
  overtime_minutes?: number | null;
  overtime_rate?: number | null;
  late_minutes?: number | null;
  late_deduction?: number | null;
  leave_type?: string | null;
  fine_amount?: number | null;
  created_at: string;
  updated_at?: string | null;
};

export type AttendanceListResponse = {
  date: string;
  records: AttendanceRecordOut[];
};

export type AttendanceUpsert = {
  employee_id: string;
  status: string;
  note?: string | null;
  overtime_minutes?: number | null;
  overtime_rate?: number | null;
  late_minutes?: number | null;
  late_deduction?: number | null;
  leave_type?: string | null;
  fine_amount?: number | null;
};

export type AttendanceBulkUpsert = {
  date: string;
  records: AttendanceUpsert[];
};

export type AttendanceRow = {
  employee_id: string;
  serial_no?: string | null;
  name: string;
  rank?: string | null;
  emp_status?: string | null;
  unit?: string | null;
  department?: string | null;
  shift_type?: string | null;
  status: AttendanceStatus;
  leave_type?: "paid" | "unpaid" | "";
  overtime_hours?: number;
  overtime_rate?: number;
  late_hours?: number;
  late_deduction?: number;
  fine_amount?: number;
  note?: string;
};

export type LeaveType = "paid" | "unpaid";

export type LeavePeriodCreate = {
  employee_id: string;
  from_date: string;
  to_date: string;
  leave_type: LeaveType;
  reason?: string | null;
};

export type LeavePeriodOut = {
  id: number;
  employee_id: string;
  from_date: string;
  to_date: string;
  leave_type: LeaveType;
  reason?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type LeavePeriodAlert = {
  leave_period_id: number;
  employee_id: string;
  from_date: string;
  to_date: string;
  leave_type: LeaveType;
  reason?: string | null;
  last_day: string;
  message: string;
};

export type PayrollEmployeeRow = {
  employee_db_id: number;
  employee_id: string;
  name: string;
  department: string;
  shift_type: string;

  serial_no?: string | null;
  fss_no?: string | null;
  eobi_no?: string | null;

  base_salary: number;
  allowances: number;

  working_days?: number;
  day_rate?: number;
  payable_days?: number;
  basic_earned?: number;

  pre_days?: number;
  cur_days?: number;
  leave_encashment_days?: number;

  total_days?: number;
  total_salary?: number;

  present_days: number;
  late_days: number;
  absent_days: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  unmarked_days?: number;

  overtime_minutes: number;
  overtime_pay: number;

  overtime_rate?: number;

  late_minutes: number;
  late_deduction: number;

  late_rate?: number;

  fine_deduction?: number;

  allow_other?: number;
  eobi?: number;
  tax?: number;
  fine_adv_extra?: number;
  fine_adv?: number;
  remarks?: string | null;
  bank_cash?: string | null;

  bank_name?: string | null;
  account_number?: string | null;

  unpaid_leave_deduction: number;

  advance_deduction: number;

  gross_pay: number;
  net_pay: number;

  paid_status: string;
};

export type EmployeeAdvance = {
  id: number;
  employee_db_id: number;
  amount: number;
  note?: string | null;
  advance_date: string;
  created_at: string;
};

export type EmployeeAdvanceCreate = {
  employee_db_id: number;
  amount: number;
  note?: string | null;
  advance_date: string;
};

export type EmployeeAdvanceDeduction = {
  id: number;
  employee_db_id: number;
  month: string;
  amount: number;
  note?: string | null;
  created_at: string;
};

export type EmployeeAdvanceDeductionUpsert = {
  employee_db_id: number;
  month: string;
  amount: number;
  note?: string | null;
};

export type EmployeeAdvanceSummary = {
  employee_db_id: number;
  total_advanced: number;
  total_deducted: number;
  balance: number;
  total_paid_so_far: number;
};

export type EmployeeAdvancesMonthSummary = {
  month: string;
  total_advanced: number;
  by_employee_db_id: Record<number, number>;
};

export type EmployeeAdvanceMonthRow = {
  id: number;
  employee_db_id: number;
  employee_id: string;
  employee_name: string;
  amount: number;
  note?: string | null;
  advance_date: string;
  created_at: string;
};

export type PayrollSummary = {
  month: string;
  employees: number;
  total_gross: number;
  total_net: number;
};

export type PayrollReportResponse = {
  month: string;
  summary: PayrollSummary;
  rows: PayrollEmployeeRow[];
};

export type PayrollPaidStatus = "paid" | "unpaid";

export type PayrollUiRow = PayrollEmployeeRow & {
  absent_deduction_calc: number;
  unpaid_leave_deduction_calc: number;
  gross_calc: number;
  net_calc: number;
  paid_status: PayrollPaidStatus;
};

export type PayrollSheetEntryUpsert = {
  employee_db_id: number;
  from_date: string;
  to_date: string;

  pre_days_override?: number | null;
  cur_days_override?: number | null;
  leave_encashment_days?: number;

  allow_other?: number;
  eobi?: number;
  tax?: number;
  fine_adv_extra?: number;

  remarks?: string | null;
  bank_cash?: string | null;
};

export type PayrollSheetEntryBulkUpsert = {
  from_date: string;
  to_date: string;
  entries: PayrollSheetEntryUpsert[];
};

export type PayrollSheetEntryOut = PayrollSheetEntryUpsert & {
  id: number;
  created_at: string;
  updated_at?: string | null;
};

export type RestrictedItem = {
  id: number;
  item_code: string;
  category: string;
  name: string;
  description?: string | null;

  is_serial_tracked: boolean;
  unit_name: string;

  quantity_on_hand: number;
  min_quantity?: number | null;

  serial_total?: number | null;
  serial_in_stock?: number | null;

  make_model?: string | null;
  caliber?: string | null;

  storage_location?: string | null;

  requires_maintenance: boolean;
  requires_cleaning: boolean;

  status: string;
  created_at: string;
  updated_at?: string | null;
};

export type RestrictedItemCreate = {
  item_code: string;
  category: string;
  name: string;
  description?: string | null;

  is_serial_tracked: boolean;
  unit_name: string;

  quantity_on_hand: number;
  min_quantity?: number | null;

  make_model?: string | null;
  caliber?: string | null;

  storage_location?: string | null;

  requires_maintenance: boolean;
  requires_cleaning: boolean;

  status: string;
};

export type RestrictedItemImage = {
  id: number;
  item_code: string;
  filename: string;
  url: string;
  mime_type: string;
  created_at: string;
  updated_at?: string | null;
};

export type RestrictedSerialUnit = {
  id: number;
  item_code: string;
  serial_number: string;
  status: string;
  issued_to_employee_id?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export type RestrictedTransaction = {
  id: number;
  item_code: string;
  employee_id?: string | null;
  serial_unit_id?: number | null;
  action: string;
  quantity?: number | null;
  condition_note?: string | null;
  notes?: string | null;
  created_at: string;
};
