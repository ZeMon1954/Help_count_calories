import assert from 'node:assert/strict';
import test from 'node:test';

import { durationParts, parseRunInputs } from '../utils/run-import';

const inputs = { distanceKm: '5.12', hours: '0', minutes: '30', seconds: '5' };

test('parses distance and h:m:s into metres and seconds', () => {
  const parsed = parseRunInputs(inputs);
  assert.equal(parsed.error, null);
  assert.equal(parsed.distanceM, 5_120);
  assert.equal(parsed.durationSeconds, 1_805);
  assert.equal(parseRunInputs({ ...inputs, distanceKm: '5,12' }).distanceM, 5_120);
  assert.deepEqual(durationParts(3_725), {
    hours: '1',
    minutes: '2',
    seconds: '5',
  });
});

test('rejects values the API would reject', () => {
  assert.equal(parseRunInputs({ ...inputs, distanceKm: '' }).error, 'distance');
  assert.equal(parseRunInputs({ ...inputs, distanceKm: 'abc' }).error, 'distance');
  assert.equal(
    parseRunInputs({ ...inputs, minutes: '0', seconds: '10' }).error,
    'duration',
  );
  assert.equal(parseRunInputs({ ...inputs, seconds: '1.5' }).error, 'duration');
  assert.equal(
    parseRunInputs({ ...inputs, distanceKm: '50', minutes: '10' }).error,
    'speed',
  );
});
