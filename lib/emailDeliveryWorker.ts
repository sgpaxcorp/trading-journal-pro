import "server-only";

import { claimEmailDeliveryJobs, updateEmailDeliveryJob } from "@/lib/emailDeliveryJobs";
import { processWaitlistLaunchChannelJob } from "@/lib/waitlistLaunchDelivery";

export async function processEmailDeliveryBatch(limit = 20) {
  const jobs = await claimEmailDeliveryJobs(limit);
  const summary = { claimed: jobs.length, succeeded: 0, retried: 0, failed: 0 };

  for (const job of jobs as any[]) {
    try {
      let result: unknown;
      if (job.kind === "waitlist_launch_channel") {
        result = await processWaitlistLaunchChannelJob(job.payload);
      } else {
        throw new Error(`Unsupported email delivery job type: ${job.kind}`);
      }
      await updateEmailDeliveryJob({ id: String(job.id), status: "succeeded", result });
      summary.succeeded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : "Delivery failed.";
      const attempts = Number(job.attempts ?? 1);
      const maxAttempts = Number(job.max_attempts ?? 4);
      if (attempts < maxAttempts) {
        const delaySeconds = Math.min(600, 20 * 2 ** Math.max(0, attempts - 1));
        await updateEmailDeliveryJob({
          id: String(job.id),
          status: "queued",
          error: message,
          runAfter: new Date(Date.now() + delaySeconds * 1000).toISOString(),
        });
        summary.retried += 1;
      } else {
        await updateEmailDeliveryJob({ id: String(job.id), status: "failed", error: message });
        summary.failed += 1;
      }
    }
  }
  return summary;
}

