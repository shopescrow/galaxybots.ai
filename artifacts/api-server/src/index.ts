import app from "./app";
import { startScheduler } from "./services/scheduler";
import { backfillExistingBotPermissions } from "./services/governance";
import { startWebhookDeliveryWorker } from "./services/webhook-delivery";
import { getAllTools } from "./tools";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);
  await startScheduler();
  startWebhookDeliveryWorker();
  backfillExistingBotPermissions(getAllTools).catch((err) => {
    console.error("[governance] Permission backfill failed:", err);
  });
});
