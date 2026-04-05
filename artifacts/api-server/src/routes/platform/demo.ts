import { Router, type IRouter } from "express";
import { z } from "zod";
import nodemailer from "nodemailer";

const router: IRouter = Router();

const bookDemoSchema = z.object({
  name: z.string().min(1, "Name is required"),
  company: z.string().min(1, "Company is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional().default(""),
  message: z.string().optional().default(""),
});

router.post("/demo/book", async (req, res): Promise<void> => {
  const parsed = bookDemoSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message || "Invalid request" });
    return;
  }

  const { name, company, email, phone, message } = parsed.data;

  const adminEmail = process.env.ADMIN_EMAIL;
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpFrom = process.env.SMTP_FROM;

  if (!adminEmail || !smtpHost || !smtpUser || !smtpPass) {
    console.error("[Demo] Missing ADMIN_EMAIL or SMTP configuration — cannot process demo booking");
    res.status(500).json({ error: "Demo booking is not configured. Please contact us directly." });
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(smtpPort) || 587,
      secure: Number(smtpPort) === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    const body = [
      "New Demo Request",
      "=================",
      `Name:    ${name}`,
      `Company: ${company}`,
      `Email:   ${email}`,
      `Phone:   ${phone || "(not provided)"}`,
      "",
      "Message / Use Case:",
      message || "(not provided)",
    ].join("\n");

    await transporter.sendMail({
      from: smtpFrom || smtpUser,
      to: adminEmail,
      subject: `Demo Request from ${name} at ${company}`,
      text: body,
    });
  } catch (err) {
    console.error("[Demo] Failed to send booking email");
    res.status(500).json({ error: "Failed to send your request. Please try again later." });
    return;
  }

  res.status(200).json({ success: true });
});

export default router;
