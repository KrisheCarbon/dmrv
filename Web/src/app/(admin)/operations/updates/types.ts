export type UpdateAudience = "all" | "role" | "user";

export interface UpdateMessage {
  id: string;
  title: string;
  body: string;
  created_at: string;
  read: boolean;
  author_name: string | null;
}

export interface UpdateInbox {
  messages: UpdateMessage[];
  unread_count: number;
}

export interface SentUpdate {
  id: string;
  title: string;
  body: string;
  audience: UpdateAudience;
  audience_label: string;
  created_at: string;
  author_name: string | null;
}

export interface UpdateRecipient {
  id: string;
  full_name: string;
  role: string;
  email: string | null;
  phone: string | null;
}
