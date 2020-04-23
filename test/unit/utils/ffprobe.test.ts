import { assert } from 'chai';
import * as nodeAssert from 'assert';

import { extractVideoInfo } from '../../../src/libs/utils/ffprobe';
import { getSampleVideoFile } from '../../fixtures';

describe('ffprobe', () => {
  it('should extract video info - mp4', async () => {
    const expected = {
      bit_rate: '301201',
      codec_name: 'h264',
      display_aspect_ratio: '16:9',
      duration: '30.033333',
      height: 270,
      width: 480,
    };

    const sampleFile = await getSampleVideoFile('mp4');
    const actual = await extractVideoInfo(sampleFile);
    assert.deepEqual(actual, expected);
  });

  it('should extract video info - wmv', async () => {
    const expected = {
      codec_name: 'wmv2',
      display_aspect_ratio: '16:9',
      duration: '30.550000',
      height: 270,
      width: 480,
    };

    const sampleFile = await getSampleVideoFile('wmv');
    const actual = await extractVideoInfo(sampleFile);
    assert.deepEqual(actual, expected);
  });

  it('should extract video info - mov', async () => {
    const expected = {
      bit_rate: '37717',
      codec_name: 'h264',
      display_aspect_ratio: '16:9',
      duration: '30.033984',
      height: 270,
      width: 480,
    };

    const sampleFile = await getSampleVideoFile('mov');
    const actual = await extractVideoInfo(sampleFile);
    assert.deepEqual(actual, expected);
  });

  it('should fail when file does not exists', async () => {
    nodeAssert.rejects(() => extractVideoInfo('unknown.mp4'));
  });
});
