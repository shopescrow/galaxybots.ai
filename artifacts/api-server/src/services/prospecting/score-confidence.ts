export function scoreConfidence(data: any, config: any) {
  let score = 0;
  const breakdown: any = {};
  const issues: string[] = [];

  const weights = {
    email: parseFloat(config.emailWeight || "0.25"),
    phone: parseFloat(config.phoneWeight || "0.25"),
    domain: parseFloat(config.domainWeight || "0.20"),
    social: parseFloat(config.socialWeight || "0.15"),
    name: parseFloat(config.nameWeight || "0.15"),
  };

  if (data.email) {
    breakdown.email = weights.email;
    score += weights.email;
  } else {
    breakdown.email = 0;
    issues.push("Missing email");
  }

  if (data.phone) {
    breakdown.phone = weights.phone;
    score += weights.phone;
  } else {
    breakdown.phone = 0;
    issues.push("Missing phone");
  }

  if (data.domain) {
    breakdown.domain = weights.domain;
    score += weights.domain;
  } else {
    breakdown.domain = 0;
    issues.push("Missing domain");
  }

  if (data.socialLinks && Object.keys(data.socialLinks).length > 0) {
    breakdown.social = weights.social;
    score += weights.social;
  } else {
    breakdown.social = 0;
    issues.push("Missing social links");
  }

  if (data.companyName) {
    breakdown.name = weights.name;
    score += weights.name;
  } else {
    breakdown.name = 0;
    issues.push("Missing company name");
  }

  return { score: Math.min(score, 1.0), breakdown, issues };
}
