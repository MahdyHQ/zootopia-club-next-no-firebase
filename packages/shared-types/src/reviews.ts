export interface PublicUserReview {
  id: string;
  personName: string;
  reviewText: string;
  photoUrl: string;
  photoWidth: number | null;
  photoHeight: number | null;
  sortOrder: number;
  createdAt: string;
  publishedAt: string | null;
}

export interface UserReview {
  id: string;
  personName: string;
  reviewText: string;
  photoStoragePath: string;
  photoMimeType: string;
  photoSizeBytes: number;
  photoWidth: number | null;
  photoHeight: number | null;
  isPublished: boolean;
  sortOrder: number;
  createdByUid: string | null;
  updatedByUid: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface AdminUserReviewsResponse {
  reviews: UserReview[];
}

export interface AdminUserReviewMutationResponse {
  review: UserReview;
  reviews: UserReview[];
}

export interface PublicUserReviewsResponse {
  reviews: PublicUserReview[];
}
