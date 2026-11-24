import { ApiProperty } from '@nestjs/swagger';

/**
 * Generic paginated response wrapper used by all list endpoints.
 */
export class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true })
  data!: T[];

  @ApiProperty({ example: 100 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 10 })
  limit!: number;

  @ApiProperty({ example: 10 })
  totalPages!: number;

  static of<T>(data: T[], total: number, page: number, limit: number): PaginatedResponseDto<T> {
    const dto = new PaginatedResponseDto<T>();
    dto.data = data;
    dto.total = total;
    dto.page = page;
    dto.limit = limit;
    dto.totalPages = Math.ceil(total / limit);
    return dto;
  }
}
