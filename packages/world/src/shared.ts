import { z } from 'zod';

/**
 * Options for paginated queries.
 * Provides control over page size and cursor-based navigation.
 */
export interface PaginationOptions {
  /** Maximum number of items to return (default varies by service, max: 1000) */
  limit?: number;
  /** Cursor for pagination - token from previous response */
  cursor?: string;
}

// Shared schema for paginated responses
export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(
  dataSchema: T
) =>
  z.object({
    data: z.array(dataSchema),
    cursor: z.string().nullable(),
    hasMore: z.boolean(),
  });

// Inferred type from schema
export type PaginatedResponse<T> = z.infer<
  ReturnType<typeof PaginatedResponseSchema<z.ZodType<T>>>
>;
