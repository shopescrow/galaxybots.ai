import type { VerticalPack } from "./types";

export const healthcarePack: VerticalPack = {
  id: "healthcare",
  name: "Healthcare & Wellness",
  industry: "Healthcare",
  icon: "🏥",
  color: "#059669",
  tagline: "AI operations for modern healthcare practices",
  description:
    "Purpose-built for medical practices, dental offices, wellness clinics, and healthcare groups. Your AI executive team understands patient acquisition costs, payer mix optimization, HIPAA boundaries, and the unique operational challenges of healthcare. Every bot respects the regulatory environment.",
  highlights: [
    "Patient acquisition and retention analytics",
    "Payer mix and reimbursement rate optimization",
    "HIPAA awareness embedded in all bot interactions",
    "Practice efficiency metrics (patients per provider, no-show rates)",
    "Telehealth and digital health strategy guidance",
  ],
  botOverlays: [
    {
      botTitle: "Chief Strategy Officer",
      overlayPrompt:
        "You are advising a healthcare or wellness business. Frame strategy around patient volume growth, payer mix optimization, service line expansion, and geographic reach. Understand the shift toward value-based care, the competitive dynamics with hospital systems and private equity roll-ups, and the regulatory landscape (state licensing, scope of practice, CON laws). Reference MGMA benchmarks for the practice's specialty.",
    },
    {
      botTitle: "Chief Financial Officer",
      overlayPrompt:
        "You are advising a healthcare or wellness business. Financial analysis should focus on revenue per visit, collections rate, payer mix (commercial vs. Medicare vs. Medicaid vs. self-pay), overhead ratio, and provider compensation models (productivity-based vs. salary). Understand RVU (Relative Value Unit) compensation, A/R aging by payer, denial rates, and the impact of fee schedule changes. Reference MGMA cost and revenue benchmarks.",
    },
    {
      botTitle: "Chief Marketing Officer",
      overlayPrompt:
        "You are advising a healthcare or wellness business. Marketing must comply with healthcare advertising regulations and avoid making unsubstantiated clinical claims. Focus on patient experience marketing, online reputation management (Healthgrades, Vitals, Google Reviews), physician referral network building, community health events, and educational content marketing. Understand patient decision-making in healthcare (referral-driven vs. self-directed care).",
    },
    {
      botTitle: "Chief Operations Officer",
      overlayPrompt:
        "You are advising a healthcare or wellness business. Operations should focus on patient throughput optimization, scheduling efficiency (minimize no-shows and maximize provider utilization), clinical workflow standardization, EHR optimization, and supply chain management for medical supplies. Understand the front desk to checkout patient journey and identify friction points that impact both patient satisfaction and revenue capture.",
    },
  ],
  scenarios: [
    {
      title: "Patient Acquisition Cost Analysis",
      category: "Lead Generation",
      difficulty: "Strategic",
      situation:
        "New patient volume has plateaued despite increased marketing spend. The practice doesn't have clear visibility into which channels are driving new patients or what the true cost per new patient is across channels.",
      actions: [
        "Calculate patient acquisition cost by marketing channel",
        "Analyze new patient source data and referral patterns",
        "Benchmark acquisition costs against specialty averages",
        "Recommend channel mix optimization to improve ROI",
      ],
      missionObjective:
        "Conduct a patient acquisition cost analysis for this healthcare practice. Calculate cost-per-new-patient across all marketing channels (Google Ads, social media, physician referrals, community events, insurance directories). Analyze conversion rates at each stage (impression → website visit → appointment request → show rate → retained patient). Benchmark against MGMA specialty averages and recommend a channel mix that reduces overall acquisition cost by 20%.",
      recommendedBots: [
        "Chief Marketing Officer",
        "Chief Financial Officer",
        "Chief Strategy Officer",
      ],
    },
    {
      title: "Payer Mix & Reimbursement Optimization",
      category: "Operations",
      difficulty: "Critical",
      situation:
        "The practice's payer mix has shifted toward lower-reimbursing payers. Medicare now represents 45% of visits (up from 30% two years ago), and average reimbursement per visit has declined 12%. The practice needs a strategy to protect margins without compromising access.",
      actions: [
        "Analyze reimbursement rates by payer and procedure code",
        "Identify undercoded procedures and revenue leakage",
        "Model the financial impact of renegotiating commercial contracts",
        "Recommend payer mix improvement strategies",
      ],
      missionObjective:
        "Conduct a payer mix and reimbursement optimization analysis for this healthcare practice. Map reimbursement rates by payer and CPT code, identify coding optimization opportunities (undercoding, missed modifiers), model the revenue impact of renegotiating the top 3 commercial contracts, and recommend a payer mix strategy that improves average reimbursement per visit by 10%+ while maintaining patient access.",
      recommendedBots: [
        "Chief Financial Officer",
        "Chief Operations Officer",
      ],
    },
    {
      title: "Practice Efficiency & Provider Productivity",
      category: "Operations",
      difficulty: "Tactical",
      situation:
        "Provider productivity varies significantly across the practice. The top provider sees 25 patients/day while others average 15. Wait times are inconsistent, and patient satisfaction scores have dipped in the last quarter.",
      actions: [
        "Benchmark provider productivity (patients/day, RVUs, revenue per visit)",
        "Map the patient journey and identify bottleneck points",
        "Design scheduling templates that optimize throughput",
        "Create a provider dashboard with key efficiency metrics",
      ],
      missionObjective:
        "Analyze practice efficiency and provider productivity for this healthcare practice. Benchmark each provider on patients/day, RVUs generated, revenue per visit, and patient satisfaction scores. Map the complete patient journey (arrival → intake → exam → checkout → follow-up) and identify bottleneck points. Design optimized scheduling templates and recommend workflow changes to bring all providers within 15% of top-performer productivity.",
      recommendedBots: [
        "Chief Operations Officer",
        "Chief Strategy Officer",
      ],
    },
  ],
  pipelines: [
    {
      name: "Monthly Practice Performance Review",
      triggerType: "manual",
      steps: [
        {
          botTitle: "Chief Financial Officer",
          instruction:
            "Generate the monthly practice financial report: total collections, revenue per visit by payer, A/R aging summary, denial rate, and overhead ratio. Compare to prior month and same month last year. Flag any payer with denial rate above 5% or A/R above 60 days.",
        },
        {
          botTitle: "Chief Operations Officer",
          instruction:
            "Based on financial data, analyze operational performance: provider productivity (patients/day), no-show rate, average wait time, and scheduling utilization. Recommend 2-3 operational improvements for the coming month.",
        },
        {
          botTitle: "Chief Strategy Officer",
          instruction:
            "Synthesize financial and operational data into a practice leadership brief. Identify top strategic priorities, any competitive threats from new market entrants, and growth opportunities (new services, extended hours, satellite locations).",
        },
      ],
    },
  ],
  kbDocuments: [
    {
      title: "Healthcare Practice Metrics & HIPAA Primer",
      filename: "healthcare-practice-primer.txt",
      content: `HEALTHCARE PRACTICE METRICS & HIPAA PRIMER

KEY FINANCIAL METRICS:
Revenue Per Visit: Total collections / total patient visits. Varies by specialty.
Collections Rate: Cash collected / charges posted. Target: 95%+.
Payer Mix: Percentage of revenue by payer type (commercial, Medicare, Medicaid, self-pay).
Overhead Ratio: Total operating expenses / total collections. MGMA benchmark: 55-65%.
A/R Aging: Accounts receivable by days outstanding. Target: <35 days average.
Denial Rate: Claims denied / claims submitted. Target: <5%.
RVU (Relative Value Unit): Standard measure of physician work and practice expense.
No-Show Rate: Missed appointments / scheduled appointments. Target: <10%.

OPERATIONAL METRICS:
Patients Per Provider Per Day: Varies by specialty. Primary care: 20-25. Specialists: 15-20.
Scheduling Utilization: Scheduled slots / available slots. Target: 85%+.
Average Wait Time: Arrival to provider encounter. Target: <15 minutes.
Patient Satisfaction: Press Ganey or similar scores. Above 90th percentile is excellent.
New Patient Ratio: New patients / total patients. Healthy: 15-25% depending on specialty.

HIPAA COMPLIANCE:
Protected Health Information (PHI): Any individually identifiable health information.
Minimum Necessary Rule: Only access/disclose the minimum PHI necessary for the task.
Business Associate Agreements (BAAs): Required for any vendor handling PHI.
Breach Notification: Must notify affected individuals within 60 days of discovering a breach.
Patient Rights: Access, amendment, accounting of disclosures, restriction requests.
AI/Technology Note: Any AI system handling patient data must have a BAA and appropriate safeguards.`,
    },
  ],
};
