// Deterministic reimplementation of agents/lead-classifier.md's "enrichment disabled"
// path (headline/location text matching only — Abbreviated Mode never enriches, so
// current_title/current_company/industry are always null here, exactly like the LLM
// classifier's own documented fallback for that case).
//
// Known approximation gaps vs. the LLM classifier (see standalone/README.md):
//   - role "exact vs. adjacent vs. generic-founder" nuance -> collapsed to substring match
//   - "clearly retail/DTC end-client" penalty -> only applied if the criteria file defines
//     an `end_client_keywords` array; skipped otherwise (most criteria files don't have one)
//   - free-text headline segmentation -> plain substring search, no parsing of "X at Y"

function norm(s) {
  return (s || "").toLowerCase();
}

function anyMatch(haystack, needles = []) {
  const h = norm(haystack);
  return needles.find((n) => n && h.includes(norm(n))) || null;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Excluded-employer detection needs to be an EMPLOYER match, not a bare mention —
// "NetSuite Consulting and Support" or "Helping businesses get more from NetSuite"
// are domain signals (this person works ON NetSuite, for a partner), not proof they
// work AT NetSuite/Oracle/Shopify. Require an "at/@/with <employer>" context, per
// agents/lead-classifier.md's own examples ("at Oracle", "@ Shopify", "at NetSuite").
function anyEmployerMatch(haystack, employers = []) {
  const h = norm(haystack);
  for (const employer of employers) {
    if (!employer) continue;
    const re = new RegExp(`(^|[^a-z0-9])(at|@|with)\\s+(the\\s+)?${escapeRegex(norm(employer))}\\b`, "i");
    if (re.test(h)) return employer;
  }
  return null;
}

function countMatches(haystack, needles = []) {
  const h = norm(haystack);
  return needles.filter((n) => n && h.includes(norm(n))).length;
}

export function classifyLead(lead, criteria) {
  const headline = lead.headline || "";
  const location = lead.location || "";
  const text = `${headline} ${lead.name || ""}`; // company/title are null in abbreviated mode

  const weights = criteria.scoring_weights || {
    role_match: 0.3,
    industry_match: 0.3,
    seniority_match: 0.25,
    location_match: 0.1,
    company_size_match: 0.05,
  };
  const thresholds = criteria.classification_thresholds || { hot: 75, warm: 45 };

  // --- Gate: hard cold-caps, checked before any scoring ---
  const excludedEmployerHit = anyEmployerMatch(text, criteria.excluded_employers);
  if (excludedEmployerHit) {
    return finalize(25, "cold", `excluded employer match: "${excludedEmployerHit}"`, thresholds);
  }
  const excludedCompanyHit = anyMatch(text, criteria.excluded_companies);
  if (excludedCompanyHit) {
    return finalize(25, "cold", `excluded company match: "${excludedCompanyHit}"`, thresholds);
  }
  const domainSignalHit = anyMatch(text, criteria.company_type_signals);
  if (!domainSignalHit) {
    return finalize(25, "cold", "no company_type_signals match in headline", thresholds);
  }

  // --- Weighted score ---
  const roleHit = anyMatch(text, criteria.target_roles);
  const roleMatch = roleHit ? 1.0 : 0.0;

  const industryHit = anyMatch(text, criteria.target_industries);
  const industryMatch = industryHit ? 1.0 : domainSignalHit ? 0.5 : 0.0;

  const seniorityHit = anyMatch(text, criteria.seniority_signals);
  const seniorityMatch = seniorityHit ? 1.0 : 0.0;

  const locationHit = anyMatch(location, criteria.target_locations);
  const locationMatch = locationHit ? 1.0 : location ? 0.0 : 0.3; // no location data at all: mild neutral credit

  const companySizeMatch = 0.5; // no employee-count data available in abbreviated mode

  let score =
    roleMatch * (weights.role_match || 0) * 100 +
    industryMatch * (weights.industry_match || 0) * 100 +
    seniorityMatch * (weights.seniority_match || 0) * 100 +
    locationMatch * (weights.location_match || 0) * 100 +
    companySizeMatch * (weights.company_size_match || 0) * 100;

  const rationaleParts = [`domain signal "${domainSignalHit}"`];

  // --- Modifiers ---
  const referenceHit = anyMatch(text, criteria.reference_companies);
  const signalCount = countMatches(text, criteria.company_type_signals);
  if (referenceHit || signalCount >= 2) {
    score += 15;
    rationaleParts.push(referenceHit ? `agency boost (reference company "${referenceHit}")` : `agency boost (${signalCount} platform signals)`);
  }

  if (Array.isArray(criteria.end_client_keywords) && criteria.end_client_keywords.length) {
    const endClientHit = anyMatch(text, criteria.end_client_keywords);
    if (endClientHit) {
      score -= 25;
      rationaleParts.push(`end-client penalty ("${endClientHit}")`);
    }
  }

  let cappedByAntiPattern = false;
  const antiHit = anyMatch(text, criteria.anti_patterns);
  if (antiHit) {
    score = Math.min(score, 20);
    cappedByAntiPattern = true;
    rationaleParts.push(`anti-pattern cap ("${antiHit}")`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const classification = score >= thresholds.hot ? "hot" : score >= thresholds.warm ? "warm" : "cold";

  if (!cappedByAntiPattern) {
    rationaleParts.push(`role=${roleMatch} industry=${industryMatch} seniority=${seniorityMatch} location=${locationMatch}`);
  }

  return { score, classification, score_rationale: rationaleParts.join("; ") };
}

function finalize(score, classification, reason, thresholds) {
  // A gate hit still respects the criteria's own thresholds in the edge case where
  // "warm" is configured at or below the gate cap — but in every criteria file seen,
  // warm >= 45 > 25, so this always lands cold in practice.
  const cls = score >= thresholds.hot ? "hot" : score >= thresholds.warm ? "warm" : classification;
  return { score, classification: cls, score_rationale: reason };
}
