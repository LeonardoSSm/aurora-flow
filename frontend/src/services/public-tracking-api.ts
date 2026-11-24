import axios from 'axios';

const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';
const appBaseUrl = import.meta.env.VITE_APP_URL ?? 'http://localhost:5173';

const publicApi = axios.create({ baseURL: apiBaseUrl });

export type TrackingTimelineEvent = {
  eventType: string;
  label: string;
  createdAt: string;
};

export type TrackingAttachment = {
  id: string;
  originalName: string;
  sizeBytes: number;
  createdAt: string;
};

export type TrackingSolicitation = {
  number: string;
  title: string;
  status: string;
  statusLabel: string;
  priority: string;
  currentStage: string | null;
  slaStatus: string | null;
  slaDueAt: string | null;
  formName: string;
  createdAt: string;
  updatedAt: string;
  timeline: TrackingTimelineEvent[];
  attachments: TrackingAttachment[];
};

export type TrackingComment = {
  id: string;
  content: string;
  authorType: 'requester' | 'team';
  authorName: string | null;
  createdAt: string;
  proposalStatus?: 'pending' | 'approved' | 'rejected' | null;
  proposalDecidedAt?: string | null;
  proposalRejectionReason?: string | null;
};

export type AddPublicCommentInput = {
  content: string;
  authorName?: string;
  authorEmail?: string;
};

export type DecideProposalInput = {
  decision: 'approved' | 'rejected';
  comment?: string;
};

export async function fetchPublicComments(token: string): Promise<TrackingComment[]> {
  const { data } = await publicApi.get<TrackingComment[]>(
    `/public/solicitations/track/${token}/comments`,
  );
  return data;
}

export async function addPublicComment(
  token: string,
  dto: AddPublicCommentInput,
): Promise<TrackingComment> {
  const { data } = await publicApi.post<TrackingComment>(
    `/public/solicitations/track/${token}/comments`,
    dto,
  );
  return data;
}

export async function decideProposal(
  token: string,
  commentId: string,
  dto: DecideProposalInput,
): Promise<TrackingComment> {
  const { data } = await publicApi.post<TrackingComment>(
    `/public/solicitations/track/${token}/comments/${commentId}/decide`,
    dto,
  );
  return data;
}

export async function fetchTrackingSolicitation(token: string): Promise<TrackingSolicitation> {
  const { data } = await publicApi.get<TrackingSolicitation>(
    `/public/solicitations/track/${token}`,
  );
  return data;
}

export function getPublicDownloadUrl(token: string, attachmentId: string): string {
  return `${apiBaseUrl}/public/solicitations/track/${token}/attachments/${attachmentId}/download`;
}

export function getTrackingUrl(trackingToken: string): string {
  return `${appBaseUrl}/acompanhar/${trackingToken}`;
}
