export type PriorityCategory =
  | "Senior Citizen"
  | "Disabled"
  | "Widow"
  | "Medical Emergency"
  | "Large Family"
  | "General";

export type RoomStatus = "Available" | "Allocated" | "Reserved";
export type LocationStatus = "Not Set" | "Located" | "Manual" | "Failed";

export interface Building {
  id: number;
  building_name: string;
  society_name: string;
  redevelopment_project_name: string;
  full_address: string;
  city: string;
  district: string;
  state: string;
  pin_code: string;
  number_of_wings: number;
  description: string;
  status: "Setup" | "Active" | "Lottery Completed" | "Archived";
  resident_count?: number;
  room_count?: number;
  allocation_count?: number;
  lottery_locked?: boolean;
  lottery_completed_at?: string | null;
  latitude: number | null;
  longitude: number | null;
  map_zoom: number;
  location_status: LocationStatus;
  location_updated_at?: string | null;
  google_place_id?: string | null;
}

export type BuildingInput = Omit<Building, "id" | "status" | "resident_count" | "room_count" | "allocation_count" | "lottery_locked" | "lottery_completed_at" | "location_updated_at">;

export interface Society {
  id: number;
  name: string;
  address: string;
  redevelopment_project_name: string;
}

export interface DashboardStats {
  building?: Building;
  society: Society | null;
  total_residents: number;
  verified_residents: number;
  total_rooms: number;
  available_rooms: number;
  allocated_rooms: number;
  transparency_score: number;
  pending_verification: number;
  fairness_status: string;
  lottery_locked: boolean;
  lottery_seed: string | null;
  lottery_completed_at: string | null;
  issues: {
    aadhaar_duplicates: unknown[];
    old_room_duplicates: unknown[];
    invalid_priority: unknown[];
    suspicious: unknown[];
  };
}

export interface DemoResetResponse {
  message: string;
  society: Society;
  residents_seeded: number;
  rooms_seeded: number;
  lottery_locked: boolean;
}

export interface Resident {
  building_id: number;
  id: number;
  full_name: string;
  aadhaar_masked: string;
  old_room_number: string;
  family_members: number;
  contact_number: string;
  priority_category: PriorityCategory;
  building_wing: string;
  document_name: string | null;
  consent: number;
  verification_status: string;
  created_at: string;
}

export interface Room {
  building_id: number;
  id: number;
  room_number: string;
  wing: string;
  floor: number;
  size: string;
  status: RoomStatus;
  suitable_for: string;
}

export interface Allocation {
  building_id: number;
  resident_id: number;
  room_id: number;
  id: number;
  full_name: string;
  aadhaar_masked: string;
  old_room_number: string;
  priority_category: PriorityCategory;
  new_room_number: string;
  wing: string;
  floor: number;
  size: string;
  allocation_reason: string;
  lottery_seed: string;
  fairness_score: number;
  created_at: string;
}

export interface AuditLog {
  building_id: number | null;
  id: number;
  action: string;
  performed_by: string;
  details: string;
  reason: string | null;
  timestamp: string;
}

export interface TransparencyReport {
  building?: Building;
  building_id?: number;
  society: Society | null;
  totals: {
    total_residents: number;
    total_rooms: number;
    total_allocated: number;
    remaining_rooms: number;
    fairness_score: number;
  };
  lottery_rules: string[];
  lottery_seed: string;
  lottery_completed_at: string | null;
  lottery_mode?: string | null;
  draw_outcomes?: {winners:number;not_selected:number;waiting_list:number} | null;
  eligibility: {rule_set_name:string|null;rule_version:number|null;rules:Array<{name:string;category:string;field:string;operator:string;value:string|null;points:number}>;eligible_count:number|null;ineligible_count:number|null;ineligibility_reasons:Record<string,number>;methodology:string};
  allocations: Allocation[];
  ai_explanation_summary: string;
  audit_log_summary: Array<{
    action: string;
    performed_by: string;
    details: string;
    reason: string | null;
    timestamp: string;
  }>;
}

export interface ResidentSearchResult {
  building_name: string;
  society_name: string;
  redevelopment_project_name: string;
  full_name: string;
  aadhaar_masked: string;
  old_room_number: string;
  priority_category: PriorityCategory;
  verification_status: string;
  allocation_reason: string | null;
  lottery_seed: string | null;
  fairness_score: number | null;
  created_at: string | null;
  new_room_number: string | null;
  floor: number | null;
  wing: string | null;
  size: string | null;
  draw_history: Array<{draw_number:number;draw_reference:string;draw_name:string;completed_at:string;allocation_status:string;allocated_room_snapshot:string|null;ai_explanation:string|null}>;
}

export type VerificationStatus = "Pending Verification" | "Verified" | "Rejected";

export interface LotteryDraw { id:number; building_id:number; draw_number:number; draw_reference:string; draw_name:string; phase_name?:string|null; status:string; lottery_seed:string; algorithm_version:string; fairness_score:number; total_residents:number; total_verified_residents:number; total_rooms:number; total_available_rooms:number; total_allocated:number; total_unallocated:number; total_eligible?:number; total_not_eligible?:number; rule_snapshot_version?:number|null; eligibility_rule_set_id?:number|null; total_not_selected?:number; total_waiting_list?:number; lottery_mode?:"Full Allocation"|"Competitive Lottery"; waiting_list_enabled?:number; started_at:string; completed_at:string|null; performed_by_admin:string; building_name_snapshot:string; society_name_snapshot:string; project_name_snapshot:string; address_snapshot:string; rules_snapshot:string; archived_at:string|null; cancellation_reason?:string|null; created_at:string; }
export type DrawSummary = LotteryDraw;
export interface DrawAllocation { id:number; draw_id:number; building_id:number; resident_id:number; resident_name_snapshot:string; aadhaar_masked_snapshot:string; old_room_snapshot:string; family_members_snapshot:number; priority_category_snapshot:string; verification_status_snapshot:string; allocated_room_snapshot:string|null; room_wing_snapshot:string|null; room_floor_snapshot:number|null; room_size_snapshot:string|null; allocation_status:string; waiting_list_position?:number|null; allocation_reason:string; ai_explanation:string; fairness_score:number; allocated_at:string|null; }
export interface DrawDetails { draw:LotteryDraw; allocations:DrawAllocation[]; eligibility_snapshot?:{rule_set:{name:string;version:number;rules:Array<{id:number;rule_name:string;field_name:string;operator:string;comparison_value:string|null;category:string;priority_points:number;is_active:number}>}|null;summary:{total_registered:number;total_eligible:number;total_ineligible:number};fallback:string|null}|null; }
export interface ResidentHistoryEvent { id:number; building_id:number; resident_id:number; draw_id:number|null; event_type:string; title:string; description:string; previous_value:string|null; new_value:string|null; performed_by:string; created_at:string; }
export interface ResidentHistorySummary extends Resident { latest_allocated_room:string|null; latest_draw_reference:string|null; latest_draw_date:string|null; draws_participated:number; }
export interface ResidentHistoryDetails { resident:Resident; building:Building; events:ResidentHistoryEvent[]; draws:Array<DrawAllocation & {draw_number:number;draw_reference:string;completed_at:string;lottery_seed:string}>; eligibility_history?:Array<{draw_id:number;draw_reference:string;rule_version:number|null;status:string;priority_score:number;result:{explanation:string;results:Array<{rule_name:string;passed:boolean;points_awarded:number}>}}>; }
export interface CycleResident { id:number; resident_id:number; full_name:string; old_room_snapshot:string; priority_snapshot:string; verification_status:string; eligibility_status:string; inclusion_reason:string|null; exclusion_reason:string|null; previous_draw_id:number|null; }
export interface CycleRoom { id:number; room_id:number; room_number_snapshot:string; wing_snapshot:string; floor_snapshot:number; size_snapshot:string; current_status:string; eligibility_status:string; inclusion_reason:string|null; exclusion_reason:string|null; }
export interface DrawCycleDetails { cycle:LotteryDraw; residents:CycleResident[]; rooms:CycleRoom[]; totals:{eligible_residents:number;included_residents:number;eligible_rooms:number;included_rooms:number;expected_winners:number;expected_non_winners:number}; }
