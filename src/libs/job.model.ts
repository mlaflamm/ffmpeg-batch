import * as zod from 'myzod';

// I want a string with only a list of possible values without using enum or predicate
// I want to override one field in the schema to make it optional or required

export const JobInputSchema = zod.object({
  inputFilePath: zod.string(),
  outFilePath: zod.string().optional(),
  scriptName: zod.string().predicate(v => ['resize.sh', 'scale.sh', 'test.sh'].includes(v)),
});

export type JobInput = zod.Infer<typeof JobInputSchema>;
export type JobData = JobInput & { outFilePath: string };
export type Job = JobData & { jobId: string };
