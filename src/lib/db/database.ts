export type ProfileRow = {
  id: string;
  name: string;
  startup_name: string;
  startup_description: string;
  industries: string[];
  stage: string;
  preferred_location: string;
  preferred_event_types: string[];
  created_at: string;
  updated_at: string;
};

export type EventRow = {
  id: string;
  title: string;
  description: string | null;
  organizer: string | null;
  category: string | null;
  industry_tags: string[];
  event_type: string;
  event_date: string | null;
  registration_deadline: string | null;
  location: string | null;
  source_name: string;
  source_url: string;
  first_seen_at: string;
  last_checked_at: string;
  is_mock: boolean;
};

export type EvaluationRow = {
  id: number;
  profile_id: string;
  event_id: string;
  relevance_score: number;
  explanation: string;
  provider: string;
  is_newly_discovered: boolean;
  evaluated_at: string;
};

export type SavedEventRow = {
  profile_id: string;
  event_id: string;
  saved_at: string;
};

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: Table<
        ProfileRow,
        {
          id: string;
          name: string;
          startup_name: string;
          startup_description?: string;
          industries: string[];
          stage: string;
          preferred_location: string;
          preferred_event_types?: string[];
          created_at?: string;
          updated_at?: string;
        },
        Partial<ProfileRow>
      >;
      events: Table<
        EventRow,
        {
          id?: string;
          title: string;
          description?: string | null;
          organizer?: string | null;
          category?: string | null;
          industry_tags?: string[];
          event_type: string;
          event_date?: string | null;
          registration_deadline?: string | null;
          location?: string | null;
          source_name: string;
          source_url: string;
          first_seen_at?: string;
          last_checked_at?: string;
          is_mock?: boolean;
        },
        Partial<EventRow>
      >;
      relevance_evaluations: Table<
        EvaluationRow,
        {
          id?: number;
          profile_id: string;
          event_id: string;
          relevance_score: number;
          explanation: string;
          provider: string;
          is_newly_discovered?: boolean;
          evaluated_at?: string;
        },
        Partial<EvaluationRow>
      >;
      saved_events: Table<
        SavedEventRow,
        {
          profile_id: string;
          event_id: string;
          saved_at?: string;
        },
        Partial<SavedEventRow>
      >;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
