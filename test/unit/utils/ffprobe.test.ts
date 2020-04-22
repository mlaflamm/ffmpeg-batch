import fs from 'fs';
import path from 'path';
import request from 'supertest';

import { assert } from 'chai';
import * as nodeAssert from 'assert';

import { extractVideoInfo } from '../../../src/libs/utils/ffprobe';

const downloadSampleVideoIfRequired = async (outputFile: string, remoteUrl: string) => {
  return fs.promises.access(outputFile, fs.constants.F_OK).catch(() => {
    // File doesn't exist, download it
    const url = new URL(remoteUrl);
    return new Promise((resolve, reject) => {
      const stream = fs.createWriteStream(outputFile);
      stream
        .once('finish', () => {
          stream.close();
          resolve();
        })
        .once('error', err => {
          stream.close();
          reject(err);
        });
      request(url.origin)
        .get(url.pathname + '?' + url.search)
        .pipe(stream);
    });
  });
};

describe('ffprobe', () => {
  const sampleMp4File = path.join('.temp', 'video_sample.mp4');
  const sampleWmvFile = path.join('.temp', 'video_sample.wmv');
  const sampleMovFile = path.join('.temp', 'video_sample.mov');

  before(async () => {
    await fs.promises.mkdir('.temp', { recursive: true });

    await Promise.all([
      downloadSampleVideoIfRequired(
        sampleMp4File,
        'https://file-examples.com/wp-content/uploads/2017/04/file_example_MP4_480_1_5MG.mp4'
      ),
      downloadSampleVideoIfRequired(
        sampleWmvFile,
        'https://file-examples.com/wp-content/uploads/2018/04/file_example_WMV_480_1_2MB.wmv'
      ),
      downloadSampleVideoIfRequired(
        sampleMovFile,
        'https://file-examples.com/wp-content/uploads/2018/04/file_example_MOV_480_700kB.mov'
      ),
    ]);
  });

  it('should extract video info - mp4', async () => {
    const expected = {
      bit_rate: '301201',
      codec_name: 'h264',
      display_aspect_ratio: '16:9',
      duration: '30.033333',
      height: 270,
      width: 480,
    };

    const actual = await extractVideoInfo(sampleMp4File);
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

    const actual = await extractVideoInfo(sampleWmvFile);
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

    const actual = await extractVideoInfo(sampleMovFile);
    assert.deepEqual(actual, expected);
  });

  it('should fail when file does not exists', async () => {
    nodeAssert.rejects(() => extractVideoInfo('unknown.mp4'))
  });
});
