import {
  editHistorySchemaMiss,
  omitEditHistory,
  writeKeepingEnteredValues,
} from './edit-history';

describe('writeKeepingEnteredValues', () => {
  it('recognises a missing edit_history column', () => {
    expect(
      editHistorySchemaMiss(
        "Could not find the 'edit_history' column of 'farms' in the schema cache",
      ),
    ).toBe(true);
    expect(editHistorySchemaMiss('mobile number already used')).toBe(false);
  });

  it('saves the entered values when the history column is hidden', async () => {
    const patch = {
      farmer_name: 'Mukesh kurmi',
      owned_land_size: 2.5,
      village: 'Mokla',
      edit_history: [{ at: '2026-11-11T00:00:00.000Z', by: 'user', previous: {} }],
    };
    const writes: Record<string, unknown>[] = [];
    const result = await writeKeepingEnteredValues(patch, async (body) => {
      writes.push(body);
      if ('edit_history' in body) {
        return {
          data: null,
          error: {
            message:
              "Could not find the 'edit_history' column of 'farms' in the schema cache",
          },
        };
      }
      return { data: { id: 'farm-1', ...body }, error: null };
    });

    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(omitEditHistory(patch));
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      farmer_name: 'Mukesh kurmi',
      owned_land_size: 2.5,
      village: 'Mokla',
    });
    expect(result.data).not.toHaveProperty('edit_history');
  });

  it('does not retry a different database error', async () => {
    let calls = 0;
    const result = await writeKeepingEnteredValues(
      { farmer_name: 'Mukesh kurmi', edit_history: [] },
      async () => {
        calls += 1;
        return { data: null, error: { message: 'mobile number already used' } };
      },
    );
    expect(calls).toBe(1);
    expect(result.error?.message).toBe('mobile number already used');
  });
});
