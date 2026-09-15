import { BadRequestException } from '@nestjs/common';

const PAGE_SIZE = 1000;

export async function fetchAllPages<T>(
  run: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await run(from, from + PAGE_SIZE - 1);
    if (error) {
      throw new BadRequestException(error.message);
    }

    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) {
      return rows;
    }

    from += PAGE_SIZE;
  }
}
