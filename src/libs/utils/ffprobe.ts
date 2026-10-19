import { ProcessRunner } from './process-runner.js';

export type VideoStreamInfo = Partial<{
  codec_name: string; // "h264"
  width: number; //  480,
  height: number; // 270,
  display_aspect_ratio: string; //"16:9",
  duration: string; //"30.033333",
  bit_rate: string; //"37798"
}>;

export const extractVideoInfo = async (filePath: string, runner = new ProcessRunner()): Promise<VideoStreamInfo> => {
  const stdout = await runner.run('ffprobe', [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height,duration,bit_rate,codec_name,display_aspect_ratio',
    '-of',
    'json',
    filePath,
  ]);
  return JSON.parse(stdout).streams?.[0];
};
