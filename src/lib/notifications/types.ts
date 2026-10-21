export interface Notification {
  id: string;
  issueId: string;
  shortId: string;
  title: string;
  level: string;
  projectName: string;
  projectSlug: string;
  count: string;
  lastSeen: string;
  firstSeen: string;
  isNew: boolean;
}

export interface NotificationsResponse {
  notifications: Notification[];
  serverTime: string;
}
