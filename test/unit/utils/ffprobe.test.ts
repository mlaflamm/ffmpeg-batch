import { assert } from 'chai';
import * as nodeAssert from 'assert';

import { extractVideoInfo } from '../../../src/libs/utils/ffprobe';
import { getSampleVideoFile } from '../../fixtures';

describe('ffprobe', () => {
  for (const type of ['mp4', 'wmv', 'mov', 'av1'] as const) {
    it(`should extract video info - ${type}`, async function () {
      this.timeout(15000);
      const sampleFile = await getSampleVideoFile(type);
      const actual = await extractVideoInfo(sampleFile);
      assert.include(actual, {
        codec_name: type === 'av1' ? 'av1' : type === 'wmv' ? 'wmv2' : 'h264',
        display_aspect_ratio: '16:9',
        height: 270,
        width: 480,
      });
      assert.closeTo(Number(actual.duration), 2, 0.1);
      if (type !== 'wmv') {
        assert.isAbove(Number(actual.bit_rate), 0);
      }
    });
  }

  it('should fail when file does not exists', async () => {
    await nodeAssert.rejects(() => extractVideoInfo('unknown.mp4'));
  });
});
