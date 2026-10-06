import { runMorningReminders } from "@/lib/renewals";

const globalForJob = globalThis as { morningJob?: boolean };

const HOUR = 60 * 60 * 1000;

export function startMorningJob() {
  if (globalForJob.morningJob) return;
  globalForJob.morningJob = true;
  const tick = () => {
    void runMorningReminders().catch(() => undefined);
  };
  tick();
  setInterval(tick, HOUR);
}
