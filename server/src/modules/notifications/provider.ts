export type OutgoingMessage = {
  to: string;
  name?: string | null;
  subject: string;
  body: string;
};

export type SendResult = {
  ok: boolean;
  error?: string;
  skipped?: string;
};

export interface NotificationProvider {
  readonly name: 'console' | 'smtp';
  /** Whether this provider can deliver a message of the given channel target (email address). */
  canDeliver(to: string | null | undefined): boolean;
  send(message: OutgoingMessage): Promise<SendResult>;
}

export const greeting = (name: string | null | undefined, fallback = 'there'): string =>
  name?.trim() ? name.trim().split(' ')[0]! : fallback;
