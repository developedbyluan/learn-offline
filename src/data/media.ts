export type MediaItem = {
  id: number;
  mediaId: number;
  createdAt: number;
  fileName: string;
  fileSlug: string;
  fileStatus: string;
  fileAuthor: string;
  fileAuthorUrl: string;
  fileType: string;
  fileThumbnailUrl: string;
  fileProjectId: number;
  fileFolderId: number;
  fileOrder: number;
  fileUrl: string;
  fileJsonId: number;
};

const API_BASE_URL = "https://flucom-api-bun.developedbyluan.workers.dev";

export async function fetchFavorites(userId: string): Promise<MediaItem[]> {
  const response = await fetch(
    `${API_BASE_URL}/favorites/by-user-id/${encodeURIComponent(userId)}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to load favorites (${response.status})`);
  }
  return (await response.json()) as MediaItem[];
}
