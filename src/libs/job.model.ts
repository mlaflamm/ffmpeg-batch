import * as zod from 'myzod';
import { VideoStreamInfo } from './utils/ffprobe';

export const JobInputSchema = zod.object({
  inputFilePath: zod.string(),
  outFilePath: zod.string().optional(),
  scriptName: zod.string().valid(['resize.sh', 'scale.sh', 'scale-mp3.sh', 'test.sh']),
});

export type VideoFileInfo = VideoStreamInfo & { fileSize?: number };
export type JobInput = zod.Infer<typeof JobInputSchema>;
export type JobData = JobInput & { outFilePath: string };
export type Job = JobData & { jobId: string; inputFileInfo?: VideoFileInfo };
export type JobResult = { startedAt: Date; durationMs: number; outputFileInfo?: VideoFileInfo };
export type JobDetails = Job & Partial<JobResult> & { createdAt?: Date; updatedAt?: Date };
