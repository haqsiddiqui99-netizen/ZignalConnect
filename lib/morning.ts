import { reportError } from "@/lib/alerts";
import { runMorningReminders } from "@/lib/renewals";

const globalForJob = globalThis as { morningJob?: boolean };

const HOUR = 60 * 60 * 1000;

export function startMorningJob() {
  if (globalForJob.morningJob) return;
  globalForJob.morningJob = true;
  const tick = () => {
    void runMorningReminders()
      .then((result) => {
        // A failed reminder is tried again every hour, so one mail per six hours is enough to know about it.
        if (result.failed > 0) {
          return reportError("renewal reminders", new Error(`${result.failed} reminder email(s) could not be sent`), {
            cooldownMinutes: 6 * 60,
            detail: `${result.emailed} sent, ${result.failed} failed this run. Check the mail account and the Resend dashboard.`,
          });
        }
      })
      .catch((error) => reportError("renewal reminders job", error, { cooldownMinutes: 6 * 60 }));
  };
  tick();
  setInterval(tick, HOUR);
}
