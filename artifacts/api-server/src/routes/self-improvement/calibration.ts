import { Router, type IRouter } from "express";
import { db, calibrationCheckpointsTable, botsTable } from "@workspace/db";
import { eq, desc, gte, and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/self-improvement/calibration/checkpoints", async (req, res): Promise<void> => {
  const botId = req.query.botId ? parseInt(req.query.botId as string) : undefined;
  const since = req.query.since
    ? new Date(req.query.since as string)
    : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const conditions = [gte(calibrationCheckpointsTable.periodEnd, since)];
  if (botId) conditions.push(eq(calibrationCheckpointsTable.botId, botId));

  const checkpoints = await db
    .select({
      id: calibrationCheckpointsTable.id,
      botId: calibrationCheckpointsTable.botId,
      botName: botsTable.name,
      periodEnd: calibrationCheckpointsTable.periodEnd,
      predictedAvg: calibrationCheckpointsTable.predictedAvg,
      actualAvg: calibrationCheckpointsTable.actualAvg,
      calibrationError: calibrationCheckpointsTable.calibrationError,
      temperatureScaleFactor: calibrationCheckpointsTable.temperatureScaleFactor,
      sampleSize: calibrationCheckpointsTable.sampleSize,
      reliabilityCurve: calibrationCheckpointsTable.reliabilityCurve,
      createdAt: calibrationCheckpointsTable.createdAt,
    })
    .from(calibrationCheckpointsTable)
    .leftJoin(botsTable, eq(calibrationCheckpointsTable.botId, botsTable.id))
    .where(and(...conditions))
    .orderBy(desc(calibrationCheckpointsTable.periodEnd))
    .limit(200);

  res.json(checkpoints);
});

router.get("/self-improvement/calibration/summary", async (req, res): Promise<void> => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const checkpoints = await db
    .select()
    .from(calibrationCheckpointsTable)
    .where(gte(calibrationCheckpointsTable.periodEnd, since))
    .orderBy(desc(calibrationCheckpointsTable.periodEnd))
    .limit(500);

  if (checkpoints.length === 0) {
    res.json({ totalBots: 0, avgCalibrationError: 0, avgTemperatureFactor: 1, checkpoints: [] });
    return;
  }

  const byBot: Record<number, typeof checkpoints> = {};
  for (const c of checkpoints) {
    if (!byBot[c.botId]) byBot[c.botId] = [];
    byBot[c.botId].push(c);
  }

  const botSummaries = Object.entries(byBot).map(([botId, cps]) => {
    const latest = cps[0];
    const errorTrend = cps.map((c) => ({
      date: c.periodEnd,
      error: c.calibrationError,
      temp: c.temperatureScaleFactor,
    }));
    return {
      botId: parseInt(botId),
      latestCalibrationError: latest.calibrationError,
      latestTemperatureFactor: latest.temperatureScaleFactor,
      sampleSize: latest.sampleSize,
      predictedAvg: latest.predictedAvg,
      actualAvg: latest.actualAvg,
      reliabilityCurve: latest.reliabilityCurve,
      errorTrend,
    };
  });

  const avgCalibrationError =
    botSummaries.reduce((s, b) => s + b.latestCalibrationError, 0) / botSummaries.length;
  const avgTemperatureFactor =
    botSummaries.reduce((s, b) => s + b.latestTemperatureFactor, 0) / botSummaries.length;

  res.json({
    totalBots: botSummaries.length,
    avgCalibrationError: parseFloat(avgCalibrationError.toFixed(4)),
    avgTemperatureFactor: parseFloat(avgTemperatureFactor.toFixed(3)),
    botSummaries,
  });
});

export default router;
