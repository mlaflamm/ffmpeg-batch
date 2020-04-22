import util from 'util';
import child_process from 'child_process';

import get from 'lodash/get';

const exec = util.promisify(child_process.exec);

export type VideoStreamInfo = Partial<{
  codec_name: string; // "h264"
  width: number; //  480,
  height: number; // 270,
  display_aspect_ratio: string; //"16:9",
  duration: string; //"30.033333",
  bit_rate: string; //"37798"
}>;

export const extractVideoInfo = async (filePath: string): Promise<VideoStreamInfo> => {
  const command = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration,bit_rate,codec_name,display_aspect_ratio -of json "${filePath}"`;
  return exec(command).then(({ stdout }) => get(JSON.parse(stdout), 'streams.0'));
};
