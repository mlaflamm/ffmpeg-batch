import * as zod from 'myzod';
import { VideoStreamInfo } from './utils/ffprobe';

export const JobInputSchema = zod.object({
  inputFilePath: zod.string(),
  outFilePath: zod.string().optional(),
  scriptName: zod.string().predicate(v => ['resize.sh', 'scale.sh', 'test.sh'].includes(v)),
});

export type JobInput = zod.Infer<typeof JobInputSchema>;
export type JobData = JobInput & { outFilePath: string };
export type Job = JobData & { jobId: string, inputFileInfo?: VideoStreamInfo };
export type JobResult = { startedAt: Date; durationMs: number; inputFileSize?: number; outputFileSize?: number };
export type JobDetails = Job & Partial<JobResult> & { createdAt?: Date, updatedAt?: Date };
